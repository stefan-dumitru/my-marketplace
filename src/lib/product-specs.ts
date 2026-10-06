import { z } from "zod";

export const specificationSchema = z.object({
  label: z.string().trim().min(1).max(60),
  value: z.string().trim().min(1).max(200),
});

export const specificationsSchema = z.array(specificationSchema).max(30);

export type Specification = z.infer<typeof specificationSchema>;

/** Reads the JSON column defensively: anything malformed simply shows no specifications. */
export function parseSpecifications(value: unknown): Specification[] {
  const parsed = specificationsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}
