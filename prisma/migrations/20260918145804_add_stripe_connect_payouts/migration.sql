-- AlterTable
ALTER TABLE "seller_orders" ADD COLUMN     "payoutAt" TIMESTAMP(3),
ADD COLUMN     "stripeTransferId" TEXT;

-- AlterTable
ALTER TABLE "seller_profiles" ADD COLUMN     "payoutsEnabled" BOOLEAN NOT NULL DEFAULT false;
