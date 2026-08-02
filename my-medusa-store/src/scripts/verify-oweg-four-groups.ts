/**
 * Create + verify one dummy customer in each OWEG group.
 *
 * Usage:
 *   npx medusa exec ./src/scripts/verify-oweg-four-groups.ts
 *   npm run verify:oweg-groups
 */
import { Client } from "pg"
import {
  assignCustomerToOwegGroup,
  inferOwegAccountType,
  isValidPartnerReferralCode,
  resolveCustomerModule,
  resolveOwegGroupKey,
  type OwegCustomerGroupKey,
} from "../lib/customer-groups"
import { persistOwegCustomerFields } from "../lib/persist-oweg-customer-fields"

type MedusaExecArgs = {
  container: { resolve: (key: string) => unknown }
}

type FixtureSpec = {
  label: string
  email: string
  first_name: string
  last_name: string
  phone: string
  customer_type: "individual" | "business"
  company_name?: string
  gst_number?: string
  usePartnerReferral: boolean
  expectedKey: OwegCustomerGroupKey
  expectedName: string
}

const FIXTURE_PREFIX = "oweg.verify."

async function pickPartnerCode(client: Client): Promise<string> {
  const preferred = await client.query<{ refer_code: string }>(
    `SELECT refer_code FROM affiliate_user
     WHERE is_approved = TRUE AND UPPER(refer_code) = 'OWEGGOVIND66669'
     LIMIT 1`
  )
  if (preferred.rows[0]?.refer_code) {
    return String(preferred.rows[0].refer_code).trim().toUpperCase()
  }
  const any = await client.query<{ refer_code: string }>(
    `SELECT refer_code FROM affiliate_user
     WHERE is_approved = TRUE AND refer_code IS NOT NULL AND TRIM(refer_code) <> ''
     LIMIT 1`
  )
  if (!any.rows[0]?.refer_code) {
    throw new Error(
      "No approved affiliate_user.refer_code found — cannot verify Partner groups"
    )
  }
  return String(any.rows[0].refer_code).trim().toUpperCase()
}

async function softDeletePriorFixtures(client: Client) {
  await client.query(
    `UPDATE customer
     SET deleted_at = NOW(),
         email = 'deleted.' || id || '.' || email,
         updated_at = NOW()
     WHERE deleted_at IS NULL
       AND email LIKE $1`,
    [`${FIXTURE_PREFIX}%`]
  )
}

function buildFixtures(partnerCode: string): FixtureSpec[] {
  return [
    {
      label: "Direct - Individual",
      email: "oweg.verify.direct.individual@example.com",
      first_name: "Oweg",
      last_name: "DirectInd",
      phone: "9000000001",
      customer_type: "individual",
      usePartnerReferral: false,
      expectedKey: "direct_individual",
      expectedName: "Direct - Individual",
    },
    {
      label: "Direct - Business",
      email: "oweg.verify.direct.business@example.com",
      first_name: "Oweg",
      last_name: "DirectBiz",
      phone: "9000000002",
      customer_type: "business",
      company_name: "OWEG Direct Biz Pvt Ltd",
      gst_number: "27OWEGDIRC001Z1",
      usePartnerReferral: false,
      expectedKey: "direct_business",
      expectedName: "Direct - Business",
    },
    {
      label: "Partner - Individual",
      email: "oweg.verify.partner.individual@example.com",
      first_name: "Oweg",
      last_name: "PartnerInd",
      phone: "9000000003",
      customer_type: "individual",
      usePartnerReferral: true,
      expectedKey: "partner_individual",
      expectedName: "Partner - Individual",
    },
    {
      label: "Partner - Business",
      email: "oweg.verify.partner.business@example.com",
      first_name: "Oweg",
      last_name: "PartnerBiz",
      phone: "9000000004",
      customer_type: "business",
      company_name: "OWEG Partner Biz Pvt Ltd",
      gst_number: "27OWEGPRTN001Z2",
      usePartnerReferral: true,
      expectedKey: "partner_business",
      expectedName: "Partner - Business",
    },
  ]
}

