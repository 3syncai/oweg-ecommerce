import { randomUUID } from "node:crypto"
import * as net from "node:net"
import * as tls from "node:tls"

import { hasLoginOtpMailerConfig, loginOtpConfig } from "./config"
import { normalizeEmail } from "./crypto"

type SmtpSocket = net.Socket | tls.TLSSocket

function sanitizeHeaderValue(value: string) {
  if (!value || value.includes("\r") || value.includes("\n")) {
    throw new Error("Invalid mail header value")
  }

  return value.trim()
}

function formatDisplayAddress(name: string, email: string) {
  const safeName = sanitizeHeaderValue(name).replace(/["\\]/g, "")
  return `${safeName} <${email}>`
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function toBase64Lines(value: string) {
  const encoded = Buffer.from(value, "utf8").toString("base64")
  return encoded.match(/.{1,76}/g)?.join("\r\n") || ""
}

function escapeDataBody(body: string) {
  return body
    .replace(/\r?\n/g, "\r\n")
    .split("\r\n")
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n")
}

function parseResponse(buffer: string) {
  if (!buffer.endsWith("\r\n")) {
    return null
  }

  const lines = buffer.split("\r\n").filter(Boolean)
  if (!lines.length || !/^\d{3}[ -]/.test(lines[0])) {
    return null
  }

  const code = lines[0].slice(0, 3)
  const last = lines[lines.length - 1]

  if (!last.startsWith(`${code} `)) {
    return null
  }

  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!lines[index].startsWith(`${code}-`)) {
      return null
    }
  }

  return {
    code: Number(code),
    message: lines.join("\n"),
  }
}

async function waitForResponse(socket: SmtpSocket) {
  return await new Promise<{ code: number; message: string }>((resolve, reject) => {
    let buffer = ""

    const cleanup = () => {
      socket.off("data", onData)
      socket.off("error", onError)
      socket.off("close", onClose)
      socket.off("timeout", onTimeout)
    }

    const onData = (chunk: Buffer | string) => {
      buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8")
      const response = parseResponse(buffer)

      if (response) {
        cleanup()
        resolve(response)
      }
    }

    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }

    const onClose = () => {
      cleanup()
      reject(new Error("SMTP connection closed unexpectedly"))
    }

    const onTimeout = () => {
      cleanup()
      reject(new Error("SMTP connection timed out"))
    }

    socket.on("data", onData)
    socket.once("error", onError)
    socket.once("close", onClose)
    socket.once("timeout", onTimeout)
  })
}

