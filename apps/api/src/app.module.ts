import { BillingModule } from './modules/billing/billing.module';
import { OrderItemsModule } from './modules/order-items/order-items.module';
import { CommerceModule } from './modules/checkout/commerce.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { RefundsModule } from './modules/refunds/refunds.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { DomainContactsModule } from './modules/domain-contacts/domain-contacts.module';
import { DomainRegistrationModule } from './modules/domain-registration/domain-registration.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CartModule } from './modules/cart/cart.module';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CoreModule } from './common/core.module';
import { SecurityGuard } from './common/security';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { MembershipsModule } from './modules/memberships/memberships.module';
import { RolesModule } from './modules/roles/roles.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { AuditModule } from './modules/audit/audit.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AdminModule } from './modules/admin/admin.module';
import { HealthModule } from './modules/health/health.module';
import { DomainsModule } from './modules/domains/domains.module';
import { RegistrarsModule } from './modules/registrars/registrars.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
@Module({
  imports: [
    CoreModule,
    BillingModule,
    OrderItemsModule,
    CommerceModule,
    CheckoutModule,
    RefundsModule,
    InvoicesModule,
    DomainContactsModule,
    DomainRegistrationModule,

    CatalogModule,
    CartModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    MembershipsModule,
    RolesModule,
    PermissionsModule,
    SessionsModule,
    AuditModule,
    NotificationsModule,
    AdminModule,
    HealthModule,
    DomainsModule,
    RegistrarsModule,
    PricingModule,
    OrdersModule,
    PaymentsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: SecurityGuard }],
})
export class AppModule {}
