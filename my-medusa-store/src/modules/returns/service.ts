import { MedusaService, MedusaError } from "@medusajs/framework/utils"
import ReturnRequest from "./models/return-request"
import ReturnRequestItem from "./models/return-request-item"
import { encryptBankDetails } from "../../services/return-bank-crypto"

type BankDetailsInput = {
  account_name: string
  account_number: string
  ifsc_code: string
  bank_name?: string | null
}

class ReturnModuleService extends MedusaService({
  ReturnRequest,
  ReturnRequestItem,
}) {
  async createReturnRequest(input: {
    order_id: string
    customer_id: string
    type: "return" | "replacement"
    reason?: string | null
    notes?: string | null
    payment_type: "online" | "cod"
    refund_method?: "original" | "bank" | null
    bank_details?: BankDetailsInput | null
    items: Array<{
      order_item_id: string
      quantity: number
      condition?: string | null
      reason?: string | null
    }>
  }) {
    let bank_details_encrypted: string | null = null
    let bank_account_last4: string | null = null

    if (input.payment_type === "cod") {
      if (!input.bank_details) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Bank details are required for COD refunds."
        )
      }
      const bankDetails = {
        account_name: input.bank_details.account_name,
        account_number: input.bank_details.account_number,
        ifsc_code: input.bank_details.ifsc_code,
        bank_name: input.bank_details.bank_name ?? "",
      }
      bank_details_encrypted = encryptBankDetails(bankDetails)
      bank_account_last4 = input.bank_details.account_number.slice(-4)
    }

    const request = await this.createReturnRequests({
      order_id: input.order_id,
      customer_id: input.customer_id,
      type: input.type,
      status: "pending_approval",
      reason: input.reason ?? null,
      notes: input.notes ?? null,
      payment_type: input.payment_type,
      refund_method: input.refund_method ?? null,
      bank_details_encrypted,
      bank_account_last4,
    })

    if (input.items?.length) {
      await this.createReturnRequestItems(
        input.items.map((item) => ({
          return_request_id: request.id,
          order_item_id: item.order_item_id,
          quantity: item.quantity,
          condition: item.condition ?? null,
          reason: item.reason ?? null,
        }))
      )
    }

    return request
  }

  async approveReturnRequest(id: string, adminId?: string | null) {
    const requests = await this.listReturnRequests({ id })
    if (!requests?.length) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Return request not found")
    }

    return await this.updateReturnRequests({
      id,
      status: "approved",
      approved_at: new Date(),
      approved_by: adminId ?? null,
      rejected_at: null,
      rejected_by: null,
      rejection_reason: null,
    })
  }

  async rejectReturnRequest(id: string, reason: string, adminId?: string | null) {
    const requests = await this.listReturnRequests({ id })
    if (!requests?.length) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Return request not found")
    }

    return await this.updateReturnRequests({
      id,
      status: "rejected",
      rejected_at: new Date(),
      rejected_by: adminId ?? null,
      rejection_reason: reason,
    })
  }

  async markPickupInitiated(id: string) {
    return await this.updateReturnRequests({
      id,
      status: "pickup_initiated",
      pickup_initiated_at: new Date(),
    })
  }

  async markPickedUp(id: string) {
    return await this.updateReturnRequests({
      id,
      status: "picked_up",
      picked_up_at: new Date(),
    })
  }

  async markReceived(id: string) {
    return await this.updateReturnRequests({
      id,
      status: "received",
      received_at: new Date(),
    })
  }

  async markRefunded(id: string) {
    return await this.updateReturnRequests({
      id,
      status: "refunded",
      refunded_at: new Date(),
    })
  }
}

export default ReturnModuleService
