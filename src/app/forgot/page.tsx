"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2, MailCheck } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

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
    <div className="min-h-[100svh] bg-[radial-gradient(circle_at_top,_rgba(122,201,67,0.18),_transparent_35%),linear-gradient(180deg,#f8fafc_0%,#ffffff_45%,#ecfdf5_100%)] px-4 py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <Link
          href="/login"
          className="inline-flex w-fit items-center gap-2 text-sm font-medium text-emerald-700 transition hover:text-emerald-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to login
        </Link>

        <div className="grid gap-6 overflow-hidden rounded-[2rem] border border-emerald-100 bg-white/90 shadow-[0_30px_80px_-40px_rgba(22,101,52,0.45)] backdrop-blur md:grid-cols-[1.1fr_0.9fr]">
          <section className="p-8 md:p-12">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
              Account Recovery
            </div>
            <h1 className="mt-5 text-4xl font-black tracking-tight text-slate-900">
              Forgot your password?
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
              Enter the email linked to your account and we&apos;ll send a secure reset link if the
              account exists.
            </p>

            <form className="mt-8 grid gap-4" onSubmit={handleSubmit}>
              <label className="text-sm font-semibold text-slate-700" htmlFor="forgot-email">
                Email address
              </label>
              <Input
                id="forgot-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="h-12 rounded-2xl border-slate-200 bg-white px-4"
                required
              />

              <Button
                type="submit"
                disabled={loading || !email.trim()}
                className="mt-2 h-12 rounded-2xl bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending reset link...
                  </span>
                ) : (
                  "Send reset link"
                )}
              </Button>
            </form>

            {submitted && (
              <div className="mt-6 rounded-3xl border border-emerald-100 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                {GENERIC_SUCCESS_MESSAGE}
              </div>
            )}
          </section>

          <aside className="relative overflow-hidden bg-slate-950 px-8 py-10 text-white md:px-10 md:py-12">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(74,222,128,0.30),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.28),_transparent_35%)]" />
            <div className="relative flex h-full flex-col justify-between gap-10">
              <div>
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                  <MailCheck className="h-7 w-7 text-emerald-300" />
                </div>
                <h2 className="mt-6 text-2xl font-bold">Secure reset flow</h2>
                <p className="mt-3 max-w-sm text-sm leading-6 text-emerald-50/80">
                  Reset links expire automatically and can only be used once. If you didn&apos;t ask
                  for a reset, you can ignore the email.
                </p>
              </div>

              <div className="grid gap-3 text-sm text-emerald-50/80">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  Step 1: Request a reset link
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  Step 2: Open the link from your inbox
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  Step 3: Set a fresh password and log in
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
