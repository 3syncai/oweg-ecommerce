import { settlementFromLedger } from "../vendor-earnings"
import {
  adminPayableNetFromLedger,
  applyRunningLedgerBalance,
  calculateVendorLedgerSettlement,
  ledgerRowBalanceDelta,
  overlaySaleDeductions,
} from "../vendor-ledger-settlement"
import {
  attachPayoutReferencesToOrders,
  buildVendorLedgerRowFromPayout,
  buildVendorLedgerRowsFromEarning,
  parsePayoutOrderIds,
  summarizeVendorPaymentCards,
} from "../vendor-payments-ledger"
import {
  DEFAULT_LEDGER_RATES,
  LOCKED_SALE_1000_50,
  TAX_RATES,
  r2,
} from "./ledger-test-fixtures"

const TODAY = "2026-09-28"
const YESTERDAY = "2026-09-27T10:00:00.000Z"
const TODAY_ISO = "2026-09-28T08:30:00.000Z"

function saleEarning(overrides: Partial<Parameters<typeof buildVendorLedgerRowsFromEarning>[0]> = {}) {
  return buildVendorLedgerRowsFromEarning(
    {
      id: "ve_sale1",
      order_id: "ord_1",
      order_display_id: "1001",
      product_name: "Cotton Shirt",
      status: "CREDITED",
      taxable_amount: 1000,
      logistic_fee: 50,
      return_fee: 0,
      gst_rate: 18,
      delivered_at: TODAY_ISO,
      unlock_at: null,
      ...overrides,
    },
    DEFAULT_LEDGER_RATES,
    TAX_RATES
  )
}

function assertMappedToLedger(
  view: ReturnType<typeof settlementFromLedger>,
  ledger: ReturnType<typeof calculateVendorLedgerSettlement>
) {
  expect(view.category).toBe(ledger.category)
  expect(view.taxable_amount).toBe(ledger.item_price)
  expect(view.listing_gst).toBe(ledger.listing_gst)
  expect(view.gst_amount).toBe(ledger.product_gst)
  expect(view.taxes).toBe(ledger.product_gst)
  expect(view.order_amount).toBe(ledger.product_total)
  expect(view.listing_total).toBe(ledger.listing_total)
  expect(view.platform_fee).toBe(ledger.platform_fee)
  expect(view.platform_gst).toBe(ledger.platform_gst)
  expect(view.platform_total).toBe(ledger.platform_total)
  expect(view.commission).toBe(ledger.commission_fee)
  expect(view.commission_gst).toBe(ledger.commission_gst)
  expect(view.commission_total).toBe(ledger.commission_total)
  expect(view.partner_commission).toBe(ledger.partner_commission)
  expect(view.partner_gst).toBe(ledger.partner_gst)
  expect(view.partner_total).toBe(ledger.partner_total)
  expect(view.tcs).toBe(ledger.tcs)
  expect(view.tds).toBe(ledger.tds)
  expect(view.logistic_fee).toBe(ledger.logistic_fee)
  expect(view.logistic_gst).toBe(ledger.logistic_gst)
  expect(view.logistic_total).toBe(ledger.logistic_total)
  expect(view.return_fee).toBe(ledger.reverse_logistic_fee)
  expect(view.reverse_logistic_total).toBe(ledger.reverse_logistic_total)
  expect(view.cancellation_fee).toBe(ledger.cancellation_fee)
  expect(view.cancellation_total).toBe(ledger.cancellation_total)
  expect(view.claim_amount).toBe(ledger.claim_amount)
  expect(view.bank_settlement).toBe(ledger.bank_settlement)
  expect(view.settlement_amount).toBe(ledger.bank_settlement)
  expect(view.payment).toBe(ledger.payment)
}

