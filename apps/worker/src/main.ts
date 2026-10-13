import 'dotenv/config';
import { Worker,Queue } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '@devtrust/database';
import {z} from 'zod';
import pino from 'pino';
import {processNotification} from './processor';
const env=z.object({DATABASE_URL:z.string().url(),REDIS_URL:z.string().url(),TOTP_ENCRYPTION_KEY:z.string().regex(/^[a-f0-9]{64}$/),NODE_ENV:z.enum(['development','test','production']).default('development'),DEV_MAILBOX_DIR:z.string().default('.local/mailbox')}).parse(process.env);
if(env.NODE_ENV==='production')throw new Error('Development notification transport is disabled in production. Configure a production transport in phase 2.');
const logger=pino(),db=new PrismaClient(),connection=new Redis(env.REDIS_URL,{maxRetriesPerRequest:null});
connection.on('error',()=>logger.error({event:'redis.connection.error'}));
const queue=new Queue('notifications',{connection:{url:env.REDIS_URL}});
const worker=new Worker('notifications',job=>processNotification(job.data,db,env.TOTP_ENCRYPTION_KEY,env.DEV_MAILBOX_DIR),{connection,concurrency:4});
worker.on('completed',job=>logger.info({event:'notification.processed',jobId:job.id,transport:'development'}));
worker.on('failed',(job)=>{logger.error({event:'notification.failed',jobId:job?.id,attempt:job?.attemptsMade});if(job && job.attemptsMade>=(job.opts.attempts||1))void db.notification.updateMany({where:{id:job.data.notificationId,status:{not:'SENT'}},data:{status:'FAILED'}}).catch(()=>logger.error({event:'notification.failure_record_failed'}));});
worker.on('error',()=>logger.error({event:'worker.error'}));
async function tick(){await connection.set('worker:heartbeat',new Date().toISOString(),'EX',30);const pending=await db.notification.findMany({where:{status:'PENDING',createdAt:{lt:new Date(Date.now()-5000)}},take:100});for(const n of pending)await queue.add('deliver',{notificationId:n.id},{jobId:n.id,attempts:3,backoff:{type:'exponential',delay:1000},removeOnComplete:1000,removeOnFail:1000});}
const timer=setInterval(()=>void tick().catch(()=>logger.error({event:'worker.health_failed'})),10000);void tick().catch(()=>logger.error({event:'worker.health_failed'}));
async function shutdown(){clearInterval(timer);await worker.close();await queue.close();await connection.del('worker:heartbeat');await connection.quit();await db.$disconnect();process.exit(0);}
process.on('SIGTERM',()=>void shutdown());process.on('SIGINT',()=>void shutdown());
