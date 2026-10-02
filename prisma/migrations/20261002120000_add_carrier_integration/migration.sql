-- AlterTable
ALTER TABLE "seller_orders" ADD COLUMN "labelUrl" TEXT,
ADD COLUMN "lastTrackedAt" TIMESTAMP(3),
ADD COLUMN "carrierStatus" TEXT;

-- CreateTable
CREATE TABLE "carrier_configs" (
    "id" TEXT NOT NULL,
    "carrier" TEXT NOT NULL DEFAULT 'fancourier',
    "apiUsername" TEXT NOT NULL,
    "apiPassword" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'test',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carrier_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "carrier_configs_carrier_environment_key" ON "carrier_configs"("carrier", "environment");
