import { AccountScoped } from '../../common/security';
import { Inject } from '@nestjs/common';
import {
  Controller,
  Get,
  Delete,
  Param,
  Req,
  ParseUUIDPipe,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthRequest } from '../../common/security';
import { DatabaseService } from '../../common/database.service';
import { AuditService } from '../audit/audit.service';
@ApiTags('Sessions')
@AccountScoped()
@Controller('sessions')
export class SessionsController {
  constructor(
    @Inject(DatabaseService) private db: DatabaseService,
    @Inject(AuditService) private audit: AuditService,
  ) {}
  @Get() list(@Req() req: AuthRequest) {
    return this.db.session.findMany({
      where: {
        userId: req.user.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        userAgent: true,
        ipAddress: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
  @Delete(':id') async revoke(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.db.$transaction(async (tx) => {
      const result = await tx.session.updateMany({
        where: { id, userId: req.user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (!result.count) throw new NotFoundException('Sessão não encontrada');
      await this.audit.record(
        'sessions.revoked',
        'Session',
        req.user.id,
        id,
        undefined,
        {},
        tx,
      );
    });
    return { message: 'Sessão revogada' };
  }
}
