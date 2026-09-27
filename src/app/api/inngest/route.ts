import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import {
  processProductImportFunction,
  releaseSellerPayoutsFunction,
  sendQueuedEmailFunction,
  sendLowStockAlertFunction,
  purgeAbandonedCartsFunction,
  purgeOldNotificationsFunction,
  computeDailySalesRollupFunction,
  sendReviewRemindersFunction,
} from "@/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processProductImportFunction,
    releaseSellerPayoutsFunction,
    sendQueuedEmailFunction,
    sendLowStockAlertFunction,
    purgeAbandonedCartsFunction,
    purgeOldNotificationsFunction,
    computeDailySalesRollupFunction,
    sendReviewRemindersFunction,
  ],
});
