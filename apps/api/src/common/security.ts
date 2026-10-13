import { Inject } from '@nestjs/common';
import {
  SetMetadata,
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { User, Session } from '@devtrust/database';
import { globalPermissions, Permission } from '@devtrust/contracts';
import { DatabaseService } from './database.service';
import { RuntimeService } from './runtime.service';
import { digest, equalHash } from './crypto';
export type AuthRequest = Request & { user: User; session: Session };
export const HealthProbe = () => SetMetadata('healthProbe', true);
export const AccountScoped = () => SetMetadata('scope', 'self');
export const OrganizationScoped = () => SetMetadata('scope', 'organization');
export const OptionalAccount = () => SetMetadata('optionalAccount', true);
export const Public = () => SetMetadata('public', true);
export const EnrollmentAllowed = () => SetMetadata('enrollment', true);
export const RequirePermission = (permission: Permission) =>
  SetMetadata('permission', permission);
export const sensitive = ['SUPER_ADMIN', 'ADMIN'];
export const sessionCookie = (production: boolean) =>
  production ? '__Host-dt_session' : 'dt_session';
@Injectable()
export class SecurityGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private reflector: Reflector,
    @Inject(DatabaseService) private db: DatabaseService,
    @Inject(RuntimeService) private runtime: RuntimeService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const handlers = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>('healthProbe', handlers))
      return true;
    const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (mutation && req.headers.origin !== this.runtime.env.APP_URL)
      throw new ForbiddenException('Origem do pedido inválida');
    const ip = req.ip || 'unknown',
      auth = mutation && req.path.includes('/auth/');
    const key = 'rate:' + digest(ip) + ':' + (auth ? 'auth' : req.method);
    const count = (await this.runtime.redis.eval(
      "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",
      1,
      key,
      60,
    )) as number;
    if (count > (auth ? 30 : 180))
      throw new HttpException('Demasiados pedidos. Tente mais tarde.', 429);
    if (this.reflector.getAllAndOverride<boolean>('public', handlers))
      return true;
    const token = (req.cookies as Record<string, string> | undefined)?.[
      sessionCookie(this.runtime.env.NODE_ENV === 'production')
    ];
    if (
      !token &&
      this.reflector.getAllAndOverride<boolean>('optionalAccount', handlers)
    )
      return true;
    if (!token || !/^[a-f0-9]{64}$/.test(token))
      throw new UnauthorizedException('Autenticação necessária');
    const session = await this.db.session.findUnique({
      where: { tokenHash: digest(token) },
      include: { user: true },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== 'ACTIVE'
    )
      throw new UnauthorizedException('Sessão inválida ou expirada');
    if (mutation) {
      const csrf = req.headers['x-csrf-token'];
      if (typeof csrf !== 'string' || !equalHash(csrf, session.csrfHash))
        throw new ForbiddenException('Proteção CSRF: pedido inválido');
    }
    req.user = session.user;
    req.session = session;
    if (
      sensitive.includes(req.user.globalRole) &&
      !session.mfaVerified &&
      !this.reflector.getAllAndOverride<boolean>('enrollment', handlers)
    )
      throw new ForbiddenException('Configure e confirme MFA para continuar');
    const permission = this.reflector.getAllAndOverride<Permission>(
      'permission',
      handlers,
    );
    if (
      !permission &&
      !this.reflector.getAllAndOverride<string>('scope', handlers) &&
      !this.reflector.getAllAndOverride<boolean>('enrollment', handlers)
    )
      throw new ForbiddenException('Autorização não declarada');
    if (
      permission &&
      !globalPermissions[req.user.globalRole].includes(permission)
    )
      throw new ForbiddenException('Sem permissão');
    await this.db.session.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    });
    return true;
  }
}
