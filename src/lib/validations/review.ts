import { z } from "zod";

export const createReviewSchema = z.object({
  rating: z.coerce.number().int().min(1, "Pick a rating.").max(5),
  title: z.string().trim().min(3, "Title must be at least 3 characters.").max(150),
  body: z.string().trim().min(10, "Write at least 10 characters.").max(2000),
});

// Output type (after z.coerce runs) — used server-side and as the service/action contract.
export type CreateReviewInput = z.output<typeof createReviewSchema>;
// Input type (before coercion) — what RHF's form state actually holds pre-submit, since the
// rating <select>'s value starts as a string until zodResolver runs.
export type CreateReviewFormInput = z.input<typeof createReviewSchema>;