async function writeLine(socket: SmtpSocket, value: string) {
  await new Promise<void>((resolve, reject) => {
    socket.write(value, "utf8", (error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

async function sendCommand(
  socket: SmtpSocket,
  command: string,
  expectedCodes: number[]
) {
  await writeLine(socket, `${command}\r\n`)
  const response = await waitForResponse(socket)

  if (!expectedCodes.includes(response.code)) {
    throw new Error(`SMTP command failed: ${response.message}`)
  }

  return response
}

async function connectSecureSocket() {
  return await new Promise<tls.TLSSocket>((resolve, reject) => {
    const socket = tls.connect({
      host: loginOtpConfig.smtp.host,
      port: loginOtpConfig.smtp.port,
      servername: loginOtpConfig.smtp.host,
      rejectUnauthorized: true,
    })

    socket.setTimeout(30000)
    socket.once("secureConnect", () => resolve(socket))
    socket.once("error", reject)
    socket.once("timeout", () => reject(new Error("SMTP connection timed out")))
  })
}

async function upgradeToTls(socket: net.Socket) {
  return await new Promise<tls.TLSSocket>((resolve, reject) => {
    const secureSocket = tls.connect({
      socket,
      servername: loginOtpConfig.smtp.host,
      rejectUnauthorized: true,
    })

    secureSocket.setTimeout(30000)
    secureSocket.once("secureConnect", () => resolve(secureSocket))
    secureSocket.once("error", reject)
    secureSocket.once("timeout", () => reject(new Error("SMTP TLS upgrade timed out")))
  })
}

async function connectStartTlsSocket() {
  const socket = await new Promise<net.Socket>((resolve, reject) => {
    const nextSocket = net.connect({
      host: loginOtpConfig.smtp.host,
      port: loginOtpConfig.smtp.port,
    })

    nextSocket.setTimeout(30000)
    nextSocket.once("connect", () => resolve(nextSocket))
    nextSocket.once("error", reject)
    nextSocket.once("timeout", () => reject(new Error("SMTP connection timed out")))
  })

  return socket
}

async function openSmtpConnection() {
  if (loginOtpConfig.smtp.secure) {
    const socket = await connectSecureSocket()
    const greeting = await waitForResponse(socket)

    if (greeting.code !== 220) {
      socket.destroy()
      throw new Error(`SMTP greeting failed: ${greeting.message}`)
    }

    return socket
  }

  const socket = await connectStartTlsSocket()
  const greeting = await waitForResponse(socket)

  if (greeting.code !== 220) {
    socket.destroy()
    throw new Error(`SMTP greeting failed: ${greeting.message}`)
  }

  await sendCommand(socket, `EHLO ${loginOtpConfig.smtp.host}`, [250])
  await sendCommand(socket, "STARTTLS", [220])

  const secureSocket = await upgradeToTls(socket)
  await sendCommand(secureSocket, `EHLO ${loginOtpConfig.smtp.host}`, [250])
  return secureSocket
}

function buildMimeMessage(input: {
  fromName: string
  fromEmail: string
  to: string
  subject: string
  previewText: string
  text: string
  html: string
}) {
  const domain = input.fromEmail.split("@")[1] || "localhost"
  const boundary = `oweg-login-otp-${randomUUID()}`

  return [
    `From: ${formatDisplayAddress(input.fromName, input.fromEmail)}`,
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@${domain}>`,
    "Auto-Submitted: auto-generated",
    "Content-Language: en",
    "MIME-Version: 1.0",
    "X-Auto-Response-Suppress: OOF, AutoReply",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    toBase64Lines(input.text),
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    toBase64Lines(
      [
        `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(
          input.previewText
        )}</div>`,
        input.html,
      ].join("")
    ),
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n")
}

type SendLoginOtpMailInput = {
  to: string
  otp: string
  expiresInMinutes: number
}

export async function sendLoginOtpEmail(input: SendLoginOtpMailInput) {
  if (!hasLoginOtpMailerConfig()) {
    throw new Error("SMTP configuration is incomplete")
  }

  const to = normalizeEmail(input.to)
  const fromEmail = normalizeEmail(loginOtpConfig.smtp.fromEmail)

  if (!to || !fromEmail) {
    throw new Error("Invalid email address")
  }

  const subject = sanitizeHeaderValue("Your OWEG login OTP")
  const fromName = sanitizeHeaderValue(loginOtpConfig.smtp.fromName || "OWEG")
  const previewText = `Your OTP is ${input.otp}. It expires in ${input.expiresInMinutes} minutes.`

  const text = [
    "OWEG login OTP",
    "",
    `Your one-time password is: ${input.otp}`,
    "",
    `This OTP expires in ${input.expiresInMinutes} minutes and can be used only once.`,
    "If you did not request this OTP, ignore this email.",
    "If you can't find this mail, check your Spam/Junk folder.",
  ].join("\n")

  const html = `
    <div style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:20px;overflow:hidden">
        <div style="padding:28px 28px 16px;border-bottom:1px solid #ecf0f4">
          <div style="display:inline-block;padding:6px 10px;border-radius:999px;background:#ecfdf5;color:#166534;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">
            Login OTP
          </div>
          <h1 style="margin:16px 0 10px;font-size:28px;line-height:1.2;color:#0f172a">
            Your verification code
          </h1>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#475569">
            Use this one-time code to log in to your OWEG account.
          </p>
        </div>
        <div style="padding:24px 28px 28px">
          <div style="display:inline-block;background:#0f172a;color:#ffffff;padding:10px 16px;border-radius:12px;font-size:24px;font-weight:700;letter-spacing:0.16em">
            ${escapeHtml(input.otp)}
          </div>
          <p style="margin:18px 0 0;font-size:13px;line-height:1.7;color:#475569">
            This OTP expires in ${input.expiresInMinutes} minutes and can only be used once.
          </p>
          <p style="margin:10px 0 0;font-size:13px;line-height:1.7;color:#64748b">
            If you didn't receive it in inbox, check your Spam/Junk folder too.
          </p>
        </div>
      </div>
    </div>
  `

  const message = escapeDataBody(
    buildMimeMessage({
      fromName,
      fromEmail,
      to,
      subject,
      previewText,
      text,
      html,
    })
  )

  const socket = await openSmtpConnection()

  try {
    if (loginOtpConfig.smtp.secure) {
      await sendCommand(socket, `EHLO ${loginOtpConfig.smtp.host}`, [250])
    }

    await sendCommand(socket, "AUTH LOGIN", [334])
    await sendCommand(
      socket,
      Buffer.from(loginOtpConfig.smtp.user, "utf8").toString("base64"),
      [334]
    )
    await sendCommand(
      socket,
      Buffer.from(loginOtpConfig.smtp.password, "utf8").toString("base64"),
      [235]
    )
    await sendCommand(socket, `MAIL FROM:<${fromEmail}>`, [250])
    await sendCommand(socket, `RCPT TO:<${to}>`, [250, 251])
    await sendCommand(socket, "DATA", [354])
    await writeLine(socket, `${message}\r\n.\r\n`)

    const delivery = await waitForResponse(socket)
    if (delivery.code !== 250) {
      throw new Error(`SMTP delivery failed: ${delivery.message}`)
    }

    try {
      await sendCommand(socket, "QUIT", [221])
    } catch {
      // Ignore QUIT failures after successful delivery.
    }
  } finally {
    socket.destroy()
  }
}
