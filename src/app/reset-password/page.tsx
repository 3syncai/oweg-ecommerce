"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowRight, Check, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PASSWORD_REQUIREMENTS, validateStrongPassword } from "@/lib/password-policy"
import AccountRecoveryLayout from "@/components/auth/AccountRecoveryLayout"
import styles from "@/components/auth/AccountRecovery.module.css"

function ResetPasswordPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = useMemo(() => searchParams.get("token")?.trim() || "", [searchParams])

  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [confirmPassword, setConfirmPassword] = useState("")
  const [checking, setChecking] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [validToken, setValidToken] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function validateToken() {
      if (!token) {
        setChecking(false)
        setValidToken(false)
        setErrorMessage("This reset link is invalid or has expired.")
        return
      }

      try {
        setChecking(true)
        const res = await fetch("/api/medusa/customers/reset-password/validate", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
          },
          body: JSON.stringify({ token }),
        })

        const data = (await res.json().catch(() => null)) as { error?: string } | null

        if (!active) {
          return
        }

        if (!res.ok) {
          setValidToken(false)
          setErrorMessage(data?.error || "This reset link is invalid or has expired.")
          return
        }

        setValidToken(true)
        setErrorMessage(null)
      } catch {
        if (!active) {
          return
        }
        setValidToken(false)
        setErrorMessage("Something went wrong. Please try again.")
      } finally {
        if (active) {
          setChecking(false)
        }
      }
    }

    void validateToken()

    return () => {
      active = false
    }
  }, [token])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (submitting) return
    if (!token || !validToken) {
      setErrorMessage("This reset link is invalid or has expired.")
      return
    }

    const passwordError = validateStrongPassword(password)
    if (passwordError) {
      setErrorMessage(passwordError)
      return
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.")
      return
    }

    try {
      setSubmitting(true)
      setErrorMessage(null)

      const res = await fetch("/api/medusa/customers/reset-password", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        },
        body: JSON.stringify({
          token,
          password,
        }),
      })

      const data = (await res.json().catch(() => null)) as { error?: string; message?: string } | null

      if (!res.ok) {
        const message = data?.error || "Something went wrong. Please try again."
        setErrorMessage(message)
        toast.error(message)
        return
      }

      toast.success(data?.message || "Password reset successfully. Please log in.")
      router.push("/login?reset=success")
    } catch {
      setErrorMessage("Something went wrong. Please try again.")
      toast.error("Something went wrong. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AccountRecoveryLayout>
      <div className={styles.eyebrow}>Reset password</div>
      <h1 className={styles.title}>{!checking && !validToken ? "Let’s get you a fresh link" : "A new password. A fresh start."}</h1>
      <p className={styles.intro}>{!checking && !validToken
        ? "Reset links expire automatically. Request a new one to get back into your account."
        : "Choose a password for your OWEG account, then sign in to pick up where you left off."}</p>
      {checking ? <div className={styles.loading} role="status"><Loader2 size={24} className="animate-spin" /> Checking your reset link…</div>
        : !validToken ? <>
          <div className={styles.error} role="alert">{errorMessage || "This reset link is invalid or has expired."}</div>
          <div className={styles.actions}>
            <Link href="/forgot" className={styles.submit}>Get a new link <ArrowRight size={16} className="ml-2" /></Link>
            <Link href="/login" className={styles.textLink}>Back to sign in</Link>
          </div>
        </> : <form className={styles.form} onSubmit={handleSubmit}>
          {errorMessage && <div className={styles.error} role="alert">{errorMessage}</div>}
          <div className={styles.field}>
            <label htmlFor="new-password">New password</label>
            <div className={styles.password}>
              <Input id="new-password" type={showPassword ? "text" : "password"} autoComplete="new-password"
                value={password} onChange={event => setPassword(event.target.value)} placeholder="Enter your new password"
                aria-describedby="password-requirements" disabled={submitting} required />
              <button type="button" className={styles.visibility} onClick={() => setShowPassword(value => !value)}
                aria-label={showPassword ? "Hide new password" : "Show new password"} aria-pressed={showPassword}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <div className={styles.rules} id="password-requirements" aria-label="Password requirements">
            {PASSWORD_REQUIREMENTS.map(rule => <span key={rule.label} className={styles.rule} data-met={rule.test(password)}>
              <Check size={13} aria-hidden="true" />{rule.label}
            </span>)}
          </div>
          <div className={styles.field}>
            <label htmlFor="confirm-password">Confirm password</label>
            <div className={styles.password}>
              <Input id="confirm-password" type={showConfirmPassword ? "text" : "password"} autoComplete="new-password"
                value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="Enter it once more"
                disabled={submitting} required />
              <button type="button" className={styles.visibility} onClick={() => setShowConfirmPassword(value => !value)}
                aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"} aria-pressed={showConfirmPassword}>
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <Button type="submit" disabled={submitting || !password || !confirmPassword} className={styles.submit}>
            {submitting ? <span className={styles.busy}><Loader2 size={17} className="animate-spin" /> Updating password…</span>
              : <span className={styles.busy}>Reset password <ArrowRight size={17} /></span>}
          </Button>
        </form>}
      <p className={styles.note}><ShieldCheck size={16} />Your reset link is single use. Your orders and saved items stay unchanged.</p>
    </AccountRecoveryLayout>
  )
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<AccountRecoveryLayout><div className={styles.loading} role="status"><Loader2 size={24} className="animate-spin" /> Loading…</div></AccountRecoveryLayout>}>
    <ResetPasswordPageInner />
  </Suspense>
}
