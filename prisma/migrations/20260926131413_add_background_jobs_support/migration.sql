-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'low_stock_alert';

-- Note: Prisma's migrate-diff engine doesn't understand Product.searchVector's GENERATED ALWAYS
-- AS column and misreads it as drift on every migration, auto-generating a spurious DROP INDEX +
-- ALTER COLUMN ... DROP DEFAULT pair unrelated to this migration's actual purpose. Stripped here,
-- same as the "add_notifications" migration before this one.

-- AlterTable
-- One pre-existing cart_item row needs a value for both new NOT NULL columns — backfilled via a
-- DB-level default rather than a separate UPDATE statement, since "now" is a perfectly reasonable
-- stand-in for "last touched" on data that predates this column existing at all.
ALTER TABLE "cart_items" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "lowStockAlertedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "daily_seller_sales" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "orderCount" INTEGER NOT NULL,
    "revenue" DECIMAL(10,2) NOT NULL,
    "commissionAmount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_seller_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_platform_sales" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "orderCount" INTEGER NOT NULL,
    "gmv" DECIMAL(10,2) NOT NULL,
    "commissionAmount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_platform_sales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "daily_seller_sales_sellerId_idx" ON "daily_seller_sales"("sellerId");

-- CreateIndex
CREATE UNIQUE INDEX "daily_seller_sales_sellerId_date_key" ON "daily_seller_sales"("sellerId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_platform_sales_date_key" ON "daily_platform_sales"("date");

-- AddForeignKey
ALTER TABLE "daily_seller_sales" ADD CONSTRAINT "daily_seller_sales_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "seller_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
