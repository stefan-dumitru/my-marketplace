import { z } from "zod";

export const requestReturnSchema = z.object({
  reason: z.string().trim().min(10, "Please describe the issue (at least 10 characters).").max(500),
});

export type RequestReturnInput = z.output<typeof requestReturnSchema>;
export type RequestReturnFormInput = z.input<typeof requestReturnSchema>;
