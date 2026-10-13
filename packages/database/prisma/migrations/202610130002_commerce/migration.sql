-- CreateEnum
CREATE TYPE "RegistrarStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "DomainOperation" AS ENUM ('REGISTER', 'TRANSFER', 'RENEW');

-- CreateEnum
CREATE TYPE "MarginType" AS ENUM ('FIXED', 'MARKUP', 'GROSS_MARGIN');

-- CreateEnum
CREATE TYPE "CartStatus" AS ENUM ('OPEN', 'MERGED', 'EXPIRED');

-- CreateTable
CREATE TABLE "Registrar" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "RegistrarStatus" NOT NULL DEFAULT 'DISABLED',
    "configurationReference" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Registrar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tld" (
    "id" UUID NOT NULL,
    "extension" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tld_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TldRegistrar" (
    "id" UUID NOT NULL,
    "tldId" UUID NOT NULL,
    "registrarId" UUID NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "supportsRegistration" BOOLEAN NOT NULL DEFAULT false,
    "supportsTransfer" BOOLEAN NOT NULL DEFAULT false,
    "supportsRenewal" BOOLEAN NOT NULL DEFAULT false,
    "minimumPeriod" INTEGER NOT NULL DEFAULT 1,
    "maximumPeriod" INTEGER NOT NULL DEFAULT 10,
    "idnScript" TEXT,
    "lastSyncedAt" TIMESTAMP(3),

    CONSTRAINT "TldRegistrar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TldPrice" (
    "id" UUID NOT NULL,
    "tldId" UUID NOT NULL,
    "registrarId" UUID NOT NULL,
    "operation" "DomainOperation" NOT NULL DEFAULT 'REGISTER',
    "periodYears" INTEGER NOT NULL,
    "supplierCurrency" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CVE',
    "supplierCostMinor" BIGINT NOT NULL,
    "sellingPriceMinor" BIGINT NOT NULL,
    "marginType" "MarginType" NOT NULL,
    "marginValue" DECIMAL(20,8) NOT NULL,
    "minimumPriceMinor" BIGINT NOT NULL DEFAULT 0,
    "additionalCostMinor" BIGINT NOT NULL DEFAULT 0,
    "roundingIncrementMinor" BIGINT NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveUntil" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TldPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" UUID NOT NULL,
    "baseCurrency" TEXT NOT NULL,
    "targetCurrency" TEXT NOT NULL,
    "rate" DECIMAL(30,16) NOT NULL,
    "source" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainSearchLog" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "normalizedQuery" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "registrarCode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "cacheHit" BOOLEAN NOT NULL,
    "responseTimeMs" INTEGER NOT NULL,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainSearchLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cart" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "sessionIdentifier" TEXT,
    "csrfHash" TEXT,
    "status" "CartStatus" NOT NULL DEFAULT 'OPEN',
    "currency" TEXT NOT NULL DEFAULT 'CVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartItem" (
    "id" UUID NOT NULL,
    "cartId" UUID NOT NULL,
    "domainName" TEXT NOT NULL,
    "tldId" UUID NOT NULL,
    "registrarCode" TEXT NOT NULL,
    "operation" "DomainOperation" NOT NULL DEFAULT 'REGISTER',
    "registrationYears" INTEGER NOT NULL,
    "unitPriceMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "quoteExpiresAt" TIMESTAMP(3) NOT NULL,
    "priceSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Registrar_code_key" ON "Registrar"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Tld_extension_key" ON "Tld"("extension");

-- CreateIndex
CREATE INDEX "TldRegistrar_registrarId_isActive_idx" ON "TldRegistrar"("registrarId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TldRegistrar_tldId_registrarId_key" ON "TldRegistrar"("tldId", "registrarId");

-- CreateIndex
CREATE INDEX "TldPrice_tldId_registrarId_operation_periodYears_isActive_idx" ON "TldPrice"("tldId", "registrarId", "operation", "periodYears", "isActive");

-- CreateIndex
CREATE INDEX "ExchangeRate_baseCurrency_targetCurrency_expiresAt_idx" ON "ExchangeRate"("baseCurrency", "targetCurrency", "expiresAt");

-- CreateIndex
CREATE INDEX "DomainSearchLog_createdAt_idx" ON "DomainSearchLog"("createdAt");

-- CreateIndex
CREATE INDEX "DomainSearchLog_extension_createdAt_idx" ON "DomainSearchLog"("extension", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Cart_userId_key" ON "Cart"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Cart_sessionIdentifier_key" ON "Cart"("sessionIdentifier");

-- CreateIndex
CREATE INDEX "Cart_status_expiresAt_idx" ON "Cart"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_cartId_domainName_operation_key" ON "CartItem"("cartId", "domainName", "operation");

-- AddForeignKey
ALTER TABLE "TldRegistrar" ADD CONSTRAINT "TldRegistrar_tldId_fkey" FOREIGN KEY ("tldId") REFERENCES "Tld"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TldRegistrar" ADD CONSTRAINT "TldRegistrar_registrarId_fkey" FOREIGN KEY ("registrarId") REFERENCES "Registrar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TldPrice" ADD CONSTRAINT "TldPrice_tldId_fkey" FOREIGN KEY ("tldId") REFERENCES "Tld"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TldPrice" ADD CONSTRAINT "TldPrice_registrarId_fkey" FOREIGN KEY ("registrarId") REFERENCES "Registrar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainSearchLog" ADD CONSTRAINT "DomainSearchLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_tldId_fkey" FOREIGN KEY ("tldId") REFERENCES "Tld"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain constraints complement request validation and protect direct writers.
ALTER TABLE "TldRegistrar" ADD CONSTRAINT "TldRegistrar_period_check" CHECK ("minimumPeriod" BETWEEN 1 AND 10 AND "maximumPeriod" BETWEEN "minimumPeriod" AND 10);
ALTER TABLE "TldPrice" ADD CONSTRAINT "TldPrice_money_check" CHECK ("supplierCostMinor" >= 0 AND "sellingPriceMinor" >= 0 AND "additionalCostMinor" >= 0 AND "minimumPriceMinor" >= 0 AND "roundingIncrementMinor" > 0 AND "marginValue" >= 0 AND ("marginType" <> 'GROSS_MARGIN' OR "marginValue" < 100));
ALTER TABLE "TldPrice" ADD CONSTRAINT "TldPrice_period_check" CHECK ("periodYears" BETWEEN 1 AND 10 AND "effectiveUntil" > "effectiveFrom");
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_valid_check" CHECK ("rate" > 0 AND "baseCurrency" <> "targetCurrency" AND "expiresAt" > "fetchedAt");
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_owner_check" CHECK (("userId" IS NOT NULL AND "sessionIdentifier" IS NULL) OR ("userId" IS NULL AND "sessionIdentifier" IS NOT NULL));
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_price_check" CHECK ("unitPriceMinor" >= 0 AND "registrationYears" BETWEEN 1 AND 10);
