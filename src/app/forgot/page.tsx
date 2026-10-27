"use client"

import { useState } from "react"
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import AccountRecoveryLayout from "@/components/auth/AccountRecoveryLayout"
import styles from "@/components/auth/AccountRecovery.module.css"

const GENERIC_SUCCESS_MESSAGE =
  "If an account exists, a reset link has been sent."

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!email.trim()) {
      toast.error("Enter a valid email address.")
      return
    }

    try {
      setLoading(true)

      const res = await fetch("/api/medusa/customers/password-token", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
        }),
      })

      const data = (await res.json().catch(() => null)) as { error?: string; message?: string } | null

      if (!res.ok) {
        toast.error(data?.error || "Something went wrong. Please try again.")
        return
      }

      setSubmitted(true)
      toast.success(data?.message || GENERIC_SUCCESS_MESSAGE)
    } catch {
      toast.error("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <AccountRecoveryLayout>
      <div className={styles.eyebrow}>Account recovery</div>
      <h1 className={styles.title}>Forgot your password?</h1>
      <p className={styles.intro}>It happens. Enter your account email and we’ll help you get back in.</p>
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label htmlFor="forgot-email">Email address</label>
          <Input id="forgot-email" type="email" autoComplete="email" value={email}
            onChange={event => { setEmail(event.target.value); setSubmitted(false) }}
            placeholder="you@example.com" disabled={loading} required />
        </div>
        <Button type="submit" disabled={loading || !email.trim()} className={styles.submit}>
          {loading ? <span className={styles.busy}><Loader2 size={17} className="animate-spin" /> Sending link…</span>
            : <span className={styles.busy}>Send reset link <ArrowRight size={17} /></span>}
        </Button>
      </form>
      {submitted && <div className={styles.success} role="status">
        <strong>Check your inbox</strong>{GENERIC_SUCCESS_MESSAGE} Check your spam folder too.
      </div>}
      <p className={styles.note}><ShieldCheck size={16} />Your reset link expires automatically and can only be used once.</p>
    </AccountRecoveryLayout>
  )
}
