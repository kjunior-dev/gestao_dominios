import { Inject } from '@nestjs/common';
import {Controller,Post,Get,Body,Req,Res,HttpCode} from '@nestjs/common';
import {ApiTags,ApiOperation,ApiBody} from '@nestjs/swagger';
import type {Response} from 'express';
import {z} from 'zod';
import {registerSchema,loginSchema,emailSchema,resetSchema,tokenSchema,changePasswordSchema,mfaSchema} from '@devtrust/contracts';
import {SchemaPipe} from '../../common/validation.pipe';
import {Public,EnrollmentAllowed,AuthRequest,sessionCookie} from '../../common/security';
import {RuntimeService} from '../../common/runtime.service';
import {AuthService} from './auth.service';
const accepted={message:'Se a conta existir, receberá instruções de recuperação.'};
@ApiTags('Authentication') @Controller('auth')
export class AuthController {
 constructor(@Inject(AuthService) private auth:AuthService,@Inject(RuntimeService) private runtime:RuntimeService){}
 @Public() @Post('register') @ApiOperation({summary:'Registar utilizador CUSTOMER'}) @ApiBody({schema:{type:'object',required:['email','password','firstName','lastName'],properties:{email:{type:'string',format:'email'},password:{type:'string',minLength:12},firstName:{type:'string'},lastName:{type:'string'},phone:{type:'string'}}}})
 register(@Body(new SchemaPipe(registerSchema)) body:z.infer<typeof registerSchema>){return this.auth.register(body);}
 @Public() @Post('login') @HttpCode(200) @ApiBody({schema:{type:'object',required:['email','password'],properties:{email:{type:'string'},password:{type:'string'},code:{type:'string'}}}})
 async login(@Body(new SchemaPipe(loginSchema)) body:z.infer<typeof loginSchema>,@Req() req:AuthRequest,@Res({passthrough:true}) res:Response){const result=await this.auth.login(body,req);const production=this.runtime.env.NODE_ENV==='production';const options={secure:production,sameSite:'lax' as const,path:'/',maxAge:this.runtime.env.SESSION_TTL_HOURS*3600000};res.cookie(sessionCookie(production),result.token,{...options,httpOnly:true});res.cookie('dt_csrf',result.csrf,{...options,httpOnly:false});return {user:result.user,mfaRequired:result.mfaRequired};}
 @EnrollmentAllowed() @Get('me') me(@Req() req:AuthRequest){return this.auth.publicUser(req.user.id);}
 private clear(res:Response){const production=this.runtime.env.NODE_ENV==='production';const options={path:'/',secure:production,sameSite:'lax' as const};res.clearCookie(sessionCookie(production),options);res.clearCookie('dt_csrf',options);}
 @EnrollmentAllowed() @Post('logout') @HttpCode(200) async logout(@Req() req:AuthRequest,@Res({passthrough:true}) res:Response){await this.auth.logout(req);this.clear(res);return {message:'Sessão terminada'};}
 @EnrollmentAllowed() @Post('logout-all') @HttpCode(200) async logoutAll(@Req() req:AuthRequest,@Res({passthrough:true}) res:Response){await this.auth.logout(req,true);this.clear(res);return {message:'Sessões terminadas'};}
 @Public() @Post('forgot-password') @HttpCode(202) async forgot(@Body(new SchemaPipe(emailSchema)) body:z.infer<typeof emailSchema>){await this.auth.forgot(body.email);return accepted;}
 @Public() @Post('reset-password') @HttpCode(200) async reset(@Body(new SchemaPipe(resetSchema)) body:z.infer<typeof resetSchema>){await this.auth.consume(body.token,'RESET_PASSWORD',body.password);return {message:'Password atualizada. Inicie sessão novamente.'};}
 @Public() @Post('verify-email') @HttpCode(200) async verify(@Body(new SchemaPipe(tokenSchema)) body:z.infer<typeof tokenSchema>){await this.auth.consume(body.token,'VERIFY_EMAIL');return {message:'Email confirmado'};}
 @Post('resend-verification') @HttpCode(202) async resend(@Req() req:AuthRequest){const lock=await this.runtime.redis.set('verify:'+req.user.id,'1','EX',60,'NX');if(lock && !req.user.emailVerifiedAt)await this.auth.issue(req.user,'VERIFY_EMAIL');return {message:'Pedido recebido'};}
 @Post('change-password') @HttpCode(200) async change(@Req() req:AuthRequest,@Body(new SchemaPipe(changePasswordSchema)) body:z.infer<typeof changePasswordSchema>,@Res({passthrough:true}) res:Response){await this.auth.changePassword(req,body.currentPassword,body.password);this.clear(res);return {message:'Password alterada. Inicie sessão novamente.'};}
 @EnrollmentAllowed() @Post('mfa/setup') @HttpCode(200) setup(@Req() req:AuthRequest){return this.auth.setupMfa(req);}
 @EnrollmentAllowed() @Post('mfa/confirm') @HttpCode(200) confirm(@Req() req:AuthRequest,@Body(new SchemaPipe(mfaSchema)) body:z.infer<typeof mfaSchema>){return this.auth.enableMfa(req,body.code);}
}
