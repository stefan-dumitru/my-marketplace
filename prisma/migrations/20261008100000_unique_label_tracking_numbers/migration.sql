-- A tracking number created together with a FAN Courier label belongs to exactly one seller order.
-- Partial (labelUrl IS NOT NULL) so older orders whose number was typed by hand — including one
-- number already shared by two of them — are left alone. Prisma cannot express a partial index.
CREATE UNIQUE INDEX "seller_orders_label_tracking_number_key"
  ON "seller_orders" ("trackingNumber")
  WHERE "trackingNumber" IS NOT NULL AND "labelUrl" IS NOT NULL;
