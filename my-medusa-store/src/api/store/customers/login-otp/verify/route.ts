import {
  getGenericLoginOtpVerifyMessage,
  verifyPhoneLoginOtp,
  verifyLoginOtp,
} from "../../../../../lib/login-otp/service"

type VerifyBody = {
  email?: string
  phone?: string
  otp?: string
}

export async function POST(req: any, res: any) {
  const body = ((req.body ?? {}) as VerifyBody) || {}

  try {
    const result = body.phone
      ? await verifyPhoneLoginOtp(req, {
          phone: body.phone,
          otp: body.otp,
        })
      : await verifyLoginOtp(req, {
          email: body.email,
          otp: body.otp,
        })

    if (!result.ok) {
      return res.status(result.status).json({
        message: result.message,
      })
    }

    return res.status(200).json({
      message: result.message,
      token: result.token,
    })
  } catch {
    return res.status(400).json({
      message: getGenericLoginOtpVerifyMessage(),
    })
  }
}
