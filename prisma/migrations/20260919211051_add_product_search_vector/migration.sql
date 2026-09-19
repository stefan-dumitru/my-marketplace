-- Enable trigram support for the typo-tolerant fallback in searchActiveProductIds.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- AlterTable
-- Generated, stored tsvector column — recomputed automatically by Postgres on every INSERT/UPDATE
-- and backfilled for all existing rows as part of this ALTER TABLE. 'simple' config: no stemming,
-- since brand names/SKUs are often not real English words and the spec doesn't mandate a
-- language. Weighted so a name match ranks above an incidental description match.
ALTER TABLE "products" ADD COLUMN "searchVector" tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', coalesce("name", '')), 'A') ||
  setweight(to_tsvector('simple', coalesce("brand", '')), 'B') ||
  setweight(to_tsvector('simple', coalesce("sku", '')), 'B') ||
  setweight(to_tsvector('simple', coalesce("description", '')), 'C')
) STORED;

CREATE INDEX "products_search_vector_idx" ON "products" USING GIN ("searchVector");
CREATE INDEX "products_name_trgm_idx" ON "products" USING GIN ("name" gin_trgm_ops);
