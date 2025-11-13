import BaseCustomer from "@medusajs/customer/dist/models/customer"
import { model } from "@medusajs/framework/utils"

import CustomerAddress from "./customer-address"
import CustomerGroup from "./customer-group"
import CustomerGroupCustomer from "./customer-group-customer"

const parsed = BaseCustomer.parse()

const {
  created_at,
  updated_at,
  deleted_at,
  groups: _groups,
  addresses: _addresses,
  ...baseSchema
} = parsed.schema

const Customer = model
  .define(
    {
      name: parsed.name,
      tableName: parsed.tableName,
    },
    {
      ...baseSchema,
      customer_type: model.enum(["individual", "business"]).default("individual"),
      gst_number: model.text().nullable(),
      company_name: model.text().searchable().nullable(),
      referral_code: model.text().nullable(),
      first_name: model.text().searchable(),
      last_name: model.text().searchable(),
      email: model.text().searchable(),
      phone: model.text().searchable(),
      newsletter_subscribe: model.boolean().default(false),
      groups: model.manyToMany(() => CustomerGroup, {
        mappedBy: "customers",
        pivotEntity: () => CustomerGroupCustomer,
      }),
      addresses: model.hasMany(() => CustomerAddress, {
        mappedBy: "customer",
      }),
    }
  )
  .cascades(parsed.cascades as any)
  .indexes([
    ...parsed.indexes,
    {
      on: ["phone"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      on: ["gst_number"],
      unique: true,
      where:
        "deleted_at IS NULL AND customer_type = 'business' AND gst_number IS NOT NULL",
    },
  ])
  .checks([
    ...(parsed.checks ?? []),
    {
      name: "customer_business_fields_check",
      expression: `
        customer_type = 'individual'
        OR (
          customer_type = 'business'
          AND company_name IS NOT NULL
          AND gst_number IS NOT NULL
        )
      `,
    },
  ])

export default Customer

