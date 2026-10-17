import { test } from "node:test"
import assert from "node:assert/strict"
import { imageType, returnImagePrefix, validateReturnImages, storedReturnImages, RETURN_IMAGE_MAX_BYTES } from "../../return-images"
import { encryptBankDetails, ReturnRefundConfigurationError, returnRefundConfigurationReady } from "../../../services/return-bank-crypto"
import { returnPayoutView } from "../../return-payout-view"
import { StoreCreateReturnRequest } from "../../../api/store/return-requests/validators"

const photo = (item = "item_one") => ({
  key: `${returnImagePrefix("cus_one", "order_one", item)}00000000-0000-4000-8000-000000000001.png`, order_item_id: item,
})
test("return photo references cannot cross customer, order or selected-item boundaries", () => {
  validateReturnImages([photo()], "cus_one", "order_one", ["item_one"])
  assert.throws(() => validateReturnImages([photo()], "cus_other", "order_one", ["item_one"]))
  assert.throws(() => validateReturnImages([photo()], "cus_one", "order_other", ["item_one"]))
  assert.throws(() => validateReturnImages([photo()], "cus_one", "order_one", ["item_other"]))
  assert.throws(() => validateReturnImages([{ ...photo(), key: photo().key.replace("00000000", "../00000000") }], "cus_one", "order_one", ["item_one"]))
  assert.throws(() => returnImagePrefix("cus/other", "order_one", "item_one"))
})
test("a vendor sees only evidence for its returned items in a split order", () => {
  const request = { customer_id: "cus_one", order_id: "order_one", metadata: { return_images: [photo(), photo("item_two")] } }
  assert.deepEqual(storedReturnImages(request, new Set(["item_one"])), [photo()])
  assert.deepEqual(storedReturnImages(request, new Set(["item_other"])), [])
  assert.equal(storedReturnImages(request).length, 2)
})
test("duplicate photos, excessive count, unsupported contents and oversized uploads are rejected", () => {
  assert.throws(() => validateReturnImages([photo(), photo()], "cus_one", "order_one", ["item_one"]))
  assert.throws(() => validateReturnImages(Array(6).fill(photo()), "cus_one", "order_one", ["item_one"]))
  assert.throws(() => imageType(Buffer.from('<svg onload="alert(1)"></svg>')))
  assert.throws(() => imageType(Buffer.alloc(RETURN_IMAGE_MAX_BYTES + 1)))
  assert.equal(imageType(Buffer.from([137,80,78,71,13,10,26,10])).type, "image/png")
})
test("krishna@sbi is accepted and invalid UPI generates validation issues", () => {
  const body = { order_id: "order_one", type: "return", reason: "Damaged item", items: [{ order_item_id: "item_one", quantity: 1 }], refund_payout: { method: "upi", upi_id: "krishna@sbi" } }
  assert.equal(StoreCreateReturnRequest.safeParse(body).success, true)
  assert.equal(StoreCreateReturnRequest.safeParse({ ...body, refund_payout: { method: "upi", upi_id: "krishna" } }).success, false)
})
test("admins receive readable UPI while missing or wrong keys produce a safe error", () => {
  const previous = process.env.RETURN_BANK_ENCRYPTION_KEY
  try {
    process.env.RETURN_BANK_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64")
    const encrypted = encryptBankDetails({ method: "upi", upi_id: "krishna@sbi" })
    assert.ok(!encrypted.includes("krishna"))
    assert.equal(returnPayoutView({ bank_details_encrypted: encrypted }).bank_details?.upi_id, "krishna@sbi")
    process.env.RETURN_BANK_ENCRYPTION_KEY = Buffer.alloc(32, 2).toString("base64")
    assert.equal(returnPayoutView({ bank_details_encrypted: encrypted }).bank_details, null)
    assert.ok(returnPayoutView({ bank_details_encrypted: encrypted }).refund_details_error)
    delete process.env.RETURN_BANK_ENCRYPTION_KEY
    assert.equal(returnRefundConfigurationReady(), false)
    assert.throws(() => encryptBankDetails({ method: "upi", upi_id: "krishna@sbi" }), ReturnRefundConfigurationError)
  } finally {
    if (previous === undefined) delete process.env.RETURN_BANK_ENCRYPTION_KEY
    else process.env.RETURN_BANK_ENCRYPTION_KEY = previous
  }
})
