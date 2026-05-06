import {
  getGenericLoginOtpRequestMessage,
  requestPhoneLoginOtp,
  requestLoginOtp,
} from "../../../../../lib/login-otp/service"

type RequestBody = {
  email?: string
  phone?: string
}

export async function POST(req: any, res: any) {
  const body = ((req.body ?? {}) as RequestBody) || {}

  try {
    const result = body.phone
      ? await requestPhoneLoginOtp(req, body.phone)
      : await requestLoginOtp(req, body.email)
    return res.status(result.status).json({
      message: result.message,
    })
  } catch {
    return res.status(200).json({
      message: getGenericLoginOtpRequestMessage(),
    })
  }
}
