import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Client } from "pg"
import {
  OWEG_CUSTOMER_GROUPS,
  assignCustomerToOwegGroup,
  displayableGstin,
  inferOwegAccountType,
  isValidPartnerReferralCode,
  normalizeAccountType,
  resolveCustomerModule,
  resolveOwegGroupKey,
  type OwegCustomerGroupKey,
} from "../../../../../lib/customer-groups"

function displayOrDash(value?: string | null) {
  const trimmed = typeof value === "string" ? value.trim() : ""
  return trimmed || null
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const customerId = req.params.id
  if (!customerId) {
    return res.status(400).json({ message: "Customer ID is required" })
  }

  if (!process.env.DATABASE_URL) {
    return res.status(500).json({ message: "DATABASE_URL is not set" })
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL })
  try {
    await client.connect()

    const columnsResult = await client.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'customer'`
    )
    const columns = new Set(columnsResult.rows.map((r) => r.column_name))
    const selectParts = ["id", "company_name", "metadata"]
    for (const col of [
      "customer_type",
      "gst_number",
      "referral_code",
      "newsletter_subscribe",
    ]) {
      if (columns.has(col)) selectParts.push(col)
    }

    const customerResult = await client.query(
      `SELECT ${selectParts.join(", ")}
       FROM customer
       WHERE id = $1 AND deleted_at IS NULL
       LIMIT 1`,
      [customerId]
    )

    if (!customerResult.rows.length) {
      return res.status(404).json({ message: "Customer not found" })
    }

    const customer = customerResult.rows[0] as {
      id: string
      customer_type?: string | null
      company_name?: string | null
      gst_number?: string | null
      referral_code?: string | null
      metadata?: Record<string, unknown> | null
    }

    const referralTable = await client.query(
      `SELECT referral_code FROM customer_referral WHERE customer_id = $1 LIMIT 1`,
      [customerId]
    )
    const gstTable = await client.query(
      `SELECT gst_number, business_name
       FROM customer_gst
       WHERE customer_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [customerId]
    )

    const meta = customer.metadata || {}

    const accountType = inferOwegAccountType({
      customer_type: customer.customer_type,
      metadata: meta,
      gst_number: customer.gst_number,
      customer_gst_number: gstTable.rows[0]?.gst_number,
    })

    // Keep normalize for display consistency with existing badges
    const accountTypeNormalized = normalizeAccountType(accountType)

    const referralCode =
      displayOrDash(referralTable.rows[0]?.referral_code) ||
      displayOrDash(customer.referral_code) ||
      displayOrDash(
        typeof meta.referral_code === "string" ? meta.referral_code : null
      )

    const companyName =
      displayOrDash(customer.company_name) ||
      displayOrDash(
        typeof meta.company_name === "string" ? meta.company_name : null
      ) ||
      displayOrDash(gstTable.rows[0]?.business_name)

    // Never surface payout junk ("bank"/"cheque") as GST
    const gstNumber = displayableGstin(
      customer.gst_number,
      typeof meta.gst_number === "string" ? meta.gst_number : null,
      gstTable.rows[0]?.gst_number
    )

    let groupName: string | null = null
    let groupKey: OwegCustomerGroupKey | null = null
    let source: "Partner" | "Direct" | null = null

    const hasPartnerReferral =
      Boolean(referralCode) &&
      (await isValidPartnerReferralCode(referralCode))
    const expectedGroupKey = resolveOwegGroupKey({
      accountType,
      hasPartnerReferral,
    })

    try {
      const customerModule = resolveCustomerModule(req.scope)
      let memberships = await customerModule.listCustomerGroupCustomers?.(
        { customer_id: customerId },
        { take: 50 }
      )

      const owegByKey = new Map(
        OWEG_CUSTOMER_GROUPS.map((g) => [g.key, g] as const)
      )
      const owegNameByName = new Map(
        OWEG_CUSTOMER_GROUPS.map((g) => [g.name, g] as const)
      )

      let currentOwegKey: OwegCustomerGroupKey | null = null
      const groupIds = (memberships || []).map((m) => m.customer_group_id)
      if (groupIds.length) {
        const groups = await customerModule.listCustomerGroups(
          { id: groupIds },
          { take: 50 }
        )
        for (const group of groups) {
          const key =
            typeof group.metadata?.key === "string"
              ? (group.metadata.key as OwegCustomerGroupKey)
              : null
          const def =
            (key && owegByKey.get(key)) ||
            owegNameByName.get(group.name || "")
          if (def) {
            currentOwegKey = def.key
            groupName = def.name
            groupKey = def.key
            source = def.source
            break
          }
        }
      }

      // Heal missing OR wrong OWEG membership (e.g. stuck Direct Individual with GST)
      if (!currentOwegKey || currentOwegKey !== expectedGroupKey) {
        const healed = await assignCustomerToOwegGroup(customerModule, {
          customerId,
          accountType,
          hasPartnerReferral,
        })
        groupName = healed.groupName
        groupKey = healed.groupKey
        source = healed.groupKey.startsWith("partner_") ? "Partner" : "Direct"
      }
    } catch (err) {
      console.warn("[admin/customers/grouping] group lookup failed:", err)
    }

    if (!source) {
      source = hasPartnerReferral ? "Partner" : "Direct"
    }
    if (!groupKey) {
      groupKey = expectedGroupKey
      groupName =
        OWEG_CUSTOMER_GROUPS.find((g) => g.key === expectedGroupKey)?.name ||
        null
    }

    const responsePayload = {
      customer_id: customerId,
      source,
      account_type:
        accountTypeNormalized === "business" ? "Business" : "Individual",
      customer_group: groupName,
      customer_group_key: groupKey,
      referral_code: referralCode,
      company_name: companyName,
      gst_number: gstNumber,
    }

    return res.status(200).json(responsePayload)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("Customer grouping API error:", err)
    return res.status(500).json({ message: "Server Error", error: message })
  } finally {
    await client.end().catch(() => undefined)
  }
}
