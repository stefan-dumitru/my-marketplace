-- CreateEnum
CREATE TYPE "ReturnRequestStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "return_requests" (
    "id" TEXT NOT NULL,
    "sellerOrderId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReturnRequestStatus" NOT NULL DEFAULT 'pending',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "return_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "return_requests_sellerOrderId_key" ON "return_requests"("sellerOrderId");

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_sellerOrderId_fkey" FOREIGN KEY ("sellerOrderId") REFERENCES "seller_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
