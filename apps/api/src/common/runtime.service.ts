import { Injectable,OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { Queue } from 'bullmq';
import pino from 'pino';
import { environment } from '../config/environment';
@Injectable()
export class RuntimeService implements OnModuleDestroy {
 readonly env=environment();readonly logger=pino({redact:['password','token','secret','req.headers.cookie','req.headers.authorization']});
 readonly redis=new Redis(this.env.REDIS_URL,{maxRetriesPerRequest:1});
 readonly notifications=new Queue('notifications',{connection:{url:this.env.REDIS_URL},defaultJobOptions:{attempts:3,backoff:{type:'exponential',delay:1000},removeOnComplete:1000,removeOnFail:1000}});
 constructor(){this.redis.on('error',()=>this.logger.error({event:'redis.connection.error'}));}
 async onModuleDestroy(){await this.notifications.close();await this.redis.quit();}
}
