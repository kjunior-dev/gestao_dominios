import { Inject } from '@nestjs/common';
import { Injectable,BadRequestException,UnauthorizedException,ConflictException } from '@nestjs/common';
import { hash,verify,argon2id } from 'argon2';
import { authenticator } from 'otplib';
import { Prisma,User,TokenPurpose } from '@devtrust/database';
import { z } from 'zod';
import { registerSchema,loginSchema } from '@devtrust/contracts';
import { DatabaseService } from '../../common/database.service';
import { RuntimeService } from '../../common/runtime.service';
import { randomToken,digest,encrypt,decrypt } from '../../common/crypto';
import { AuthRequest,sensitive } from '../../common/security';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
export const publicSelect={id:true,email:true,firstName:true,lastName:true,phone:true,status:true,globalRole:true,emailVerifiedAt:true,createdAt:true,updatedAt:true} as const;
@Injectable()
export class AuthService {
 constructor(@Inject(DatabaseService) private db:DatabaseService,@Inject(RuntimeService) private runtime:RuntimeService,@Inject(AuditService) private audit:AuditService,@Inject(NotificationsService) private notifications:NotificationsService){}
 async publicUser(userId:string){const user=await this.db.user.findUniqueOrThrow({where:{id:userId},select:{...publicSelect,mfa:{select:{enabledAt:true}}}});const {mfa,...safe}=user;return {...safe,mfaEnabled:!!mfa?.enabledAt};}
 async register(input:z.infer<typeof registerSchema>){const passwordHash=await hash(input.password,{type:argon2id,memoryCost:65536,timeCost:3});const {password:_,...profile}=input;void _;
 const user=await this.db.$transaction(async tx=>{const user=await tx.user.create({data:{...profile,passwordHash}});await this.audit.record('auth.register','User',user.id,user.id,undefined,{},tx);return user;});
 await this.issue(user,'VERIFY_EMAIL');return this.publicUser(user.id);
 }
 async login(input:z.infer<typeof loginSchema>,req:AuthRequest){const key='login:'+digest(input.email);const attempts=Number(await this.runtime.redis.get(key)||0);if(attempts>=8)throw new UnauthorizedException('Credenciais inválidas ou conta temporariamente bloqueada');
 const failures=await this.runtime.redis.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],900) end; return n",1,key) as number;if(failures>8)throw new UnauthorizedException('Credenciais inválidas ou conta temporariamente bloqueada');
 const user=await this.db.user.findUnique({where:{email:input.email},include:{mfa:true}});
 // Run Argon2 even for unknown emails to reduce timing-based account enumeration.
 const dummy='$argon2id$v=19$m=65536,t=3,p=4$ZGV2dHJ1c3QtZHVtbXktaGFzaA$IdzFbpMKx8ntthcwQEKTyCIFkYpxmjtdTyZiGOBPX3M';
 const valid=await verify(user?.passwordHash || dummy,input.password).catch(()=>false);
 if(!user || !valid || user.status!=='ACTIVE')throw new UnauthorizedException('Credenciais inválidas');
 let mfaVerified=false;
 if(user.mfa?.enabledAt){if(!input.code || !(await this.verifySecondFactor(user.id,input.code)))throw new UnauthorizedException('Código MFA necessário ou inválido');mfaVerified=true;}
 const token=randomToken(),csrf=randomToken();await this.db.$transaction(async tx=>{await tx.session.create({data:{userId:user.id,tokenHash:digest(token),csrfHash:digest(csrf),mfaVerified,expiresAt:new Date(Date.now()+this.runtime.env.SESSION_TTL_HOURS*3600000),ipAddress:req.ip,userAgent:req.get('user-agent')?.slice(0,500)}});await this.audit.record('auth.login','User',user.id,user.id,undefined,{},tx);});await this.runtime.redis.del(key);
 return {token,csrf,user:await this.publicUser(user.id),mfaRequired:sensitive.includes(user.globalRole)&&!mfaVerified};
 }
 async issue(user:User,purpose:TokenPurpose){const raw=randomToken();await this.db.$transaction(async tx=>{await tx.verificationToken.updateMany({where:{userId:user.id,purpose,consumedAt:null},data:{consumedAt:new Date()}});await tx.verificationToken.create({data:{userId:user.id,purpose,tokenHash:digest(raw),expiresAt:new Date(Date.now()+(purpose==='RESET_PASSWORD'?30:1440)*60000)}});});const path=purpose==='RESET_PASSWORD'?'redefinir-password':'verificar-email';await this.notifications.enqueue(user.id,purpose,purpose==='RESET_PASSWORD'?'Recuperação de password':'Confirmação de email',this.runtime.env.APP_URL+'/'+path+'?token='+raw);}
 async forgot(email:string){const lock=await this.runtime.redis.set('recovery:'+digest(email),'1','EX',60,'NX');if(!lock)return;const user=await this.db.user.findUnique({where:{email}});if(user?.status==='ACTIVE')await this.issue(user,'RESET_PASSWORD');}
 async consume(raw:string,purpose:TokenPurpose,password?:string){const passwordHash=password?await hash(password,{type:argon2id,memoryCost:65536,timeCost:3}):undefined;
 await this.db.$transaction(async tx=>{const token=await tx.verificationToken.findUnique({where:{tokenHash:digest(raw)}});if(!token || token.purpose!==purpose || token.consumedAt || token.expiresAt<=new Date())throw new BadRequestException('Token inválido ou expirado');const claim=await tx.verificationToken.updateMany({where:{id:token.id,consumedAt:null,expiresAt:{gt:new Date()}},data:{consumedAt:new Date()}});if(claim.count!==1)throw new BadRequestException('Token já utilizado');await tx.user.update({where:{id:token.userId},data:purpose==='VERIFY_EMAIL'?{emailVerifiedAt:new Date()}:{passwordHash}});if(purpose==='RESET_PASSWORD'){await tx.session.updateMany({where:{userId:token.userId,revokedAt:null},data:{revokedAt:new Date()}});await tx.verificationToken.updateMany({where:{userId:token.userId,purpose,consumedAt:null},data:{consumedAt:new Date()}});}await this.audit.record('auth.'+purpose.toLowerCase(),'User',token.userId,token.userId,undefined,{},tx);});
 }
 async logout(req:AuthRequest,all=false){await this.db.$transaction(async tx=>{await tx.session.updateMany({where:all?{userId:req.user.id,revokedAt:null}:{id:req.session.id},data:{revokedAt:new Date()}});await this.audit.record(all?'auth.logout_all':'auth.logout','User',req.user.id,req.user.id,undefined,{},tx);});}
 async changePassword(req:AuthRequest,currentPassword:string,password:string){if(!await verify(req.user.passwordHash,currentPassword))throw new UnauthorizedException('Password atual incorreta');const passwordHash=await hash(password,{type:argon2id,memoryCost:65536,timeCost:3});await this.db.$transaction(async tx=>{await tx.user.update({where:{id:req.user.id},data:{passwordHash}});await tx.session.updateMany({where:{userId:req.user.id,revokedAt:null},data:{revokedAt:new Date()}});await this.audit.record('auth.password_changed','User',req.user.id,req.user.id,undefined,{},tx);});}
 async setupMfa(req:AuthRequest){const existing=await this.db.mfaCredential.findUnique({where:{userId:req.user.id}});if(existing?.enabledAt)throw new ConflictException('MFA já configurada');const secret=authenticator.generateSecret();await this.db.mfaCredential.upsert({where:{userId:req.user.id},create:{userId:req.user.id,encryptedSecret:encrypt(secret,this.runtime.env.TOTP_ENCRYPTION_KEY)},update:{encryptedSecret:encrypt(secret,this.runtime.env.TOTP_ENCRYPTION_KEY),lastUsedStep:null}});await this.audit.record('auth.mfa_setup','User',req.user.id,req.user.id);return {secret,uri:authenticator.keyuri(req.user.email,'DevTrust Domains',secret)};}
 async enableMfa(req:AuthRequest,code:string){const credential=await this.db.mfaCredential.findUnique({where:{userId:req.user.id}});if(!credential || credential.enabledAt)throw new BadRequestException('Inicie a configuração MFA');const secret=decrypt(credential.encryptedSecret,this.runtime.env.TOTP_ENCRYPTION_KEY);if(!authenticator.check(code,secret))throw new BadRequestException('Código inválido');const codes=Array.from({length:8},()=>randomToken().slice(0,24));await this.db.$transaction(async tx=>{const claimed=await tx.mfaCredential.updateMany({where:{id:credential.id,enabledAt:null,encryptedSecret:credential.encryptedSecret},data:{enabledAt:new Date(),lastUsedStep:BigInt(Math.floor(Date.now()/30000))}});if(claimed.count!==1)throw new ConflictException('Configuração alterada. Reinicie.');await tx.mfaRecoveryCode.deleteMany({where:{userId:req.user.id}});await tx.mfaRecoveryCode.createMany({data:codes.map(code=>({userId:req.user.id,codeHash:digest(code)}))});await tx.session.updateMany({where:{userId:req.user.id,id:{not:req.session.id},revokedAt:null},data:{revokedAt:new Date()}});await tx.session.update({where:{id:req.session.id},data:{mfaVerified:true}});await this.audit.record('auth.mfa_enabled','User',req.user.id,req.user.id,undefined,{},tx);});return {recoveryCodes:codes};}
 async verifySecondFactor(userId:string,code:string){const credential=await this.db.mfaCredential.findUnique({where:{userId}});if(!credential?.enabledAt)return false;
 if(/^\d{6}$/.test(code)){const secret=decrypt(credential.encryptedSecret,this.runtime.env.TOTP_ENCRYPTION_KEY);if(!authenticator.check(code,secret))return false;const step=BigInt(Math.floor(Date.now()/30000));const claim=await this.db.mfaCredential.updateMany({where:{id:credential.id,OR:[{lastUsedStep:null},{lastUsedStep:{lt:step}}]},data:{lastUsedStep:step}});return claim.count===1;}
 const recovery=await this.db.mfaRecoveryCode.updateMany({where:{userId,codeHash:digest(code),consumedAt:null},data:{consumedAt:new Date()}});if(recovery.count===1)await this.audit.record('auth.mfa_recovery_used','User',userId,userId);return recovery.count===1;
 }
}
