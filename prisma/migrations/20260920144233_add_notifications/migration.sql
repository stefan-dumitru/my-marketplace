-- CreateEnum
-- Note: Prisma's migrate-diff engine doesn't understand Product.searchVector's GENERATED ALWAYS
-- AS column and misreads it as drift on every migration, auto-generating a spurious DROP INDEX +
-- ALTER COLUMN ... DROP DEFAULT pair unrelated to this migration's actual purpose. Stripped here
-- (see the "add_product_search_vector" migration for the real, unaffected definition).
CREATE TYPE "NotificationType" AS ENUM ('return_request_submitted', 'order_delivered', 'return_rejected', 'return_approved', 'seller_application_received', 'seller_application_approved', 'seller_application_rejected', 'seller_suspended', 'seller_reinstated', 'import_completed');

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_userId_read_idx" ON "notifications"("userId", "read");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
