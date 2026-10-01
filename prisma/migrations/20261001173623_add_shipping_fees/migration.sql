-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "shippingAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "seller_orders" ADD COLUMN     "shippingCharged" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "shippingFee" DECIMAL(10,2) NOT NULL DEFAULT 0;
