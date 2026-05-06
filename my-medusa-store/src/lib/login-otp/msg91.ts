import { loginOtpConfig } from "./config"

const MSG91_BASE_URL = "https://control.msg91.com"

type Msg91VerifyResponse = {
  type?: string
  message?: string
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError"
}

async function msg91Fetch(path: string, init: RequestInit) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), loginOtpConfig.msg91TimeoutMs)

  try {
    return await fetch(`${MSG91_BASE_URL}${path}`, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        authkey: loginOtpConfig.msg91.authKey,
        ...(init.headers || {}),
      },
    })
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error("MSG91_TIMEOUT")
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export async function sendMsg91Otp(mobile: string) {
  const params = new URLSearchParams({
    mobile,
    template_id: loginOtpConfig.msg91.templateId,
    authkey: loginOtpConfig.msg91.authKey,
  })

  if (loginOtpConfig.msg91.senderId) {
    params.set("sender", loginOtpConfig.msg91.senderId)
  }

  const response = await msg91Fetch(`/api/v5/otp?${params.toString()}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: "{}",
  })

  if (!response.ok) {
    throw new Error(`MSG91_SEND_FAILED_${response.status}`)
  }
}

export async function verifyMsg91Otp(mobile: string, otp: string) {
  const params = new URLSearchParams({
    mobile,
    otp,
  })

  const response = await msg91Fetch(`/api/v5/otp/verify?${params.toString()}`, {
    method: "GET",
  })

  if (!response.ok) {
    return false
  }

  const payload = (await response.json().catch(() => null)) as Msg91VerifyResponse | null
  const msg = payload?.message?.toLowerCase() || ""
  const type = payload?.type?.toLowerCase() || ""
  return type === "success" || msg.includes("verified")
}