/** Same numeric columns the vendor-portal Excel mapper writes (HEADER_ROW_2). */
function exportNumbers(row: {
  taxable_amount: number
  logistic_fee: number
  listing_gst: number
  listing_total: number
  platform_fee: number
  platform_gst: number
  platform_total: number
  commission: number
  commission_gst: number
  commission_total: number
  partner_commission: number
  partner_gst: number
  partner_total: number
  logistic_gst: number
  logistic_total: number
  tcs: number
  tds: number
  bank_settlement: number
  return_fee: number
  reverse_logistic_gst: number
  reverse_logistic_total: number
  cancellation_fee: number
  cancellation_gst: number
  cancellation_total: number
  claim_amount: number
  payment: number
  balance_amount: number
}) {
  return [
    row.taxable_amount,
    row.logistic_fee,
    row.listing_gst,
    row.listing_total,
    row.platform_fee,
    row.platform_gst,
    row.platform_total,
    row.commission,
    row.commission_gst,
    row.commission_total,
    row.partner_commission,
    row.partner_gst,
    row.partner_total,
    row.logistic_fee,
    row.logistic_gst,
    row.logistic_total,
    row.tcs,
    row.tds,
    row.bank_settlement,
    row.return_fee,
    row.reverse_logistic_gst,
    row.reverse_logistic_total,
    row.cancellation_fee,
    row.cancellation_gst,
    row.cancellation_total,
    row.claim_amount,
    row.payment,
    row.balance_amount,
  ]
}

describe("settlementFromLedger is a 1:1 projection of the engine", () => {
  it("sale row fields match engine", () => {
    const ledger = calculateVendorLedgerSettlement({
      category: "sale",
      item_price: 1000,
      logistic_fee: 50,
      rates: DEFAULT_LEDGER_RATES,
    })
    const view = settlementFromLedger({
      id: "x",
      order_id: "o",
      order_display_id: "1",
      product_name: "P",
      status: "CREDITED",
      delivered_at: TODAY_ISO,
      unlock_at: null,
      ledger,
      tcs_rate: 0.5,
      tds_rate: 0.1,
      gst_rate: 18,
    })
    assertMappedToLedger(view, ledger)
    expect(view.type).toBe("sales")
    expect(view.item_status).toBe("Delivered")
  })

  it("return / claim / payment / cancellation labels stay distinct", () => {
    const ret = settlementFromLedger({
      id: "r",
      order_id: "o",
      order_display_id: "1",
      product_name: "P",
      status: "REVERSED",
      delivered_at: TODAY_ISO,
      unlock_at: null,
      ledger: calculateVendorLedgerSettlement({
        category: "return",
        item_price: 1000,
        logistic_fee: 50,
        rates: DEFAULT_LEDGER_RATES,
      }),
      tcs_rate: 0.5,
      tds_rate: 0.1,
      gst_rate: 18,
    })
    expect(ret.type).toBe("return")
    expect(ret.item_status).toBe("Returned")
    expect(ret.taxable_amount).toBe(-1000)

    const claim = settlementFromLedger({
      id: "c",
      order_id: "claim:abc",
      order_display_id: null,
      product_name: "Claim settlement",
      status: "CREDITED",
      delivered_at: TODAY_ISO,
      unlock_at: null,
      ledger: calculateVendorLedgerSettlement({
        category: "claim",
        item_price: 0,
        logistic_fee: 0,
        claim_amount: 120,
        rates: DEFAULT_LEDGER_RATES,
      }),
      tcs_rate: 0,
      tds_rate: 0,
      gst_rate: 0,
    })
    expect(claim.type).toBe("claim")
    expect(claim.item_status).toBe("Claim credited")
    expect(claim.claim_amount).toBe(120)
  })
})