export default async function verifyOwegFourGroups({ container }: MedusaExecArgs) {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required")
  }

  const customerModule = resolveCustomerModule(container)
  if (!customerModule.createCustomers) {
    throw new Error("Customer module missing createCustomers")
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  const results: Array<{
    label: string
    email: string
    pass: boolean
    expected: string
    actual: string | null
    details: string[]
  }> = []

  try {
    await softDeletePriorFixtures(client)
    const partnerCode = await pickPartnerCode(client)
    const partnerOk = await isValidPartnerReferralCode(partnerCode)
    if (!partnerOk) {
      throw new Error(`Partner code ${partnerCode} failed isValidPartnerReferralCode`)
    }
    console.log(`[verify-oweg-four-groups] Using partner code: ${partnerCode}`)

    const fixtures = buildFixtures(partnerCode)

    for (const fixture of fixtures) {
      const details: string[] = []
      const referral = fixture.usePartnerReferral ? partnerCode : null
      const gst =
        fixture.customer_type === "business"
          ? String(fixture.gst_number || "")
              .trim()
              .toUpperCase()
          : null
      const company =
        fixture.customer_type === "business"
          ? String(fixture.company_name || "").trim()
          : null

      const created = await customerModule.createCustomers({
        email: fixture.email,
        first_name: fixture.first_name,
        last_name: fixture.last_name,
        phone: fixture.phone,
        company_name: company,
        metadata: {
          user_type: fixture.customer_type,
          customer_type: fixture.customer_type,
          ...(company ? { company_name: company } : {}),
          ...(gst ? { gst_number: gst } : {}),
          ...(referral ? { referral_code: referral } : {}),
          wallet_coins: 0,
          oweg_verify_fixture: true,
        },
      })
      const customer = Array.isArray(created) ? created[0] : created

      const persisted = await persistOwegCustomerFields({
        customerId: customer.id,
        customer_type: fixture.customer_type,
        company_name: company,
        gst_number: gst,
        referral_code: referral,
        metadata: {
          user_type: fixture.customer_type,
          customer_type: fixture.customer_type,
          ...(company ? { company_name: company } : {}),
          ...(gst ? { gst_number: gst } : {}),
          ...(referral ? { referral_code: referral } : {}),
          wallet_coins: 0,
          oweg_verify_fixture: true,
        },
      })
      if (!persisted.ok) {
        details.push(`persist failed: ${persisted.error}`)
      }

      if (referral) {
        const existingRef = await client.query(
          `SELECT customer_id FROM customer_referral WHERE customer_id = $1 LIMIT 1`,
          [customer.id]
        )
        if (existingRef.rows.length) {
          await client.query(
            `UPDATE customer_referral SET referral_code = $2 WHERE customer_id = $1`,
            [customer.id, referral]
          )
        } else {
          await client.query(
            `INSERT INTO customer_referral (customer_id, referral_code, created_at)
             VALUES ($1, $2, NOW())`,
            [customer.id, referral]
          )
        }
      }

      const hasPartnerReferral = await isValidPartnerReferralCode(referral)
      const accountType = inferOwegAccountType({
        customer_type: fixture.customer_type,
        metadata: { gst_number: gst, user_type: fixture.customer_type },
        gst_number: gst,
      })
      const expectedKey = resolveOwegGroupKey({
        accountType,
        hasPartnerReferral,
      })
      if (expectedKey !== fixture.expectedKey) {
        details.push(
          `logic mismatch: expectedKey from helpers=${expectedKey} fixture=${fixture.expectedKey}`
        )
      }

      const assigned = await assignCustomerToOwegGroup(customerModule, {
        customerId: customer.id,
        accountType,
        hasPartnerReferral,
      })

      const row = await client.query(
        `SELECT customer_type, company_name, gst_number, referral_code, metadata
         FROM customer WHERE id = $1`,
        [customer.id]
      )
      const c = row.rows[0]
      const gstRow = await client.query(
        `SELECT gst_number, business_name FROM customer_gst
         WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [customer.id]
      )
      const membership = await client.query(
        `SELECT cg.name, cg.metadata->>'key' AS group_key
         FROM customer_group_customer cgc
         JOIN customer_group cg ON cg.id = cgc.customer_group_id
         WHERE cgc.customer_id = $1
           AND cgc.deleted_at IS NULL
           AND cg.deleted_at IS NULL
           AND (
             cg.name LIKE 'Partner - %'
             OR cg.name LIKE 'Direct - %'
           )`,
        [customer.id]
      )

      const actualKey = membership.rows[0]?.group_key || null
      const actualName = membership.rows[0]?.name || assigned.groupName || null

      if (fixture.customer_type === "business") {
        if (String(c.customer_type) !== "business") {
          details.push(`customer_type=${c.customer_type}`)
        }
        if (!c.company_name) details.push("missing company_name column")
        if (String(c.gst_number || "").toUpperCase() !== gst) {
          details.push(`gst_number column=${c.gst_number}`)
        }
        if (
          String(gstRow.rows[0]?.gst_number || "").toUpperCase() !== gst ||
          !gstRow.rows[0]?.business_name
        ) {
          details.push(
            `customer_gst mismatch gst=${gstRow.rows[0]?.gst_number} biz=${gstRow.rows[0]?.business_name}`
          )
        }
      } else {
        if (gstRow.rows[0]?.gst_number) {
          details.push(`unexpected customer_gst for individual`)
        }
      }

      if (fixture.usePartnerReferral) {
        const ref = await client.query(
          `SELECT referral_code FROM customer_referral WHERE customer_id = $1`,
          [customer.id]
        )
        if (String(ref.rows[0]?.referral_code || "").toUpperCase() !== partnerCode) {
          details.push(`customer_referral=${ref.rows[0]?.referral_code}`)
        }
      }

      if (membership.rows.length !== 1) {
        details.push(`oweg memberships=${membership.rows.length}`)
      }
      if (actualKey !== fixture.expectedKey) {
        details.push(`group_key=${actualKey}`)
      }
      if (actualName !== fixture.expectedName) {
        details.push(`group_name=${actualName}`)
      }

      const pass = details.length === 0
      results.push({
        label: fixture.label,
        email: fixture.email,
        pass,
        expected: fixture.expectedName,
        actual: actualName,
        details,
      })
    }
  } finally {
    await client.end()
  }

  console.log("\n=== OWEG 4-group verification ===")
  for (const r of results) {
    const mark = r.pass ? "PASS" : "FAIL"
    console.log(
      `[${mark}] ${r.label} | expected=${r.expected} actual=${r.actual} | ${r.email}`
    )
    if (!r.pass) {
      for (const d of r.details) console.log(`         - ${d}`)
    }
  }

  const failed = results.filter((r) => !r.pass)
  console.log(
    `\nSummary: ${results.length - failed.length}/${results.length} passed`
  )
  if (failed.length) {
    throw new Error(
      `verify-oweg-four-groups failed: ${failed.map((f) => f.label).join(", ")}`
    )
  }
}
