import { Inject } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@devtrust/database';
import { DatabaseService } from '../../common/database.service';
const allowed=new Set(['role','status','previousRole','previousStatus','memberId','sessionId','count']);
export function safeMetadata(value:Record<string,unknown>){return Object.fromEntries(Object.entries(value).filter(([key,v])=>allowed.has(key) && ['string','number','boolean'].includes(typeof v))) as Prisma.InputJsonObject;}
@Injectable()
export class AuditService {constructor(@Inject(DatabaseService) private db:DatabaseService){}async record(action:string,resourceType:string,actorUserId?:string,resourceId?:string,organizationId?:string,metadata:Record<string,unknown>={},tx:Prisma.TransactionClient=this.db){await tx.auditLog.create({data:{action,resourceType,actorUserId,resourceId,organizationId,metadata:safeMetadata(metadata)}});}}
