import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { z } from 'zod/v3';
import type { PrismaClient } from '@devtrust/database';
import { assertMock, CommerceConfig, CommerceError } from './config';
export type CreatePaymentRequest = {
  paymentId: string;
  orderId: string;
  amountMinor: string;
  currency: string;
  idempotencyKey: string;
};
export type CreatePaymentResult = {
  externalPaymentId: string;
  status: 'PENDING' | 'UNKNOWN';
  environment: 'MOCK' | 'SANDBOX' | 'LIVE';
};
export type PaymentStatusResult = {
  status: 'PAID' | 'DECLINED' | 'PENDING' | 'UNKNOWN';
  amountMinor: string;
  currency: string;
  orderId: string;
  externalPaymentId: string;
};
export type RefundPaymentRequest = {
  externalPaymentId: string;
  amountMinor: string;
  currency: string;
  idempotencyKey: string;
};
export type RefundResult = {
  status: 'COMPLETED' | 'UNKNOWN';
  externalRefundId: string;
};
export type WebhookVerificationRequest = {
  rawBody: Buffer;
  signature?: string;
  timestamp?: string;
};
export const paymentEventSchema = z
  .object({
    eventId: z.string().min(1).max(120),
    externalPaymentId: z.string().min(1).max(120),
    orderId: z.string().uuid(),
    amountMinor: z.string().regex(/^\d{1,15}$/),
    currency: z.enum(['CVE', 'EUR', 'USD']),
    status: z.enum(['PAID', 'DECLINED']),
  })
  .strict();
export type VerifiedPaymentEvent = z.infer<typeof paymentEventSchema> & {
  verified: true;
  payloadHash: string;
};
export interface PaymentProvider {
  readonly code: string;
  readonly supportsIdempotency?: { create: boolean; refund: boolean };
  createPayment(r: CreatePaymentRequest): Promise<CreatePaymentResult>;
  getPaymentStatus(id: string): Promise<PaymentStatusResult>;
  refundPayment(r: RefundPaymentRequest): Promise<RefundResult>;
  verifyWebhook(r: WebhookVerificationRequest): Promise<VerifiedPaymentEvent>;
}
export class MockPaymentProvider implements PaymentProvider {
  readonly code = 'mock';
  readonly supportsIdempotency = { create: true, refund: true };
  constructor(
    private config: CommerceConfig,
    private db?: PrismaClient,
  ) {}
  async createPayment(r: CreatePaymentRequest): Promise<CreatePaymentResult> {
    assertMock(this.config);
    return {
      externalPaymentId: 'mock-' + r.paymentId,
      status: 'PENDING',
      environment: 'MOCK',
    };
  }
  async getPaymentStatus(id: string): Promise<PaymentStatusResult> {
    assertMock(this.config);
    const p = await this.db?.payment.findUnique({
      where: { providerPaymentId: id },
      include: {
        events: {
          where: { verified: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!p) throw new CommerceError('PAYMENT_NOT_FOUND', 404);
    const event = p.events[0]
      ? paymentEventSchema.parse(p.events[0].payload)
      : null;
    return {
      externalPaymentId: id,
      orderId: p.orderId,
      amountMinor: p.amountMinor.toString(),
      currency: p.currency,
      status: p.paidAt ? 'PAID' : event?.status || 'PENDING',
    };
  }
  async refundPayment(r: RefundPaymentRequest): Promise<RefundResult> {
    assertMock(this.config);
    return {
      status: 'COMPLETED',
      externalRefundId: 'mock-refund-' + r.idempotencyKey,
    };
  }
  sign(rawBody: Buffer, timestamp: string) {
    if (!this.config.MOCK_WEBHOOK_SECRET)
      throw new CommerceError('MOCK_WEBHOOK_SECRET_REQUIRED', 503);
    return createHmac(
      'sha256',
      Buffer.from(this.config.MOCK_WEBHOOK_SECRET, 'hex'),
    )
      .update(timestamp + '.')
      .update(rawBody)
      .digest('hex');
  }
  async verifyWebhook(
    r: WebhookVerificationRequest,
  ): Promise<VerifiedPaymentEvent> {
    assertMock(this.config);
    if (
      !r.timestamp ||
      !/^\d{10}$/.test(r.timestamp) ||
      Math.abs(Date.now() / 1000 - Number(r.timestamp)) > 300 ||
      !r.signature ||
      !/^[a-f0-9]{64}$/.test(r.signature) ||
      r.rawBody.length > 16384
    )
      throw new CommerceError('INVALID_WEBHOOK', 401);
    const expected = this.sign(r.rawBody, r.timestamp);
    if (
      !timingSafeEqual(
        Buffer.from(r.signature, 'hex'),
        Buffer.from(expected, 'hex'),
      )
    )
      throw new CommerceError('INVALID_WEBHOOK', 401);
    let data;
    try {
      data = paymentEventSchema.parse(JSON.parse(r.rawBody.toString('utf8')));
    } catch {
      throw new CommerceError('INVALID_WEBHOOK_PAYLOAD', 400);
    }
    return {
      ...data,
      verified: true,
      payloadHash: createHash('sha256').update(r.rawBody).digest('hex'),
    };
  }
}
