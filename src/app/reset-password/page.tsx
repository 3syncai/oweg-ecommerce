"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, CheckCircle2, Loader2, LockKeyhole } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PASSWORD_POLICY_MESSAGE, validateStrongPassword } from "@/lib/password-policy"

function ResetPasswordPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = useMemo(() => searchParams.get("token")?.trim() || "", [searchParams])

  const [password, setPassword] = useState("")
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

    if (!token) {
      setErrorMessage("This reset link is invalid or has expired.")
      return
    }

    const passwordError = validateStrongPassword(password)
    if (passwordError) {
      setErrorMessage(passwordError)
      toast.error(passwordError)
      return
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.")
      toast.error("Passwords do not match.")
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
    <div className="min-h-[100svh] bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.14),_transparent_30%),linear-gradient(180deg,#0f172a_0%,#111827_55%,#022c22_100%)] px-4 py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <Link
          href="/login"
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-emerald-200 transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to login
        </Link>

        <div className="grid gap-6 overflow-hidden rounded-[2rem] border border-white/10 bg-white/10 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.85)] backdrop-blur md:grid-cols-[0.92fr_1.08fr]">
          <aside className="relative overflow-hidden bg-emerald-500/10 px-8 py-10 text-white md:px-10 md:py-12">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(74,222,128,0.30),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(255,255,255,0.12),_transparent_35%)]" />
            <div className="relative flex h-full flex-col justify-between gap-10">
              <div>
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                  <LockKeyhole className="h-7 w-7 text-emerald-200" />
                </div>
                <h1 className="mt-6 text-3xl font-black tracking-tight">Create a new password</h1>
                <p className="mt-3 max-w-sm text-sm leading-6 text-emerald-50/80">
                  Use a strong password you haven&apos;t used elsewhere. This reset link can only be
                  used once.
                </p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-sm text-emerald-50/85">
                <div className="mb-3 font-semibold text-white">Password rules</div>
                <p>{PASSWORD_POLICY_MESSAGE}</p>
              </div>
            </div>
          </aside>

          <section className="bg-white px-8 py-10 md:px-10 md:py-12">
            {checking ? (
              <div className="flex min-h-[18rem] flex-col items-center justify-center gap-4 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
                <div>
                  <p className="text-base font-semibold text-slate-900">Checking your reset link</p>
                  <p className="mt-1 text-sm text-slate-500">Please wait a moment.</p>
                </div>
              </div>
            ) : !validToken ? (
              <div className="flex min-h-[18rem] flex-col items-start justify-center">
                <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-4 text-sm text-rose-700">
                  {errorMessage || "This reset link is invalid or has expired."}
                </div>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Button asChild className="rounded-2xl bg-emerald-600 hover:bg-emerald-700">
                    <Link href="/forgot">Request a new link</Link>
                  </Button>
                  <Button asChild variant="outline" className="rounded-2xl">
                    <Link href="/login">Return to login</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <form className="grid gap-5" onSubmit={handleSubmit}>
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                    Reset Password
                  </div>
                  <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-900">
                    Choose your new password
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Once updated, you&apos;ll be redirected to login and can sign in with the new
                    password immediately.
                  </p>
                </div>

                {errorMessage && (
                  <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-4 text-sm text-rose-700">
                    {errorMessage}
                  </div>
                )}

                <div className="grid gap-2">
                  <label className="text-sm font-semibold text-slate-700" htmlFor="new-password">
                    New password
                  </label>
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter a strong password"
                    className="h-12 rounded-2xl border-slate-200 bg-white px-4"
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-semibold text-slate-700" htmlFor="confirm-password">
                    Confirm password
                  </label>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Re-enter your password"
                    className="h-12 rounded-2xl border-slate-200 bg-white px-4"
                    required
                  />
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                    <span>{PASSWORD_POLICY_MESSAGE}</span>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={submitting || !password || !confirmPassword}
                  className="h-12 rounded-2xl bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  {submitting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Resetting password...
                    </span>
                  ) : (
                    "Reset password"
                  )}
                </Button>
              </form>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordPageInner />
    </Suspense>
  )
}
