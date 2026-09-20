-- CreateEnum
CREATE TYPE "ImportMode" AS ENUM ('add_only', 'full_replace', 'attribute_update');

-- CreateEnum
CREATE TYPE "ImportBatchStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "ImportRecordAction" AS ENUM ('created', 'updated', 'skipped', 'failed', 'deactivated');

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "mode" "ImportMode" NOT NULL,
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'pending',
    "totalRows" INTEGER NOT NULL,
    "succeededRows" INTEGER NOT NULL DEFAULT 0,
    "failedRows" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batch_records" (
    "id" TEXT NOT NULL,
    "importBatchId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "action" "ImportRecordAction" NOT NULL,
    "errorMessage" TEXT,
    "beforeValue" JSONB,
    "afterValue" JSONB,

    CONSTRAINT "import_batch_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_batches_sellerId_idx" ON "import_batches"("sellerId");

-- CreateIndex
CREATE INDEX "import_batch_records_importBatchId_idx" ON "import_batch_records"("importBatchId");

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "seller_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batch_records" ADD CONSTRAINT "import_batch_records_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
