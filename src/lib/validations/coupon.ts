import { z } from "zod";

// Optional numeric/date inputs arrive from <input> as "" when left blank — treat that as "not set"
// rather than failing coercion (Number("") is 0, which would silently mean "minimum 0 / zero uses").
const blankToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);
const optionalNumber = (min: number) => z.preprocess(blankToUndefined, z.coerce.number().min(min).optional());
const optionalInt = z.preprocess(
  blankToUndefined,
  z.coerce.number().int("Must be a whole number.").min(1, "Must be at least 1.").optional()
);
const optionalDate = z.preprocess(
  blankToUndefined,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.")
    .optional()
);

export const couponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3, "Code must be at least 3 characters.")
      .max(32, "Code must be at most 32 characters.")
      .regex(/^[A-Za-z0-9_-]+$/, "Use letters, numbers, - and _ only.")
      .transform((code) => code.toUpperCase()),
    type: z.enum(["percentage", "fixed_amount"]),
    value: z.coerce.number().positive("Value must be greater than 0."),
    minOrderAmount: optionalNumber(0),
    maxDiscountAmount: optionalNumber(0.01),
    startsAt: optionalDate,
    expiresAt: optionalDate,
    maxRedemptionsTotal: optionalInt,
    maxRedemptionsPerUser: optionalInt,
    firstOrderOnly: z.boolean(),
    isActive: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "percentage" && data.value > 100) {
      ctx.addIssue({ code: "custom", path: ["value"], message: "A percentage can't exceed 100." });
    }
    if (data.startsAt && data.expiresAt && data.expiresAt < data.startsAt) {
      ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "Must be on or after the start date." });
    }
  });

// Output type (after coercion/transform) — the service/action contract.
export type CouponInput = z.output<typeof couponSchema>;
// Input type — what RHF's form state holds pre-submit.
export type CouponFormInput = z.input<typeof couponSchema>;

export const applyCouponSchema = z.object({
  code: z.string().trim().min(1, "Enter a code.").max(64),
});
export type ApplyCouponInput = z.infer<typeof applyCouponSchema>;
