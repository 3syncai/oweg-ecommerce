import { z } from "zod"

import {
  StoreCreateCustomerAddress,
  StoreGetCustomerAddressesParams,
  StoreGetCustomerAddressParams,
  StoreGetCustomerParams,
  StoreUpdateCustomer,
  StoreUpdateCustomerAddress,
} from "@medusajs/medusa/dist/api/store/customers/validators"

export const StoreCreateCustomer = z
  .object({
    email: z.string().email(),
    first_name: z.string().min(1),
    last_name: z.string().min(1),
    phone: z.string().min(7),
    customer_type: z.enum(["individual", "business"]),
    company_name: z.string().optional(),
    gst_number: z.string().max(32).optional(),
    referral_code: z.string().optional().nullable(),
    newsletter_subscribe: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.customer_type === "business") {
      if (!data.company_name || !data.company_name.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["company_name"],
          message: "Company name is required for business accounts",
        })
      }
      if (!data.gst_number || !data.gst_number.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["gst_number"],
          message: "GST number is required for business accounts",
        })
      }
    }
  })

export const StoreCreatePasswordResetToken = z.object({
  email: z.string().trim().email(),
})

export const StoreValidatePasswordResetToken = z.object({
  token: z.string().trim().min(32).max(256),
})

export const StoreResetPassword = z.object({
  token: z.string().trim().min(32).max(256),
  password: z.string().min(10).max(128),
})

export const StoreRequestLoginOtp = z.object({
  email: z.string().trim().email(),
})

export const StoreVerifyLoginOtp = z.object({
  email: z.string().trim().email(),
  otp: z.string().trim().regex(/^\d{6}$/),
})

export {
  StoreGetCustomerParams,
  StoreUpdateCustomer,
  StoreGetCustomerAddressParams,
  StoreCreateCustomerAddress,
  StoreUpdateCustomerAddress,
  StoreGetCustomerAddressesParams,
}

export type StoreCreateCustomerType = z.infer<
  typeof StoreCreateCustomer
>

export type StoreCreatePasswordResetTokenType = z.infer<
  typeof StoreCreatePasswordResetToken
>

export type StoreValidatePasswordResetTokenType = z.infer<
  typeof StoreValidatePasswordResetToken
>

export type StoreResetPasswordType = z.infer<typeof StoreResetPassword>

export type StoreRequestLoginOtpType = z.infer<typeof StoreRequestLoginOtp>

export type StoreVerifyLoginOtpType = z.infer<typeof StoreVerifyLoginOtp>

