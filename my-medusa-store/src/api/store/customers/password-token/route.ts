import {
  getGenericPasswordResetRequestMessage,
  requestPasswordReset,
} from "../../../../lib/password-reset/service"

type RequestBody = {
  email?: string
}

export async function POST(req: any, res: any) {
  const body = ((req.body ?? {}) as RequestBody) || {}

  try {
    const result = await requestPasswordReset(req, body.email)
    return res.status(result.status).json({
      message: result.message,
    })
  } catch {
    return res.status(200).json({
      message: getGenericPasswordResetRequestMessage(),
    })
  }
}
