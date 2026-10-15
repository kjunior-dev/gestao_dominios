ALTER TABLE "TldPrice"
  ADD COLUMN "costSource" TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "manualSellingPriceMinor" BIGINT,
  ADD COLUMN "changeReason" TEXT,
  ADD COLUMN "lastSyncAttemptAt" TIMESTAMP(3),
  ADD COLUMN "lastSyncedAt" TIMESTAMP(3),
  ADD COLUMN "lastSyncErrorCode" TEXT;
ALTER TABLE "TldPrice" ADD CONSTRAINT "TldPrice_manual_price_check"
  CHECK ("manualSellingPriceMinor" IS NULL OR ("manualSellingPriceMinor" >= 0 AND "manualSellingPriceMinor" <= 999999999999999 AND COALESCE(length(trim("changeReason")), 0) >= 3));
ALTER TABLE "TldPrice" ADD CONSTRAINT "TldPrice_cost_source_check" CHECK ("costSource" IN ('MANUAL', 'API'));
