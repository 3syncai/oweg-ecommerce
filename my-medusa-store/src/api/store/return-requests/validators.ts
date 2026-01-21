import { z } from "zod"

export const StoreCreateReturnRequest = z.object({
  order_id: z.string().min(1),
  type: z.enum(["return", "replacement"]),
  reason: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(
    z.object({
      order_item_id: z.string().min(1),
      quantity: z.number().int().min(1),
      condition: z.string().optional(),
      reason: z.string().optional(),
    })
  ).min(1),
  bank_details: z
    .object({
      account_name: z.string().min(1),
      account_number: z.string().min(1),
      ifsc_code: z.string().min(1),
      bank_name: z.string().optional(),
    })
    .optional(),
})

export type StoreCreateReturnRequestType = z.infer<typeof StoreCreateReturnRequest>
