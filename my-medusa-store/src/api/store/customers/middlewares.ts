import {
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework"
import { authenticate } from "@medusajs/medusa/dist/api/utils/middlewares/authenticate-middleware"
import { storeCustomerRoutesMiddlewares as baseMiddlewares } from "@medusajs/medusa/dist/api/store/customers/middlewares"
import * as QueryConfig from "@medusajs/medusa/dist/api/store/customers/query-config"

import {
  StoreCreateCustomer,
  StoreGetCustomerParams,
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
      matcher: "/store/customers/change-password",
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
  ])

