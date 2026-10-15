import {
  Controller,
  Get,
  Post,
  Patch,
  Inject,
  Req,
  Query,
  Param,
  Body,
  ParseUUIDPipe,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod/v3';
import { commerceListSchema, refundDecisionSchema } from '@devtrust/contracts';
import {
  OrderStatus,
  PaymentStatus,
  RegistrationStatus,
  RefundStatus,
} from '@devtrust/database';
import { outbox, lock, notificationTemplate } from '@devtrust/commerce';
import { AuthRequest, RequirePermission } from '../../common/security';
import { DatabaseService } from '../../common/database.service';
import { RuntimeService } from '../../common/runtime.service';
import { SchemaPipe } from '../../common/validation.pipe';
import { ApiInput } from '../../common/openapi';
import { digest } from '../../common/crypto';
import { serialize } from '../checkout/commerce-access.service';
import { RefundsService } from '../refunds/refunds.service';
const reasonSchema = z
  .object({ reason: z.string().trim().min(10).max(500) })
  .strict();
const policySchema = z
  .object({
    registrarId: z.string().uuid(),
    approved: z.boolean(),
    requiresAdditionalData: z.boolean(),
  })
  .strict();
@ApiTags('Sales administration')
@Controller('admin')
export class CommerceAdminController {
  constructor(
    @Inject(DatabaseService) private db: DatabaseService,
    @Inject(RuntimeService) private runtime: RuntimeService,
    @Inject(RefundsService) private refunds: RefundsService,
  ) {}
  @Get('orders') @RequirePermission('orders.read') async orders(
    @Query(new SchemaPipe(commerceListSchema))
    q: z.infer<typeof commerceListSchema>,
  ) {
    if (
      q.status &&
      !Object.values(OrderStatus).includes(q.status as OrderStatus)
    )
      throw new BadRequestException('Estado inválido');
    const where = {
      ...(q.status ? { status: q.status as OrderStatus } : {}),
      ...(q.environment ? { environment: q.environment } : {}),
      orderNumber: { contains: q.search, mode: 'insensitive' as const },
    };
    return {
      items: serialize(
        await this.db.order.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
      ),
      total: await this.db.order.count({ where }),
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  @Get('orders/:id') @RequirePermission('orders.read') async order(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return serialize(
      await this.db.order.findUniqueOrThrow({
        where: { id },
        include: {
          items: { include: { registration: true } },
          payments: { include: { refunds: true } },
          invoices: true,
          transitions: { orderBy: { createdAt: 'asc' } },
        },
      }),
    );
  }
  @Get('payments') @RequirePermission('payments.read') async payments(
    @Query(new SchemaPipe(commerceListSchema))
    q: z.infer<typeof commerceListSchema>,
  ) {
    if (
      q.status &&
      !Object.values(PaymentStatus).includes(q.status as PaymentStatus)
    )
      throw new BadRequestException('Estado inválido');
    const where = {
      ...(q.status ? { status: q.status as PaymentStatus } : {}),
      ...(q.environment ? { environment: q.environment } : {}),
      providerPaymentId: { contains: q.search, mode: 'insensitive' as const },
    };
    return {
      items: serialize(
        await this.db.payment.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
      ),
      total: await this.db.payment.count({ where }),
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  @Get('registrations')
  @RequirePermission('domains.manage')
  async registrations(
    @Query(new SchemaPipe(commerceListSchema))
    q: z.infer<typeof commerceListSchema>,
  ) {
    if (
      q.status &&
      !Object.values(RegistrationStatus).includes(
        q.status as RegistrationStatus,
      )
    )
      throw new BadRequestException('Estado inválido');
    const where = {
      ...(q.status ? { status: q.status as RegistrationStatus } : {}),
      item: {
        domainName: { contains: q.search, mode: 'insensitive' as const },
        ...(q.environment ? { order: { environment: q.environment } } : {}),
      },
    };
    return {
      items: serialize(
        await this.db.domainRegistration.findMany({
          where,
          include: { item: { select: { domainName: true, orderId: true } } },
          orderBy: { requestedAt: 'desc' },
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
      ),
      total: await this.db.domainRegistration.count({ where }),
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  @Get('refunds') @RequirePermission('refunds.approve') async refundList(
    @Query(new SchemaPipe(commerceListSchema))
    q: z.infer<typeof commerceListSchema>,
  ) {
    if (
      q.status &&
      !Object.values(RefundStatus).includes(q.status as RefundStatus)
    )
      throw new BadRequestException('Estado inválido');
    const where = {
      ...(q.status ? { status: q.status as RefundStatus } : {}),
      reason: { contains: q.search, mode: 'insensitive' as const },
      ...(q.environment ? { payment: { environment: q.environment } } : {}),
    };
    return {
      items: serialize(
        await this.db.refund.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
      ),
      total: await this.db.refund.count({ where }),
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  @Post('refunds/:id/decision')
  @RequirePermission('refunds.approve')
  @ApiInput(refundDecisionSchema)
  decide(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new SchemaPipe(refundDecisionSchema))
    b: z.infer<typeof refundDecisionSchema>,
  ) {
    return this.refunds.decide(r.user.id, id, b);
  }
  @Get('operations') @RequirePermission('operations.manage') async operations(
    @Query(new SchemaPipe(commerceListSchema))
    q: z.infer<typeof commerceListSchema>,
  ) {
    const where = { topic: { contains: q.search } };
    return {
      items: serialize(
        await this.db.commerceOutbox.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
      ),
      total: await this.db.commerceOutbox.count({ where }),
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  @Post('operations/:id/retry')
  @RequirePermission('operations.manage')
  @ApiInput(reasonSchema)
  async retry(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new SchemaPipe(reasonSchema)) b: z.infer<typeof reasonSchema>,
  ) {
    return this.db.$transaction(async (tx) => {
      const original = await tx.commerceOutbox.findUniqueOrThrow({
        where: { id },
      });
      const p = original.payload as { registrationId?: string };
      const topic =
        original.topic === 'domain-registration'
          ? 'domain-reconciliation'
          : original.topic;
      const replacement = await outbox(
        tx,
        topic,
        'admin-retry-' + id + '-' + Date.now(),
        original.payload as { [key: string]: string },
      );
      await tx.auditLog.create({
        data: {
          actorUserId: r.user.id,
          action: 'operation.recovery_requested',
          resourceType: 'CommerceOutbox',
          resourceId: replacement.id,
          metadata: {
            reason: b.reason,
            originalId: id,
            reconciliationOnly: Boolean(p.registrationId),
          },
        },
      });
      return replacement;
    });
  }
  @Patch('tlds/:id/registration-policy')
  @RequirePermission('registrations.manage')
  @ApiInput(policySchema)
  async policy(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new SchemaPipe(policySchema)) b: z.infer<typeof policySchema>,
  ) {
    return this.db.$transaction(async (tx) => {
      const link = await tx.tldRegistrar.update({
        where: { tldId_registrarId: { tldId: id, registrarId: b.registrarId } },
        data: {
          registrationPolicy: {
            approved: b.approved,
            requiresAdditionalData: b.requiresAdditionalData,
          },
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: r.user.id,
          action: 'tld.registration_policy_changed',
          resourceType: 'Tld',
          resourceId: id,
          metadata: {
            registrarId: b.registrarId,
            approved: b.approved,
            requiresAdditionalData: b.requiresAdditionalData,
          },
        },
      });
      return link;
    });
  }
  @Post('registrations/:id/resume')
  @RequirePermission('registrations.manage')
  @ApiInput(reasonSchema)
  async resume(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new SchemaPipe(reasonSchema)) b: z.infer<typeof reasonSchema>,
  ) {
    return this.db.$transaction(async (tx) => {
      await lock(tx, 'registration:' + id);
      const registration = await tx.domainRegistration.findUniqueOrThrow({
        where: { id },
        include: { item: { include: { order: true } } },
      });
      if (
        registration.attemptCount !== 0 ||
        registration.externalRegistrationId ||
        !['BLOCKED', 'MANUAL_REVIEW', 'FAILED'].includes(registration.status)
      )
        throw new ConflictException(
          'Uma operação já submetida exige reconciliação; não pode ser repetida.',
        );
      await tx.domainRegistration.update({
        where: { id },
        data: { status: 'READY', lastErrorCode: null },
      });
      await tx.orderItem.update({
        where: { id: registration.orderItemId },
        data: { status: 'READY' },
      });
      const work = await outbox(
        tx,
        'domain-registration',
        'resume-' + id + '-' + Date.now(),
        { registrationId: id },
      );
      await tx.auditLog.create({
        data: {
          actorUserId: r.user.id,
          organizationId: registration.item.order.organizationId,
          action: 'registration.safe_resume',
          resourceType: 'DomainRegistration',
          resourceId: id,
          metadata: { reason: b.reason },
        },
      });
      return work;
    });
  }
  @Get('invoices') @RequirePermission('billing.manage') async invoices(
    @Query(new SchemaPipe(commerceListSchema))
    q: z.infer<typeof commerceListSchema>,
  ) {
    const where = {
      invoiceNumber: { contains: q.search, mode: 'insensitive' as const },
      ...(q.environment ? { order: { environment: q.environment } } : {}),
    };
    return {
      items: serialize(
        await this.db.invoice.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
      ),
      total: await this.db.invoice.count({ where }),
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  @Get('sales') @RequirePermission('payments.read') async sales() {
    const [
      orders,
      registrations,
      received,
      refunds,
      costs,
      margins,
      refundGroups,
    ] = await Promise.all([
      this.db.order.groupBy({ by: ['environment', 'status'], _count: true }),
      this.db
        .$queryRaw`SELECT o."environment", r."status", COUNT(*)::int AS "_count" FROM "DomainRegistration" r JOIN "OrderItem" i ON i."id"=r."orderItemId" JOIN "Order" o ON o."id"=i."orderId" GROUP BY o."environment",r."status"`,
      this.db.payment.groupBy({
        by: ['environment', 'currency', 'provider'],
        where: { paidAt: { not: null } },
        _sum: { amountMinor: true },
        _count: true,
      }),
      this.db.refund.groupBy({
        by: ['currency'],
        where: { status: 'COMPLETED', payment: { environment: 'LIVE' } },
        _sum: { amountMinor: true },
      }),
      this.db.orderItem.groupBy({
        by: ['supplierCurrency'],
        where: { status: 'COMPLETED', order: { environment: 'LIVE' } },
        _sum: { supplierCostMinor: true },
      }),
      this.db
        .$queryRaw`SELECT o."environment", i."currency", SUM(i."salePriceMinor")::text AS "salesMinor", SUM(CEIL(i."supplierCostMinor"::numeric * (i."quoteSnapshot"->>'exchangeRate')::numeric))::text AS "convertedCostMinor", (SUM(i."salePriceMinor") - SUM(CEIL(i."supplierCostMinor"::numeric * (i."quoteSnapshot"->>'exchangeRate')::numeric)))::text AS "grossMarginMinor" FROM "OrderItem" i JOIN "Order" o ON o."id"=i."orderId" WHERE i."status"='COMPLETED' GROUP BY o."environment",i."currency"`,
      this.db.$queryRaw<
        {
          environment: string;
          currency: string;
          provider: string;
          amountMinor: string;
        }[]
      >`SELECT p."environment", p."currency", p."provider", SUM(r."amountMinor")::text AS "amountMinor" FROM "Refund" r JOIN "Payment" p ON p."id"=r."paymentId" WHERE r."status"='COMPLETED' GROUP BY p."environment",p."currency",p."provider"`,
    ]);
    const netReceived = received.map((p) => {
      const refunded =
        refundGroups.find(
          (r) =>
            r.environment === p.environment &&
            r.currency === p.currency &&
            r.provider === p.provider,
        )?.amountMinor || '0';
      return {
        ...p,
        refundedMinor: refunded,
        netReceivedMinor: (
          BigInt(p._sum.amountMinor || 0) - BigInt(refunded)
        ).toString(),
      };
    });
    return serialize({
      orders,
      registrations,
      received: netReceived,
      refundsByEnvironment: refundGroups,
      liveRefunds: refunds,
      liveAcquisitionCosts: costs,
      completedGrossMargins: margins,
      marginPolicy:
        'Linhas registadas, antes de reembolsos e despesas gerais; conversão pelo câmbio histórico da cotação.',
      note: 'Montantes agrupados por ambiente e moeda; MOCK não é receita real. Margem entre moedas exige câmbio histórico.',
    });
  }
  @Get('notifications/preview/:type')
  @RequirePermission('system.manage')
  preview(@Param('type') type: string) {
    if (this.runtime.env.NODE_ENV === 'production')
      throw new ForbiddenException(
        'Pré-visualização apenas em desenvolvimento',
      );
    return notificationTemplate(type, 'DevTrust Domains — pré-visualização');
  }
  private configurationHash() {
    const e = this.runtime.env;
    return digest(
      JSON.stringify([
        e.PAYMENTS_MODE,
        e.DOMAIN_REGISTRATION_MODE,
        e.OPENPROVIDER_BASE_URL,
        e.LIVE_TRANSACTIONS_ENABLED,
      ]),
    );
  }
  @Post('live-approvals')
  @RequirePermission('system.manage')
  @ApiInput(reasonSchema)
  requestApproval(
    @Req() r: AuthRequest,
    @Body(new SchemaPipe(reasonSchema)) b: z.infer<typeof reasonSchema>,
  ) {
    return this.db.$transaction(async (tx) => {
      const approval = await tx.liveApproval.create({
        data: {
          requestedBy: r.user.id,
          reason: b.reason,
          configurationHash: this.configurationHash(),
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: r.user.id,
          action: 'live.approval_requested',
          resourceType: 'LiveApproval',
          resourceId: approval.id,
          metadata: { reason: b.reason },
        },
      });
      return approval;
    });
  }
  @Post('live-approvals/:id/approve')
  @RequirePermission('system.manage')
  async approve(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.$transaction(async (tx) => {
      await lock(tx, 'approval:' + id);
      const approval = await tx.liveApproval.findUniqueOrThrow({
        where: { id },
      });
      if (approval.requestedBy === r.user.id)
        throw new ForbiddenException('Exige um segundo administrador');
      if (
        approval.approvedBy ||
        approval.revokedAt ||
        approval.expiresAt <= new Date() ||
        approval.configurationHash !== this.configurationHash()
      )
        throw new ConflictException('Aprovação inválida ou expirada');
      const result = await tx.liveApproval.update({
        where: { id },
        data: { approvedBy: r.user.id },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: r.user.id,
          action: 'live.approval_signed',
          resourceType: 'LiveApproval',
          resourceId: id,
          metadata: {},
        },
      });
      return {
        ...result,
        liveReady: false,
        reason:
          'Gateway real ainda não aprovado; operações reais permanecem bloqueadas.',
      };
    });
  }
}
