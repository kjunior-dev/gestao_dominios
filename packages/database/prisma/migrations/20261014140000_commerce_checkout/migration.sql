-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'PAYMENT_PROCESSING', 'PAID', 'PROVISIONING', 'COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "TransactionEnvironment" AS ENUM ('MOCK', 'SANDBOX', 'LIVE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'DECLINED', 'CANCELLED', 'UNKNOWN', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('READY', 'SUBMITTED', 'PENDING', 'UNKNOWN', 'COMPLETED', 'FAILED', 'MANUAL_REVIEW', 'BLOCKED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'UNKNOWN');

-- AlterTable
ALTER TABLE "TldRegistrar" ADD COLUMN     "registrationPolicy" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "BillingProfile" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "legalName" TEXT NOT NULL,
    "taxId" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "organizationId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "environment" "TransactionEnvironment" NOT NULL DEFAULT 'MOCK',
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "subtotalMinor" BIGINT NOT NULL,
    "feesMinor" BIGINT NOT NULL DEFAULT 0,
    "discountMinor" BIGINT NOT NULL DEFAULT 0,
    "taxMinor" BIGINT NOT NULL DEFAULT 0,
    "totalMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CVE',
    "billingSnapshot" JSONB NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "termsAcceptedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "tldId" UUID NOT NULL,
    "domainContactId" UUID NOT NULL,
    "domainName" TEXT NOT NULL,
    "operation" "DomainOperation" NOT NULL DEFAULT 'REGISTER',
    "registrationYears" INTEGER NOT NULL,
    "supplierCostMinor" BIGINT NOT NULL,
    "supplierCurrency" TEXT NOT NULL,
    "salePriceMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "quoteSnapshot" JSONB NOT NULL,
    "nameservers" JSONB NOT NULL,
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "premiumAccepted" BOOLEAN NOT NULL DEFAULT false,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'READY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderTransition" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "fromStatus" "OrderStatus" NOT NULL,
    "toStatus" "OrderStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "actorUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "environment" "TransactionEnvironment" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainContact" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "companyName" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phoneCountryCode" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "addressNumber" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "region" TEXT,
    "postalCode" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "contactType" TEXT NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrarContactMapping" (
    "id" UUID NOT NULL,
    "registrarId" UUID NOT NULL,
    "domainContactId" UUID NOT NULL,
    "externalHandle" TEXT,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'READY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistrarContactMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainRegistration" (
    "id" UUID NOT NULL,
    "orderItemId" UUID NOT NULL,
    "domainId" UUID,
    "registrarId" UUID NOT NULL,
    "externalRegistrationId" TEXT,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'READY',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT NOT NULL,
    "lastErrorCode" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DomainRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagedDomain" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "domainName" TEXT NOT NULL,
    "environment" "TransactionEnvironment" NOT NULL,
    "status" TEXT NOT NULL,
    "registeredAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManagedDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainExecution" (
    "id" UUID NOT NULL,
    "orderItemId" UUID NOT NULL,
    "operationType" TEXT NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'READY',
    "idempotencyKey" TEXT NOT NULL,
    "externalReference" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DomainExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INTERNAL',
    "subtotalMinor" BIGINT NOT NULL,
    "taxMinor" BIGINT NOT NULL,
    "totalMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "providerRefundId" TEXT,
    "requestedBy" UUID NOT NULL,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommerceOutbox" (
    "id" UUID NOT NULL,
    "topic" TEXT NOT NULL,
    "deduplicationKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommerceOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveApproval" (
    "id" UUID NOT NULL,
    "requestedBy" UUID NOT NULL,
    "approvedBy" UUID,
    "reason" TEXT NOT NULL,
    "configurationHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingProfile_organizationId_key" ON "BillingProfile"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE INDEX "Order_organizationId_createdAt_idx" ON "Order"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_customerId_idempotencyKey_key" ON "Order"("customerId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "OrderItem_orderId_domainName_key" ON "OrderItem"("orderId", "domainName");

-- CreateIndex
CREATE INDEX "OrderTransition_orderId_createdAt_idx" ON "OrderTransition"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerPaymentId_key" ON "Payment"("providerPaymentId");

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_orderId_provider_key" ON "Payment"("orderId", "provider");

-- CreateIndex
CREATE INDEX "PaymentEvent_processedAt_createdAt_idx" ON "PaymentEvent"("processedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_provider_providerEventId_key" ON "PaymentEvent"("provider", "providerEventId");

-- CreateIndex
CREATE INDEX "DomainContact_organizationId_idx" ON "DomainContact"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "RegistrarContactMapping_registrarId_domainContactId_key" ON "RegistrarContactMapping"("registrarId", "domainContactId");

-- CreateIndex
CREATE UNIQUE INDEX "DomainRegistration_orderItemId_key" ON "DomainRegistration"("orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "DomainRegistration_domainId_key" ON "DomainRegistration"("domainId");

-- CreateIndex
CREATE UNIQUE INDEX "DomainRegistration_idempotencyKey_key" ON "DomainRegistration"("idempotencyKey");

-- CreateIndex
CREATE INDEX "DomainRegistration_status_requestedAt_idx" ON "DomainRegistration"("status", "requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DomainRegistration_registrarId_externalRegistrationId_key" ON "DomainRegistration"("registrarId", "externalRegistrationId");

-- CreateIndex
CREATE INDEX "ManagedDomain_organizationId_idx" ON "ManagedDomain"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ManagedDomain_domainName_environment_key" ON "ManagedDomain"("domainName", "environment");

-- CreateIndex
CREATE UNIQUE INDEX "DomainExecution_idempotencyKey_key" ON "DomainExecution"("idempotencyKey");

-- CreateIndex
CREATE INDEX "DomainExecution_status_createdAt_idx" ON "DomainExecution"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_orderId_key" ON "Invoice"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_providerRefundId_key" ON "Refund"("providerRefundId");

-- CreateIndex
CREATE INDEX "Refund_status_createdAt_idx" ON "Refund"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_paymentId_idempotencyKey_key" ON "Refund"("paymentId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "CommerceOutbox_deduplicationKey_key" ON "CommerceOutbox"("deduplicationKey");

-- CreateIndex
CREATE INDEX "CommerceOutbox_publishedAt_createdAt_idx" ON "CommerceOutbox"("publishedAt", "createdAt");

-- CreateIndex
CREATE INDEX "LiveApproval_expiresAt_revokedAt_idx" ON "LiveApproval"("expiresAt", "revokedAt");

-- AddForeignKey
ALTER TABLE "BillingProfile" ADD CONSTRAINT "BillingProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_tldId_fkey" FOREIGN KEY ("tldId") REFERENCES "Tld"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_domainContactId_fkey" FOREIGN KEY ("domainContactId") REFERENCES "DomainContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderTransition" ADD CONSTRAINT "OrderTransition_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainContact" ADD CONSTRAINT "DomainContact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrarContactMapping" ADD CONSTRAINT "RegistrarContactMapping_registrarId_fkey" FOREIGN KEY ("registrarId") REFERENCES "Registrar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistrarContactMapping" ADD CONSTRAINT "RegistrarContactMapping_domainContactId_fkey" FOREIGN KEY ("domainContactId") REFERENCES "DomainContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainRegistration" ADD CONSTRAINT "DomainRegistration_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainRegistration" ADD CONSTRAINT "DomainRegistration_registrarId_fkey" FOREIGN KEY ("registrarId") REFERENCES "Registrar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainRegistration" ADD CONSTRAINT "DomainRegistration_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "ManagedDomain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagedDomain" ADD CONSTRAINT "ManagedDomain_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainExecution" ADD CONSTRAINT "DomainExecution_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "Order" ADD CONSTRAINT "order_nonnegative_totals" CHECK ("subtotalMinor" >= 0 AND "feesMinor" >= 0 AND "discountMinor" >= 0 AND "taxMinor" >= 0 AND "totalMinor" = "subtotalMinor" + "feesMinor" - "discountMinor" + "taxMinor" AND "totalMinor" >= 0);
ALTER TABLE "Payment" ADD CONSTRAINT "payment_nonnegative_amount" CHECK ("amountMinor" >= 0);
ALTER TABLE "Refund" ADD CONSTRAINT "refund_positive_amount" CHECK ("amountMinor" > 0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "order_item_valid_quote" CHECK ("salePriceMinor" >= 0 AND "supplierCostMinor" >= 0 AND "registrationYears" BETWEEN 1 AND 10);
