import { z } from "zod"

const upiIdSchema = z
  .string()
  .trim()
  .min(5)
  .max(120)
  .regex(/^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/, "Enter a valid UPI ID (example: name@upi).")

const bankDetailsSchema = z.object({
  account_name: z.string().trim().min(1).max(120),
  account_number: z.string().trim().min(6).max(32).regex(/^[0-9]+$/, "Account number must be numeric."),
  ifsc_code: z
    .string()
    .trim()
    .min(11)
    .max(11)
    .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/i, "Enter a valid IFSC code."),
  bank_name: z.string().trim().max(120).optional(),
})

export const StoreCreateReturnRequest = z
  .object({
    order_id: z.string().min(1),
    type: z.enum(["return", "replacement"]),
    reason: z
      .string()
      .trim()
      .min(3)
      .max(180)
      .regex(/^[^<>]*$/, "Invalid characters in reason.")
      .optional(),
    notes: z
      .string()
      .trim()
      .max(1000)
      .regex(/^[^<>]*$/, "Invalid characters in notes.")
      .optional(),
    items: z
      .array(
        z.object({
          order_item_id: z.string().min(1),
          quantity: z.number().int().min(1),
          condition: z.string().trim().max(120).regex(/^[^<>]*$/).optional(),
          reason: z.string().trim().max(180).regex(/^[^<>]*$/).optional(),
        })
      )
      .min(1),
    /** @deprecated Prefer refund_payout; kept for older COD clients */
    bank_details: bankDetailsSchema.optional(),
    refund_payout: z
      .discriminatedUnion("method", [
        z.object({
          method: z.literal("upi"),
          upi_id: upiIdSchema,
        }),
        z.object({
          method: z.literal("bank"),
          account_name: bankDetailsSchema.shape.account_name,
          account_number: bankDetailsSchema.shape.account_number,
          ifsc_code: bankDetailsSchema.shape.ifsc_code,
          bank_name: bankDetailsSchema.shape.bank_name,
        }),
      ])
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type !== "return") return

    const hasPayout = Boolean(value.refund_payout)
    const hasLegacyBank = Boolean(value.bank_details)
    if (!hasPayout && !hasLegacyBank) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide UPI ID or bank details for the refund.",
        path: ["refund_payout"],
      })
    }
  })

export type StoreCreateReturnRequestType = z.infer<typeof StoreCreateReturnRequest>
