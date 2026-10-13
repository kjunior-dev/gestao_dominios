import { Inject } from '@nestjs/common';
import {Controller,Get,Patch,Body,Req} from '@nestjs/common';
import {ApiTags,ApiBody} from '@nestjs/swagger';
import {z} from 'zod';
import {profileSchema} from '@devtrust/contracts';
import {DatabaseService} from '../../common/database.service';
import {AuthRequest} from '../../common/security';
import {SchemaPipe} from '../../common/validation.pipe';
import {AuthService} from '../auth/auth.service';
import {AuditService} from '../audit/audit.service';
@ApiTags('Users') @Controller('users') export class UsersController {
 constructor(@Inject(DatabaseService) private db:DatabaseService,@Inject(AuthService) private auth:AuthService,@Inject(AuditService) private audit:AuditService){}
 @Get('me') me(@Req() req:AuthRequest){return this.auth.publicUser(req.user.id);}
 @Patch('me') @ApiBody({schema:{type:'object',properties:{firstName:{type:'string'},lastName:{type:'string'},phone:{type:'string'}}}}) async update(@Req() req:AuthRequest,@Body(new SchemaPipe(profileSchema)) body:z.infer<typeof profileSchema>){await this.db.$transaction(async tx=>{await tx.user.update({where:{id:req.user.id},data:body});await this.audit.record('users.profile_updated','User',req.user.id,req.user.id,undefined,{},tx);});return this.auth.publicUser(req.user.id);}
}
