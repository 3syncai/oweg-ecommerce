"use client"

import { useState } from "react"
import Link from "next/link"
import { Loader2, ArrowLeft } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [token, setToken] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [requesting, setRequesting] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleRequest = async (event: React.FormEvent) => {
    event.preventDefault()
    setErrorMessage(null)
    setInfoMessage(null)
    if (!email.trim()) {
      setErrorMessage("Enter your email address first.")
      return
    }

    try {
      setRequesting(true)
      const res = await fetch("/api/medusa/customers/password-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })
      const data = await res.json()
      if (!res.ok) {
        const message = data?.error || "Unable to send reset instructions."
        setErrorMessage(message)
        toast.error(message)
        return
      }
      toast.success("Password reset email sent.")
      setInfoMessage("Check your inbox for the reset link or token. Paste the token below once you receive it.")
    } catch (err) {
      console.error("failed to request reset token", err)
      setErrorMessage("Something went wrong. Please try again.")
    } finally {
      setRequesting(false)
    }
  }

  const handleReset = async (event: React.FormEvent) => {
    event.preventDefault()
    setErrorMessage(null)
    setInfoMessage(null)
    if (!email.trim() || !token.trim()) {
      setErrorMessage("Email and reset token are required.")
      return
    }
    if (!newPassword) {
      setErrorMessage("Please enter a new password.")
      return
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage("Passwords do not match.")
      return
    }

    try {
      setResetting(true)
      const res = await fetch("/api/medusa/customers/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          token: token.trim(),
          password: newPassword,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        const message = data?.error || "Unable to reset your password."
        setErrorMessage(message)
        toast.error(message)
        return
      }
      toast.success("Password updated. You can sign in now.")
      setInfoMessage("Password updated successfully. Please login with your new password.")
      setToken("")
      setNewPassword("")
      setConfirmPassword("")
    } catch (err) {
      console.error("failed to reset password", err)
      setErrorMessage("Something went wrong. Please try again.")
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-sm font-medium text-green-700 hover:text-green-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to login
          </Link>
        </div>

        <div className="rounded-2xl bg-white p-8 shadow-xl ring-1 ring-slate-100">
          <h1 className="text-3xl font-bold text-slate-900">Reset your password</h1>
          <p className="mt-2 text-slate-600">
            Request a reset link and then set a fresh password once you receive the token in your email.
          </p>

          {errorMessage && (
            <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errorMessage}
            </div>
          )}
          {infoMessage && (
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {infoMessage}
            </div>
          )}

          <div className="mt-8 grid gap-10">
            <section>
              <h2 className="text-lg font-semibold text-slate-900">1. Request reset instructions</h2>
              <form className="mt-4 grid gap-4" onSubmit={handleRequest}>
                <label className="text-sm font-medium text-slate-700" htmlFor="reset-email">
                  Email address
                </label>
                <Input
                  id="reset-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
                <Button type="submit" disabled={!email || requesting}>
                  {requesting ? (
                    <span className="flex items-center gap-2 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending instructions...
                    </span>
                  ) : (
                    "Send reset link"
                  )}
                </Button>
              </form>
            </section>

            <section className="border-t border-slate-100 pt-8">
              <h2 className="text-lg font-semibold text-slate-900">2. Update your password</h2>
              <form className="mt-4 grid gap-4" onSubmit={handleReset}>
                <label className="text-sm font-medium text-slate-700" htmlFor="reset-token">
                  Reset token
                </label>
                <Input
                  id="reset-token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste the token from your email"
                  required
                />
                <label className="text-sm font-medium text-slate-700" htmlFor="new-password">
                  New password
                </label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                />
                <label className="text-sm font-medium text-slate-700" htmlFor="confirm-password">
                  Confirm new password
                </label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                <Button
                  type="submit"
                  disabled={!email || !token || !newPassword || resetting}
                >
                  {resetting ? (
                    <span className="flex items-center gap-2 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Updating password...
                    </span>
                  ) : (
                    "Reset password"
                  )}
                </Button>
              </form>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
