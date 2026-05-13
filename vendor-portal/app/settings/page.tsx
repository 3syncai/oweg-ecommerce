"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Container,
  Heading,
  Text,
  Input,
  Button,
  Badge,
  Prompt,
  toast,
} from "@medusajs/ui"
import {
  Lock,
  Eye,
  EyeOff,
  Shield,
  CheckCircle2,
  AlertCircle,
  LogOut,
  KeyRound,
} from "lucide-react"
import VendorShell from "@/components/VendorShell"
import { vendorAuthApi, vendorProfileApi } from "@/lib/api/client"

type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4
  label: string
  color: string
}

const evaluateStrength = (password: string): PasswordStrength => {
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++

  const map: Record<number, PasswordStrength> = {
    0: { score: 0, label: "Too weak", color: "bg-red-500" },
    1: { score: 1, label: "Weak", color: "bg-orange-500" },
    2: { score: 2, label: "Okay", color: "bg-yellow-500" },
    3: { score: 3, label: "Strong", color: "bg-green-500" },
    4: { score: 4, label: "Very strong", color: "bg-green-600" },
  }
  return map[score as 0 | 1 | 2 | 3 | 4]
}

export default function SettingsPage() {
  const router = useRouter()

  // Auth + vendor info
  const [vendorEmail, setVendorEmail] = useState<string | null>(null)
  const [lastLogin, setLastLogin] = useState<string | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)

  // Change password form
  const [currentPwd, setCurrentPwd] = useState("")
  const [newPwd, setNewPwd] = useState("")
  const [confirmPwd, setConfirmPwd] = useState("")
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [savingPwd, setSavingPwd] = useState(false)

  // Sign-out confirm
  const [logoutPromptOpen, setLogoutPromptOpen] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem("vendor_token")
    if (!token) {
      router.push("/login")
      return
    }
    const loadProfile = async () => {
      try {
        const data = await vendorProfileApi.getMe()
        const v = data?.vendor
        setVendorEmail(v?.email || null)
        setLastLogin(v?.last_login_at || null)
      } catch {
        // ignore
      } finally {
        setLoadingProfile(false)
      }
    }
    loadProfile()
  }, [router])

  const strength = useMemo(() => evaluateStrength(newPwd), [newPwd])
  const passwordsMatch = newPwd.length > 0 && newPwd === confirmPwd
  const newPwdValid = newPwd.length >= 8

  const canSubmit =
    currentPwd.length > 0 &&
    newPwdValid &&
    passwordsMatch &&
    currentPwd !== newPwd &&
    !savingPwd

  const handleChangePassword = async () => {
    if (!canSubmit) return
    try {
      setSavingPwd(true)
      await vendorAuthApi.changePassword(currentPwd, newPwd)
      toast.success("Password updated successfully")
      setCurrentPwd("")
      setNewPwd("")
      setConfirmPwd("")
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        err?.message ||
        "Unable to change password"
      toast.error(message)
    } finally {
      setSavingPwd(false)
    }
  }

  const handleLogout = async () => {
    try {
      await vendorAuthApi.logout?.()
    } catch {
      // ignore network failures, we still log out client side
    }
    localStorage.removeItem("vendor_token")
    localStorage.removeItem("vendor_user")
    document.cookie = "vendor_token=; path=/; max-age=0; SameSite=Lax"
    router.push("/login")
  }

  const formatDate = (iso?: string | null) => {
    if (!iso) return "—"
    try {
      return new Date(iso).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    } catch {
      return "—"
    }
  }

  return (
    <VendorShell>
      <Container className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="space-y-1">
          <Heading level="h1">Settings</Heading>
          <Text className="text-ui-fg-subtle">
            Manage how you sign in and protect your vendor account.
          </Text>
        </div>

        {/* Section: Account & Security */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-ui-fg-subtle" />
            <Heading level="h2" className="text-base">
              Account &amp; security
            </Heading>
          </div>

          {/* Account summary card */}
          <div className="border border-ui-border-base rounded-xl bg-ui-bg-base p-5 md:p-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div className="space-y-1">
                <Text size="small" className="text-ui-fg-subtle">
                  Signed in as
                </Text>
                {loadingProfile ? (
                  <div className="h-5 w-48 rounded-md bg-ui-bg-base-hover animate-pulse" />
                ) : (
                  <Text className="font-medium">
                    {vendorEmail || "Unknown"}
                  </Text>
                )}
                <Text size="small" className="text-ui-fg-subtle">
                  Last sign-in: {loadingProfile ? "…" : formatDate(lastLogin)}
                </Text>
              </div>
              <Badge color="green" className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Active
              </Badge>
            </div>
          </div>

          {/* Change password card */}
          <div className="border border-ui-border-base rounded-xl bg-ui-bg-base p-5 md:p-6 space-y-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500 ring-1 ring-blue-500/20">
                <Lock className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <Heading level="h3" className="text-base">
                  Change password
                </Heading>
                <Text size="small" className="text-ui-fg-subtle">
                  Use a strong password you don&apos;t use anywhere else.
                </Text>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2 space-y-2">
                <Text size="small" weight="plus">
                  Current password
                </Text>
                <div className="relative">
                  <Input
                    type={showCurrent ? "text" : "password"}
                    value={currentPwd}
                    onChange={(e) => setCurrentPwd(e.target.value)}
                    placeholder="Enter current password"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent((v) => !v)}
                    className="absolute inset-y-0 right-3 flex items-center text-ui-fg-muted hover:text-ui-fg-base"
                    aria-label={showCurrent ? "Hide password" : "Show password"}
                  >
                    {showCurrent ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Text size="small" weight="plus">
                  New password
                </Text>
                <div className="relative">
                  <Input
                    type={showNew ? "text" : "password"}
                    value={newPwd}
                    onChange={(e) => setNewPwd(e.target.value)}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew((v) => !v)}
                    className="absolute inset-y-0 right-3 flex items-center text-ui-fg-muted hover:text-ui-fg-base"
                    aria-label={showNew ? "Hide password" : "Show password"}
                  >
                    {showNew ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {newPwd.length > 0 && (
                  <div className="space-y-1">
                    <div className="flex gap-1">
                      {[0, 1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className={`h-1.5 flex-1 rounded-full transition-colors ${
                            i < strength.score
                              ? strength.color
                              : "bg-ui-bg-base-hover"
                          }`}
                        />
                      ))}
                    </div>
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      Strength: {strength.label}
                    </Text>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Text size="small" weight="plus">
                  Confirm new password
                </Text>
                <div className="relative">
                  <Input
                    type={showConfirm ? "text" : "password"}
                    value={confirmPwd}
                    onChange={(e) => setConfirmPwd(e.target.value)}
                    placeholder="Re-enter new password"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute inset-y-0 right-3 flex items-center text-ui-fg-muted hover:text-ui-fg-base"
                    aria-label={
                      showConfirm ? "Hide password" : "Show password"
                    }
                  >
                    {showConfirm ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {confirmPwd.length > 0 && (
                  <Text
                    size="xsmall"
                    className={
                      passwordsMatch
                        ? "text-green-600"
                        : "text-ui-fg-error"
                    }
                  >
                    {passwordsMatch
                      ? "Passwords match"
                      : "Passwords do not match"}
                  </Text>
                )}
              </div>
            </div>

            {/* Hints */}
            <div className="rounded-md bg-ui-bg-subtle/40 border border-ui-border-base p-3">
              <Text size="xsmall" className="text-ui-fg-subtle">
                Tips: at least 8 characters, mix uppercase &amp; lowercase, add a
                number and a symbol. Avoid reusing passwords from other sites.
              </Text>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                variant="secondary"
                disabled={savingPwd && !currentPwd && !newPwd && !confirmPwd}
                onClick={() => {
                  setCurrentPwd("")
                  setNewPwd("")
                  setConfirmPwd("")
                }}
              >
                Reset
              </Button>
              <Button
                variant="primary"
                disabled={!canSubmit}
                onClick={handleChangePassword}
              >
                {savingPwd ? "Updating…" : "Update password"}
              </Button>
            </div>
          </div>

          {/* 2FA placeholder card */}
          <div className="border border-ui-border-base rounded-xl bg-ui-bg-base p-5 md:p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10 text-purple-500 ring-1 ring-purple-500/20">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Heading level="h3" className="text-base">
                      Two-factor authentication
                    </Heading>
                    <Badge color="orange">Coming soon</Badge>
                  </div>
                  <Text size="small" className="text-ui-fg-subtle max-w-md">
                    Add an extra layer of security by requiring a verification
                    code from an authenticator app when signing in.
                  </Text>
                </div>
              </div>
              <Button variant="secondary" disabled>
                Enable
              </Button>
            </div>
          </div>

          {/* Sign out card */}
          <div className="border border-ui-border-base rounded-xl bg-ui-bg-base p-5 md:p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10 text-orange-500 ring-1 ring-orange-500/20">
                  <LogOut className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <Heading level="h3" className="text-base">
                    Sign out
                  </Heading>
                  <Text size="small" className="text-ui-fg-subtle max-w-md">
                    End your current session on this browser. You&apos;ll need to
                    sign in again to access your dashboard.
                  </Text>
                </div>
              </div>
              <Button
                variant="secondary"
                onClick={() => setLogoutPromptOpen(true)}
              >
                Sign out
              </Button>
            </div>
          </div>

          {/* Footer note */}
          <div className="flex items-start gap-2 text-ui-fg-subtle">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <Text size="xsmall">
              If you suspect your account is compromised, change your password
              immediately and contact support.
            </Text>
          </div>
        </div>
      </Container>

      <Prompt
        variant="confirmation"
        open={logoutPromptOpen}
        onOpenChange={setLogoutPromptOpen}
      >
        <Prompt.Content>
          <Prompt.Header>
            <Prompt.Title>Sign out of vendor portal?</Prompt.Title>
            <Prompt.Description>
              You&apos;ll need to sign in again to access your dashboard,
              products, and orders.
            </Prompt.Description>
          </Prompt.Header>
          <Prompt.Footer>
            <Prompt.Cancel>Cancel</Prompt.Cancel>
            <Prompt.Action onClick={handleLogout}>
              Yes, sign out
            </Prompt.Action>
          </Prompt.Footer>
        </Prompt.Content>
      </Prompt>
    </VendorShell>
  )
}
