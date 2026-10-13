import { Inject } from '@nestjs/common';
import {Controller,Get,Post,Patch,Param,Body,Req,ParseUUIDPipe,BadRequestException,NotFoundException} from '@nestjs/common';
import {ApiTags,ApiBody} from '@nestjs/swagger';
import {Prisma} from '@devtrust/database';
import {z} from 'zod';
import {memberSchema,memberUpdateSchema} from '@devtrust/contracts';
import {DatabaseService} from '../../common/database.service';
import {AuthRequest} from '../../common/security';
import {SchemaPipe} from '../../common/validation.pipe';
import {AuthorizationService} from '../roles/authorization.service';
import {AuditService} from '../audit/audit.service';
import {publicSelect} from '../auth/auth.service';
@ApiTags('Memberships') @Controller('organizations/:id/members') export class MembershipsController {
 constructor(@Inject(DatabaseService) private db:DatabaseService,@Inject(AuthorizationService) private authorization:AuthorizationService,@Inject(AuditService) private audit:AuditService){}
 @Get() async list(@Req() req:AuthRequest,@Param('id',ParseUUIDPipe) id:string){await this.authorization.organization(req.user.id,id,'members.read');return this.db.organizationMember.findMany({where:{organizationId:id},include:{user:{select:publicSelect}},orderBy:{createdAt:'asc'}});}
 @Post() @ApiBody({schema:{type:'object',required:['email','role'],properties:{email:{type:'string'},role:{type:'string',enum:['OWNER','MANAGER','MEMBER']}}}}) async add(@Req() req:AuthRequest,@Param('id',ParseUUIDPipe) id:string,@Body(new SchemaPipe(memberSchema)) body:z.infer<typeof memberSchema>){return this.db.$transaction(async tx=>{await this.authorization.organization(req.user.id,id,'members.manage',tx);const user=await tx.user.findUnique({where:{email:body.email}});if(!user || user.status!=='ACTIVE')throw new BadRequestException('Utilizador não disponível para associação');const member=await tx.organizationMember.create({data:{userId:user.id,organizationId:id,role:body.role},include:{user:{select:publicSelect}}});await this.audit.record('members.added','OrganizationMember',req.user.id,member.id,id,{role:body.role},tx);return member;},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});}
 @Patch(':memberId') @ApiBody({schema:{type:'object',required:['role'],properties:{role:{type:'string',enum:['OWNER','MANAGER','MEMBER']}}}}) async update(@Req() req:AuthRequest,@Param('id',ParseUUIDPipe) id:string,@Param('memberId',ParseUUIDPipe) memberId:string,@Body(new SchemaPipe(memberUpdateSchema)) body:z.infer<typeof memberUpdateSchema>){return this.db.$transaction(async tx=>{await this.authorization.organization(req.user.id,id,'members.manage',tx);const member=await tx.organizationMember.findFirst({where:{id:memberId,organizationId:id}});if(!member)throw new NotFoundException('Membro não encontrado');if(member.role==='OWNER' && body.role!=='OWNER' && await tx.organizationMember.count({where:{organizationId:id,role:'OWNER'}})<=1)throw new BadRequestException('A organização deve manter pelo menos um OWNER');const updated=await tx.organizationMember.update({where:{id:memberId},data:{role:body.role},include:{user:{select:publicSelect}}});await this.audit.record('members.role_changed','OrganizationMember',req.user.id,memberId,id,{role:body.role,previousRole:member.role},tx);return updated;},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});}
}
