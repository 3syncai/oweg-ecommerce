import {
  getPasswordPolicyMessage,
  resetPasswordWithToken,
} from "../../../../lib/password-reset/service"

type ResetBody = {
  token?: string
  password?: string
}

export async function POST(req: any, res: any) {
  const body = ((req.body ?? {}) as ResetBody) || {}

  try {
    const result = await resetPasswordWithToken(req, {
      token: body.token,
      password: body.password,
    })

    return res.status(result.status).json({
      message: result.message,
      password_policy: getPasswordPolicyMessage(),
    })
  } catch {
    return res.status(500).json({
      message: "Something went wrong. Please try again.",
      password_policy: getPasswordPolicyMessage(),
    })
  }
}
