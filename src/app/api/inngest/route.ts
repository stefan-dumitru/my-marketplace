import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { processProductImportFunction } from "@/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processProductImportFunction],
});