describe("Payments table vs admin pay — same numbers", () => {
  it("normal credited sale: table bank = admin pay = 930.58", () => {
    const rows = saleEarning()
    expect(rows).toHaveLength(1)
    expect(rows[0].bank_settlement).toBe(LOCKED_SALE_1000_50.bank_settlement)
    const ledger = calculateVendorLedgerSettlement({
      category: "sale",
      item_price: 1000,
      logistic_fee: 50,
      rates: DEFAULT_LEDGER_RATES,
    })
    expect(adminPayableNetFromLedger(ledger)).toBe(rows[0].bank_settlement)
    expect(adminPayableNetFromLedger(ledger)).toBe(930.58)
  })

  it("ON_HOLD with return courier: table reverse + running delta = admin net", () => {
    const rows = saleEarning({ status: "ON_HOLD", return_fee: 80 })
    expect(rows).toHaveLength(1)
    expect(rows[0].bank_settlement).toBe(930.58)
    expect(rows[0].reverse_logistic_total).toBe(94.4)
    const delta = ledgerRowBalanceDelta(rows[0])
    expect(delta).toBe(r2(930.58 - 94.4))
    const sale = calculateVendorLedgerSettlement({
      category: "sale",
      item_price: 1000,
      logistic_fee: 50,
      rates: DEFAULT_LEDGER_RATES,
    })
    const overlaid = overlaySaleDeductions(
      sale,
      { reverse_logistic_fee: 80 },
      DEFAULT_LEDGER_RATES
    )
    expect(adminPayableNetFromLedger(overlaid)).toBe(delta)
    expect(rows[0].item_status).toBe("Return hold")
  })

  it("REVERSED order: vendor still pays forward logistics + reverse courier", () => {
    const rows = applyRunningLedgerBalance(
      saleEarning({ status: "REVERSED", return_fee: 80 })
    )
    expect(rows).toHaveLength(2)
    expect(rows[0].category).toBe("sale")
    expect(rows[1].category).toBe("return")
    expect(rows[0].bank_settlement).toBe(930.58)
    expect(rows[1].logistic_total).toBe(0)
    expect(rows[1].reverse_logistic_total).toBe(94.4)
    expect(rows[1].balance_amount).toBe(r2(-(59 + 94.4)))
    expect(adminPayableNetFromLedger(
      calculateVendorLedgerSettlement({
        category: "return",
        item_price: 1000,
        logistic_fee: 50,
        reverse_logistic_fee: 80,
        rates: DEFAULT_LEDGER_RATES,
      })
    )).toBe(0)
  })

  it("cancelled-style return with cancel fee nets to −(logistics+reverse+cancel)", () => {
    const rows = applyRunningLedgerBalance(
      saleEarning({
        status: "REVERSED",
        return_fee: 80,
        cancellation_fee: 20,
      })
    )
    expect(rows[1].cancellation_total).toBe(23.6)
    expect(rows[1].balance_amount).toBe(r2(-(59 + 94.4 + 23.6)))
  })
})

describe("running balance + payout + claim", () => {
  it("sale → claim → payout: last balance = sale + claim − payout", () => {
    const sale = saleEarning()[0]
    const claim = buildVendorLedgerRowsFromEarning(
      {
        id: "ve_claim",
        order_id: "claim:rep_1",
        order_display_id: null,
        product_name: "Claim settlement",
        status: "CREDITED",
        taxable_amount: 0,
        logistic_fee: 0,
        gst_rate: 18,
        gross_amount: 150,
        net_amount: 150,
        delivered_at: TODAY_ISO,
        unlock_at: null,
      },
      DEFAULT_LEDGER_RATES,
      TAX_RATES
    )[0]
    const payout = buildVendorLedgerRowFromPayout(
      {
        id: "po_1",
        net_amount: 400,
        transaction_id: "txn_1",
        created_at: TODAY_ISO,
        order_ids: ["ord_1"],
      },
      DEFAULT_LEDGER_RATES
    )
    expect(payout).not.toBeNull()
    const ledger = applyRunningLedgerBalance([sale, claim, payout!])
    expect(ledger[0].balance_amount).toBe(930.58)
    expect(ledger[1].balance_amount).toBe(r2(930.58 + 150))
    expect(ledger[2].payment).toBe(-400)
    expect(ledger[2].balance_amount).toBe(r2(930.58 + 150 - 400))
  })

  it("skips zero / negative payouts so a bad row cannot wipe the table", () => {
    expect(
      buildVendorLedgerRowFromPayout(
        { id: "po_0", net_amount: 0, created_at: TODAY_ISO },
        DEFAULT_LEDGER_RATES
      )
    ).toBeNull()
    expect(
      buildVendorLedgerRowFromPayout(
        { id: "po_neg", net_amount: -50, created_at: TODAY_ISO },
        DEFAULT_LEDGER_RATES
      )
    ).toBeNull()
  })

  it("two sales then one payout: withdrawn card matches payout, running ends at leftover", () => {
    const a = saleEarning({ id: "ve_a", order_id: "ord_a", order_display_id: "10" })[0]
    const b = saleEarning({
      id: "ve_b",
      order_id: "ord_b",
      order_display_id: "11",
      taxable_amount: 1000,
      logistic_fee: 0,
    })[0]
    const payout = buildVendorLedgerRowFromPayout(
      { id: "po_all", net_amount: 1000, created_at: TODAY_ISO, order_ids: ["ord_a"] },
      DEFAULT_LEDGER_RATES
    )!
    const rows = applyRunningLedgerBalance([a, b, payout])
    const leftover = r2(a.bank_settlement + b.bank_settlement - 1000)
    expect(rows[2].balance_amount).toBe(leftover)
    const cards = summarizeVendorPaymentCards(rows, {
      todayKey: TODAY,
      available_balance: leftover,
      unlocking_balance: 0,
      total_withdrawn: 1000,
    })
    expect(cards.withdrawn).toBe(1000)
    expect(cards.balance).toBe(leftover)
    expect(cards.settlement_balance).toBeCloseTo(leftover + 1000, 2)
    expect(cards.full_sale).toBe(r2(a.order_amount + b.order_amount))
  })
})

