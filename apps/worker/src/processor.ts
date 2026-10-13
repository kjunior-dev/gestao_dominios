import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createDecipheriv} from 'node:crypto';
import type {PrismaClient} from '@devtrust/database';
import type {NotificationJob} from '@devtrust/contracts';
export function payload(value:string,key:string){const [iv,tag,body]=value.split('.').map(v=>Buffer.from(v,'base64'));const decipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);decipher.setAAD(Buffer.from('notification'));decipher.setAuthTag(tag);return JSON.parse(Buffer.concat([decipher.update(body),decipher.final()]).toString('utf8')) as {link:string};}
export async function processNotification(data:NotificationJob,db:PrismaClient,key:string,mailbox:string){const notification=await db.notification.findUniqueOrThrow({where:{id:data.notificationId},include:{user:{select:{email:true}}}});if(notification.status==='SENT')return {duplicate:true};const content=notification.encryptedPayload?payload(notification.encryptedPayload,key):{};await mkdir(resolve(mailbox),{recursive:true,mode:0o700});await writeFile(resolve(mailbox,notification.id+'.json'),JSON.stringify({transport:'DEVELOPMENT_ONLY',to:notification.user.email,subject:notification.subject,...content}),{mode:0o600});await db.notification.update({where:{id:notification.id},data:{status:'SENT',sentAt:new Date(),encryptedPayload:null}});return {duplicate:false};}
