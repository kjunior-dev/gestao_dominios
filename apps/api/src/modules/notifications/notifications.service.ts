import { Inject } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database.service';
import { RuntimeService } from '../../common/runtime.service';
import { encrypt } from '../../common/crypto';
@Injectable()
export class NotificationsService {
 constructor(@Inject(DatabaseService) private db:DatabaseService,@Inject(RuntimeService) private runtime:RuntimeService){}
 async enqueue(userId:string,type:string,subject:string,link?:string){const notification=await this.db.notification.create({data:{userId,type,subject,encryptedPayload:link?encrypt(JSON.stringify({link}),this.runtime.env.TOTP_ENCRYPTION_KEY,'notification'):null}});await this.dispatch(notification.id);return notification;}
 async dispatch(id:string){await this.runtime.notifications.add('deliver',{notificationId:id},{jobId:id});}
}