describe("cards stay consistent with settlement rows", () => {
  it("today sale + today return: total_sale = product sale + return (not Sheet4 C)", () => {
    const rows = applyRunningLedgerBalance(
      saleEarning({ status: "REVERSED", return_fee: 80 })
    )
    const cards = summarizeVendorPaymentCards(rows, {
      todayKey: TODAY,
      available_balance: 0,
      unlocking_balance: 0,
      total_withdrawn: 0,
    })
    // ₹1000 + 18% product GST — logistics never inflate "sale"
    expect(cards.full_sale).toBe(1180)
    expect(cards.total_sale).toBe(0)
    expect(cards.return_fee).toBe(80)
    expect(cards.platform_fee).toBe(50)
    expect(cards.gst).toBe(180)
  })

  it("yesterday sale is in lifetime cards but not today's total_sale", () => {
    const rows = saleEarning({ delivered_at: YESTERDAY })
    const cards = summarizeVendorPaymentCards(rows, {
      todayKey: TODAY,
      available_balance: 930.58,
      unlocking_balance: 0,
      total_withdrawn: 0,
    })
    expect(cards.full_sale).toBe(1180)
    expect(cards.total_sale).toBe(0)
    expect(cards.gst).toBe(0)
    expect(cards.platform_fee).toBe(0)
    expect(cards.commission).toBe(0)
    expect(cards.lifetime_tcs).toBe(5)
    expect(cards.lifetime_tds).toBe(1)
  })

  it("self-ship today does not inflate logistic card", () => {
    const rows = saleEarning({ logistic_fee: 0 })
    const cards = summarizeVendorPaymentCards(rows, {
      todayKey: TODAY,
      available_balance: rows[0].bank_settlement,
      unlocking_balance: 0,
      total_withdrawn: 0,
    })
    expect(cards.logistic_fee).toBe(0)
    expect(cards.full_sale).toBe(1180)
  })
})

describe("Excel export columns match on-screen ledger", () => {
  it("every Sheet4 letter (A–I plus reverse/cancel/claim/payment/balance) equals the table row", () => {
    const [row] = applyRunningLedgerBalance(saleEarning())
    const exported = exportNumbers(row)
    expect(exported[0]).toBe(1000)
    expect(exported[1]).toBe(50)
    expect(exported[2]).toBe(189)
    expect(exported[3]).toBe(1239)
    expect(exported[4]).toBe(50)
    expect(exported[6]).toBe(59)
    expect(exported[9]).toBe(23.6)
    expect(exported[12]).toBe(160.82)
    expect(exported[15]).toBe(59)
    expect(exported[16]).toBe(5)
    expect(exported[17]).toBe(1)
    expect(exported[18]).toBe(930.58)
    expect(exported[26]).toBe(0)
    expect(exported[27]).toBe(930.58)
  })

  it("returned order export keeps sale C and return −C on separate rows", () => {
    const rows = applyRunningLedgerBalance(
      saleEarning({ status: "REVERSED", return_fee: 80 })
    )
    expect(exportNumbers(rows[0])[3]).toBe(1239)
    expect(exportNumbers(rows[1])[3]).toBe(-1239)
    expect(exportNumbers(rows[1])[19]).toBe(80)
    expect(exportNumbers(rows[1])[21]).toBe(94.4)
    expect(exportNumbers(rows[1])[27]).toBe(-153.4)
  })
})

