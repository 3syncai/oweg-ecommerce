"use client"

import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import {
  Badge,
  Button,
  Heading,
  Input,
  Prompt,
  Text,
  clx,
  toast,
} from "@medusajs/ui"
import {
  Sun,
  Moon,
  ComputerDesktop,
  CheckMini,
  XMark,
} from "@medusajs/icons"
import {
  Lock,
  Eye,
  EyeOff,
  Shield,
  CheckCircle2,
  AlertCircle,
  LogOut,
  KeyRound,
  User,
  Palette,
} from "lucide-react"
import { vendorAuthApi, vendorProfileApi } from "@/lib/api/client"
import { performVendorLogout } from "@/lib/vendor-session"
import { type ThemeMode, useTheme } from "@/lib/theme"
import { useRouter } from "next/navigation"

type SettingsSection = "general" | "security" | "account"

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

const NAV_ITEMS: Array<{
  id: SettingsSection
  label: string
  Icon: typeof Palette
}> = [
  { id: "general", label: "General", Icon: Palette },
  { id: "security", label: "Security", Icon: Shield },
  { id: "account", label: "Account", Icon: User },
]

type VendorSettingsModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialSection?: SettingsSection
}

export default function VendorSettingsModal({
  open,
  onOpenChange,
  initialSection = "general",
}: VendorSettingsModalProps) {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [section, setSection] = useState<SettingsSection>(initialSection)
  const [mounted, setMounted] = useState(false)

  const [vendorEmail, setVendorEmail] = useState<string | null>(null)
  const [lastLogin, setLastLogin] = useState<string | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)

  const [currentPwd, setCurrentPwd] = useState("")
  const [newPwd, setNewPwd] = useState("")
  const [confirmPwd, setConfirmPwd] = useState("")
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [savingPwd, setSavingPwd] = useState(false)
  const [logoutPromptOpen, setLogoutPromptOpen] = useState(false)

  const themeOptions: Array<{
    value: ThemeMode
    label: string
    Icon: typeof Sun
  }> = [
    { value: "light", label: "Light", Icon: Sun },
    { value: "dark", label: "Dark", Icon: Moon },
    { value: "system", label: "System", Icon: ComputerDesktop },
  ]

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return
    setSection(initialSection)
  }, [open, initialSection])

  useEffect(() => {
    if (!open) return

    const loadProfile = async () => {
      setLoadingProfile(true)
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
  }, [open])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false)
    }
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", onKeyDown)
    return () => {
      document.body.style.overflow = ""
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [open, onOpenChange])

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
    await performVendorLogout("/login")
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

  if (!open || !mounted) return null

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-[2px]"
        onClick={() => onOpenChange(false)}
        aria-hidden
      />
      <div
        className="fixed inset-0 z-[201] flex items-center justify-center p-3 sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vendor-settings-title"
      >
        <div
          className="flex h-[min(640px,92vh)] w-full max-w-4xl overflow-hidden rounded-2xl border border-ui-border-base bg-ui-bg-base shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Sidebar */}
          <aside className="hidden w-52 shrink-0 flex-col border-r border-ui-border-base bg-ui-bg-subtle/40 sm:flex">
            <div className="flex items-center justify-between border-b border-ui-border-base px-4 py-3">
              <Text size="small" weight="plus" id="vendor-settings-title">
                Settings
              </Text>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-md p-1 text-ui-fg-muted hover:bg-ui-bg-base-hover hover:text-ui-fg-base"
                aria-label="Close settings"
              >
                <XMark />
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-0.5 p-2">
              {NAV_ITEMS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSection(id)}
                  className={clx(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                    section === id
                      ? "bg-ui-bg-base text-ui-fg-base shadow-sm ring-1 ring-ui-border-base/70"
                      : "text-ui-fg-subtle hover:bg-ui-bg-base/80 hover:text-ui-fg-base"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </button>
              ))}
            </nav>
          </aside>

          {/* Content */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-ui-border-base px-4 py-3 sm:hidden">
              <select
                value={section}
                onChange={(e) => setSection(e.target.value as SettingsSection)}
                className="rounded-lg border border-ui-border-base bg-ui-bg-base px-3 py-2 text-sm"
              >
                {NAV_ITEMS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-md p-1 text-ui-fg-muted hover:bg-ui-bg-base-hover"
                aria-label="Close settings"
              >
                <XMark />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 sm:p-6">
              {section === "general" && (
                <div className="space-y-6 max-w-lg">
                  <div>
                    <Heading level="h2" className="text-lg">
                      General
                    </Heading>
                    <Text size="small" className="text-ui-fg-subtle mt-1">
                      Appearance and display preferences.
                    </Text>
                  </div>

                  <div className="space-y-3">
                    <Text size="small" weight="plus">
                      Theme
                    </Text>
                    <div className="flex flex-col gap-1 rounded-xl border border-ui-border-base/70 p-1">
                      {themeOptions.map(({ value, label, Icon }) => {
                        const active = theme === value
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setTheme(value)}
                            className={clx(
                              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                              active
                                ? "bg-ui-bg-subtle text-ui-fg-base"
                                : "text-ui-fg-subtle hover:bg-ui-bg-subtle/60"
                            )}
                          >
                            <span className="flex h-4 w-4 items-center justify-center text-ui-fg-muted">
                              <Icon />
                            </span>
                            <span className="flex-1">{label}</span>
                            {active && (
                              <span className="text-oweg-600 dark:text-oweg-400">
                                <CheckMini />
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {section === "security" && (
                <div className="space-y-6 max-w-xl">
                  <div>
                    <Heading level="h2" className="text-lg">
                      Security
                    </Heading>
                    <Text size="small" className="text-ui-fg-subtle mt-1">
                      Password and account protection.
                    </Text>
                  </div>

                  <div className="space-y-4 rounded-xl border border-ui-border-base/70 p-4 sm:p-5">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-oweg-500/10 text-oweg-700 dark:text-oweg-400">
                        <Lock className="h-4 w-4" />
                      </div>
                      <div>
                        <Text weight="plus">Change password</Text>
                        <Text size="small" className="text-ui-fg-subtle">
                          Use a strong password you don&apos;t use elsewhere.
                        </Text>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="space-y-1.5">
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
                            className="absolute inset-y-0 right-3 flex items-center text-ui-fg-muted"
                          >
                            {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
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
                              className="absolute inset-y-0 right-3 flex items-center text-ui-fg-muted"
                            >
                              {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                          {newPwd.length > 0 && (
                            <Text size="xsmall" className="text-ui-fg-subtle">
                              Strength: {strength.label}
                            </Text>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          <Text size="small" weight="plus">
                            Confirm password
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
                              className="absolute inset-y-0 right-3 flex items-center text-ui-fg-muted"
                            >
                              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => {
                          setCurrentPwd("")
                          setNewPwd("")
                          setConfirmPwd("")
                        }}
                      >
                        Reset
                      </Button>
                      <Button size="small" disabled={!canSubmit} onClick={handleChangePassword}>
                        {savingPwd ? "Updating…" : "Update password"}
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-start justify-between gap-4 rounded-xl border border-ui-border-base/70 p-4 sm:p-5">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-oweg-500/10 text-oweg-700 dark:text-oweg-400">
                        <KeyRound className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <Text weight="plus">Two-factor authentication</Text>
                          <Badge color="orange" size="xsmall">
                            Coming soon
                          </Badge>
                        </div>
                        <Text size="small" className="text-ui-fg-subtle mt-0.5">
                          Require a verification code when signing in.
                        </Text>
                      </div>
                    </div>
                    <Button variant="secondary" size="small" disabled>
                      Enable
                    </Button>
                  </div>
                </div>
              )}

              {section === "account" && (
                <div className="space-y-6 max-w-xl">
                  <div>
                    <Heading level="h2" className="text-lg">
                      Account
                    </Heading>
                    <Text size="small" className="text-ui-fg-subtle mt-1">
                      Your vendor session and profile.
                    </Text>
                  </div>

                  <div className="rounded-xl border border-ui-border-base/70 p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <Text size="small" className="text-ui-fg-subtle">
                          Signed in as
                        </Text>
                        {loadingProfile ? (
                          <div className="h-5 w-48 animate-pulse rounded bg-ui-bg-base-hover" />
                        ) : (
                          <Text weight="plus">{vendorEmail || "Unknown"}</Text>
                        )}
                        <Text size="small" className="text-ui-fg-subtle">
                          Last sign-in: {loadingProfile ? "…" : formatDate(lastLogin)}
                        </Text>
                      </div>
                      <Badge color="green" className="shrink-0">
                        <CheckCircle2 className="mr-1 inline h-3 w-3" />
                        Active
                      </Badge>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={() => {
                        onOpenChange(false)
                        router.push("/profile")
                      }}
                    >
                      Edit store profile
                    </Button>
                  </div>

                  <div className="flex items-start justify-between gap-4 rounded-xl border border-ui-border-base/70 p-4 sm:p-5">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
                        <LogOut className="h-4 w-4" />
                      </div>
                      <div>
                        <Text weight="plus">Sign out</Text>
                        <Text size="small" className="text-ui-fg-subtle mt-0.5">
                          Clears your session and local cache on this device.
                        </Text>
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={() => setLogoutPromptOpen(true)}
                    >
                      Sign out
                    </Button>
                  </div>

                  <div className="flex items-start gap-2 text-ui-fg-subtle">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <Text size="xsmall">
                      If you suspect your account is compromised, change your password
                      immediately and contact support.
                    </Text>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Prompt
        variant="confirmation"
        open={logoutPromptOpen}
        onOpenChange={setLogoutPromptOpen}
      >
        <Prompt.Content>
          <Prompt.Header>
            <Prompt.Title>Sign out of vendor portal?</Prompt.Title>
            <Prompt.Description>
              Your session and cached data on this browser will be cleared.
            </Prompt.Description>
          </Prompt.Header>
          <Prompt.Footer>
            <Prompt.Cancel>Cancel</Prompt.Cancel>
            <Prompt.Action onClick={handleLogout}>Yes, sign out</Prompt.Action>
          </Prompt.Footer>
        </Prompt.Content>
      </Prompt>
    </>,
    document.body
  )
}
