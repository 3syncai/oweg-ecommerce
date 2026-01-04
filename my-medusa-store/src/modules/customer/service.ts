import BaseCustomerModuleService from "@medusajs/customer/dist/services/customer-module"
import {
  MedusaServiceModelObjectsSymbol,
  Module,
  Modules,
} from "@medusajs/framework/utils"

import Customer from "./models/customer"
import CustomerAddress from "./models/customer-address"
import CustomerGroup from "./models/customer-group"
import CustomerGroupCustomer from "./models/customer-group-customer"

const baseModelMap =
  (BaseCustomerModuleService as unknown as Record<
    typeof MedusaServiceModelObjectsSymbol,
    Record<string, unknown>
  >)[MedusaServiceModelObjectsSymbol] ?? {}

class CustomerModuleService extends BaseCustomerModuleService {}

;(CustomerModuleService as unknown as Record<
  typeof MedusaServiceModelObjectsSymbol,
  Record<string, unknown>
>)[MedusaServiceModelObjectsSymbol] = {
  ...baseModelMap,
  CustomerAddress,
  CustomerGroup,
  CustomerGroupCustomer,
  Customer,
}

export { CustomerModuleService }

export default Module(Modules.CUSTOMER, {
  service: CustomerModuleService,
})

