import { validatePasswordResetToken } from "../../../../../lib/password-reset/service"

type ValidateBody = {
  token?: string
}

export async function POST(req: any, res: any) {
  const body = ((req.body ?? {}) as ValidateBody) || {}

  try {
    const result = await validatePasswordResetToken(req, body.token)

    if (result.valid === false) {
      return res.status(400).json({
        valid: false,
        message: result.message,
      })
    }

    return res.status(200).json({
      valid: true,
    })
  } catch {
    return res.status(500).json({
      valid: false,
      message: "Something went wrong. Please try again.",
    })
  }
}
