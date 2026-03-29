import {
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework"
import { authenticate } from "@medusajs/medusa/dist/api/utils/middlewares/authenticate-middleware"
import { storeCustomerRoutesMiddlewares as baseMiddlewares } from "@medusajs/medusa/dist/api/store/customers/middlewares"
import * as QueryConfig from "@medusajs/medusa/dist/api/store/customers/query-config"

import {
  StoreCreateCustomer,
  StoreRequestLoginOtp,
  StoreCreatePasswordResetToken,
  StoreGetCustomerParams,
  StoreVerifyLoginOtp,
  StoreResetPassword,
  StoreValidatePasswordResetToken,
} from "./validators"

export const storeCustomerRoutesMiddlewares = baseMiddlewares.map((entry) => {
  if (entry.matcher !== "/store/customers") {
    return entry
  }

  return {
    ...entry,
    middlewares: [
      authenticate("customer", ["session", "bearer"], {
        allowUnregistered: true,
      }),
      validateAndTransformBody(StoreCreateCustomer),
      validateAndTransformQuery(
        StoreGetCustomerParams,
        QueryConfig.retrieveTransformQueryConfig
      ),
    ],
  }
  })
  .concat([
    {
      method: ["POST"],
      matcher: "/store/customers/password-token",
      middlewares: [validateAndTransformBody(StoreCreatePasswordResetToken)],
    },
    {
      method: ["POST"],
      matcher: "/store/customers/login-otp/request",
      middlewares: [validateAndTransformBody(StoreRequestLoginOtp)],
    },
    {
      method: ["POST"],
      matcher: "/store/customers/login-otp/verify",
      middlewares: [validateAndTransformBody(StoreVerifyLoginOtp)],
    },
    {
      method: ["POST"],
      matcher: "/store/customers/reset-password/validate",
      middlewares: [validateAndTransformBody(StoreValidatePasswordResetToken)],
    },
    {
      method: ["POST"],
      matcher: "/store/customers/reset-password",
      middlewares: [validateAndTransformBody(StoreResetPassword)],
    },
    {
      method: ["POST"],
      matcher: "/store/customers/change-password",
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
  ])

