import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { z } from "zod"
import { imageType, uploadReturnImage, RETURN_IMAGE_MAX_BYTES } from "../../../../lib/return-images"

const input = z.object({ order_id: z.string().min(1), order_item_id: z.string().min(1),
  data: z.string().min(1).max(Math.ceil(RETURN_IMAGE_MAX_BYTES / 3) * 4),
})

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const customer = (req as MedusaRequest & { auth_context?: { actor_id?: string } }).auth_context?.actor_id
  if (!customer) return res.status(401).json({ message: "Customer authentication required." })
  const parsed = input.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ message: "Choose a JPG, PNG or WebP photo up to 3 MB." })
  const body = parsed.data
  const orders = req.scope.resolve(Modules.ORDER)
  const order = await orders.retrieveOrder(body.order_id, { relations: ["items"] })
  if (order.customer_id !== customer) return res.status(403).json({ message: "Order does not belong to customer." })
  if (!order.items?.some((item) => item.id === body.order_item_id))
    return res.status(400).json({ message: "Invalid order item." })
  let buffer: Buffer
  try {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body.data) || body.data.length % 4 !== 0) throw new Error("Invalid photo data.")
    buffer = Buffer.from(body.data, "base64")
    imageType(buffer)
  } catch (error) { return res.status(400).json({ message: (error as Error).message }) }
  try {
    return res.json({ image: await uploadReturnImage(customer, order.id, body.order_item_id, buffer) })
  } catch {
    console.error("[return-images] S3 upload failed", { order_id: order.id })
    return res.status(503).json({ message: "Photos could not be uploaded right now. Please try again." })
  }
}