describe("mixed vendor day — values match across every surface", () => {
  it("easy sale + self sale + return + claim + payout", () => {
    const easy = saleEarning({ id: "ve_easy", order_id: "ord_easy", order_display_id: "21" })[0]
    const self = saleEarning({
      id: "ve_self",
      order_id: "ord_self",
      order_display_id: "22",
      logistic_fee: 0,
    })[0]
    const returned = applyRunningLedgerBalance(
      saleEarning({
        id: "ve_ret",
        order_id: "ord_ret",
        order_display_id: "23",
        status: "REVERSED",
        return_fee: 80,
        delivered_at: TODAY_ISO,
      })
    )
    const claim = buildVendorLedgerRowsFromEarning(
      {
        id: "ve_cl",
        order_id: "claim:r2",
        order_display_id: null,
        status: "CREDITED",
        taxable_amount: 0,
        logistic_fee: 0,
        gst_rate: 18,
        gross_amount: 75,
        net_amount: 75,
        delivered_at: TODAY_ISO,
        unlock_at: null,
      },
      DEFAULT_LEDGER_RATES,
      TAX_RATES
    )[0]
    const payout = buildVendorLedgerRowFromPayout(
      { id: "po_mix", net_amount: 200, created_at: TODAY_ISO },
      DEFAULT_LEDGER_RATES
    )!

    const raw = [easy, self, ...returned, claim, payout]
    const rows = applyRunningLedgerBalance(raw)

    const expectedEnd = r2(
      easy.bank_settlement + self.bank_settlement - 59 - 94.4 + 75 - 200
    )
    expect(rows[rows.length - 1].balance_amount).toBe(expectedEnd)

    const adminEasy = adminPayableNetFromLedger(
      calculateVendorLedgerSettlement({
        category: "sale",
        item_price: 1000,
        logistic_fee: 50,
        rates: DEFAULT_LEDGER_RATES,
      })
    )
    const adminSelf = adminPayableNetFromLedger(
      calculateVendorLedgerSettlement({
        category: "sale",
        item_price: 1000,
        logistic_fee: 0,
        rates: DEFAULT_LEDGER_RATES,
      })
    )
    expect(easy.bank_settlement).toBe(adminEasy)
    expect(self.bank_settlement).toBe(adminSelf)
    expect(exportNumbers(easy)[18]).toBe(adminEasy)
    expect(exportNumbers(self)[18]).toBe(adminSelf)

    const cards = summarizeVendorPaymentCards(rows, {
      todayKey: TODAY,
      available_balance: expectedEnd,
      unlocking_balance: 0,
      total_withdrawn: 200,
    })
    expect(cards.balance).toBe(expectedEnd)
    expect(cards.withdrawn).toBe(200)
    expect(cards.full_sale).toBe(
      r2(easy.order_amount + self.order_amount + returned[0].order_amount)
    )
  })
})

describe("payout references on order rows", () => {
  it("parses jsonb arrays, json strings, and csv order ids", () => {
    expect(parsePayoutOrderIds(["ord_1", "ord_2"])).toEqual(["ord_1", "ord_2"])
    expect(parsePayoutOrderIds(JSON.stringify(["ord_1", "ord_2"]))).toEqual(["ord_1", "ord_2"])
    expect(parsePayoutOrderIds("ord_1, ord_2")).toEqual(["ord_1", "ord_2"])
  })

  it("copies txn id and payment date onto matching order rows", () => {
    const sale = saleEarning({ order_id: "ord_1" })[0]
    const other = saleEarning({ id: "ve_other", order_id: "ord_9", order_display_id: "1009" })[0]
    attachPayoutReferencesToOrders([sale, other], [
      {
        transaction_id: "pay_abc",
        created_at: TODAY_ISO,
        order_ids: ["ord_1"],
      },
    ])
    expect(sale.transaction_id).toBe("pay_abc")
    expect(sale.payment_date).toBe(TODAY_ISO)
    expect(other.transaction_id).toBeNull()
    expect(other.payment_date).toBeNull()
  })
})
