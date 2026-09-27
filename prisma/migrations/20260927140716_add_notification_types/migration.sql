-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'order_confirmed';
ALTER TYPE "NotificationType" ADD VALUE 'order_payment_failed';
ALTER TYPE "NotificationType" ADD VALUE 'order_shipped';
ALTER TYPE "NotificationType" ADD VALUE 'review_reminder';
ALTER TYPE "NotificationType" ADD VALUE 'seller_order_received';
ALTER TYPE "NotificationType" ADD VALUE 'payout_processed';
ALTER TYPE "NotificationType" ADD VALUE 'product_pending_review';
ALTER TYPE "NotificationType" ADD VALUE 'webhook_failure';
