import { Inject } from '@nestjs/common';
import {Injectable,ForbiddenException} from '@nestjs/common';
import {Prisma} from '@devtrust/database';
import {organizationPermissions,Permission,globalPermissions} from '@devtrust/contracts';
import {DatabaseService} from '../../common/database.service';
@Injectable() export class AuthorizationService {
 constructor(@Inject(DatabaseService) private db:DatabaseService){}
 async organization(userId:string,id:string,permission:Permission,tx:Prisma.TransactionClient=this.db){const member=await tx.organizationMember.findUnique({where:{userId_organizationId:{userId,organizationId:id}},include:{organization:true}});if(!member || member.organization.status!=='ACTIVE' || !organizationPermissions[member.role].includes(permission))throw new ForbiddenException('Sem permissão nesta organização');return member;}
 global(role:keyof typeof globalPermissions,permission:Permission){return globalPermissions[role].includes(permission);}
}
