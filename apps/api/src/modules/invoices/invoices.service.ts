import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { internalReceiptPdf } from '@devtrust/commerce';
import { DatabaseService } from '../../common/database.service';
import {
  CommerceAccessService,
  serialize,
} from '../checkout/commerce-access.service';
@Injectable()
export class InvoicesService {
  constructor(
    @Inject(DatabaseService) private db: DatabaseService,
    @Inject(CommerceAccessService) private access: CommerceAccessService,
  ) {}
  async get(userId: string, id: string) {
    const invoice = await this.db.invoice.findUnique({
      where: { id },
      include: { order: { include: { items: true } } },
    });
    if (!invoice) throw new NotFoundException('Documento não encontrado');
    await this.access.order(userId, invoice.orderId);
    return invoice;
  }
  async view(userId: string, id: string) {
    const invoice = await this.get(userId, id);
    return serialize({ ...invoice, order: undefined });
  }
  async pdf(userId: string, id: string) {
    const invoice = await this.get(userId, id),
      o = invoice.order;
    return internalReceiptPdf({
      number: invoice.invoiceNumber,
      orderNumber: o.orderNumber,
      environment: o.environment,
      legalName: (o.billingSnapshot as { legalName: string }).legalName,
      lines: o.items.map((i) => ({
        domainName: i.domainName,
        years: i.registrationYears,
        priceMinor: i.salePriceMinor.toString(),
      })),
      subtotalMinor: invoice.subtotalMinor.toString(),
      taxMinor: invoice.taxMinor.toString(),
      totalMinor: invoice.totalMinor.toString(),
      currency: invoice.currency,
    });
  }
}
