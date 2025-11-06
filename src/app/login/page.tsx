"use client";

import React, { useMemo, useState, useEffect, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { Mail, Eye, EyeOff, X, UserPlus, Loader2 } from "lucide-react";
import { FcGoogle } from "react-icons/fc";

// OWEG Login + Register -- green theme + PWA-friendly behaviors
// File: app/login/page.tsx (Next.js App Router)
// Tailwind required. Install icons: npm i lucide-react react-icons

// Minimal type for the PWA install prompt (not in TS lib by default)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type BIPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function LoginPageInner() {
  // THEME
  const BRAND = "#2E7D32"; // adjust if you want a different green

  // VIEW
  const [tab, setTab] = useState<"password" | "otp">("password");
  const [showPwd, setShowPwd] = useState(false);
  // Keep setMode for dead code references in disabled slide-over
  const [, setMode] = useState<"login" | "register">("login");

  // ONLINE / OFFLINE (PWA-friendly UX)
  const [isOnline, setIsOnline] = useState(true);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    if (typeof navigator !== "undefined") setIsOnline(navigator.onLine);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);

  // Optional: in-page PWA install CTA
  // Removed beforeinstallprompt handler (unused)

  // LOGIN
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // OTP helpers
  const [otpSent, setOtpSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  // REGISTER
  const [reg, setReg] = useState({
    type: "individual" as "individual" | "business",
    referral: "",
    first: "",
    last: "",
    email: "",
    mobile: "",
    pwd: "",
    confirm: "",
    newsletter: "yes" as "yes" | "no",
    gst: "",
    company: "",
  });
  const [regError, setRegError] = useState("");

  const gstValid = useMemo(() => {
    if (reg.type !== "business") return true;
    return /^[0-9A-Z]{15}$/.test(reg.gst || "");
  }, [reg.type, reg.gst]);

  const regCanSubmit = useMemo(() => {
    const basic =
      reg.first &&
      reg.last &&
      reg.email &&
      reg.mobile &&
      reg.pwd &&
      reg.confirm;
    const okPwd = reg.pwd === reg.confirm;
    const businessOk = reg.type !== "business" || (gstValid && reg.company);
    return Boolean(basic && okPwd && businessOk);
  }, [reg, gstValid]);

  // ACTIONS -- wire to your APIs
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!identifier) return setError("Please enter email or mobile.");
    if (tab === "password" && !password)
      return setError("Please enter your password.");
    if (tab === "otp" && !otp) return setError("Please enter the OTP.");
    if (!navigator.onLine)
      return setError("You are offline. Connect to the internet to sign in.");

    try {
      setBusy(true);
      // Example PWA-safe fetch (no caching of auth):
      // await fetch("/api/auth/login", {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      //   cache: "no-store",
      //   credentials: "include",
      //   body: JSON.stringify({ identifier, password })
      // });
      await new Promise((r) => setTimeout(r, 800));
      // router.push("/account")
    } catch {
      setError("Login failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSendOtp() {
    setError(null);
    if (!identifier) return setError("Enter your email or mobile first.");
    if (!navigator.onLine)
      return setError("You are offline. Connect to request an OTP.");
    try {
      setBusy(true);
      // Example PWA-safe fetch (no caching):
      // await fetch("/api/auth/send-otp", {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      //   cache: "no-store",
      //   body: JSON.stringify({ identifier })
      // });
      await new Promise((r) => setTimeout(r, 700));
      setOtpSent(true);
      setCooldown(30);
    } catch {
      setError("Could not send OTP. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function onGoogle() {
    alert("Google sign-in placeholder");
  }

  function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (reg.pwd !== reg.confirm) return setRegError("Passwords do not match");
    if (reg.type === "business" && !gstValid)
      return setRegError("Please enter a valid 15-character GSTIN");
    setRegError("");
    alert(
      `Registered ${reg.first} ${reg.last} as ${reg.type}` +
        (reg.type === "business"
          ? ` (GST: ${reg.gst}, Company: ${reg.company})`
          : "")
    );
  }

  // Public banner image for preview (replace with your own when ready)
  const PROMO_IMAGE_URL = "/loginofferbanner.webp";

  return (
    <div className="min-h-[100svh] bg-white text-slate-800">
      {/* Top green utichlity bar */}
      

      {/* Header */}


      {/* Offline banner (after mount to avoid hydration mismatch) */}
      {mounted && !isOnline && (
        <div className="mx-auto max-w-6xl px-4 pt-3">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 text-sm">
            You are offline. Forms are disabled until connection is restored.
          </div>
        </div>
      )}

      {/* Main: Login + Promo panel */}
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Login card */}
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm order-2 md:order-1">
            <h1 className="text-lg font-semibold" style={{ color: BRAND }}>
              Login
            </h1>

            {/* Segmented tabs */}
            <div
              className="mt-3 inline-flex rounded-lg bg-green-50 p-1 text-sm"
              style={{ borderColor: BRAND }}
            >
              <button
                onClick={() => setTab("password")}
                className={
                  "rounded-md px-3 py-1.5 transition " +
                  (tab === "password"
                    ? "bg-white shadow"
                    : "text-slate-700 hover:text-slate-900")
                }
                style={tab === "password" ? { color: BRAND } : undefined}
              >
                Password
              </button>
              <button
                onClick={() => setTab("otp")}
                className={
                  "rounded-md px-3 py-1.5 transition " +
                  (tab === "otp"
                    ? "bg-white shadow"
                    : "text-slate-700 hover:text-slate-900")
                }
                style={tab === "otp" ? { color: BRAND } : undefined}
              >
                OTP
              </button>
            </div>

            <form onSubmit={handleLogin} className="mt-5 grid gap-4" noValidate>
              {/* Identifier */}
              <label htmlFor="identifier" className="grid gap-1">
                <span className="text-sm font-medium">
                  Email address or Mobile
                </span>
                <div className="relative">
                  <input
                    id="identifier"
                    name="identifier"
                    required
                    type="text"
                    inputMode="email"
                    autoComplete="username"
                    placeholder="jane@doe.com or 9876543210"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="w-full rounded-lg border bg-white px-3 py-2.5 pr-9 text-[15px] outline-none ring-4 ring-transparent"
                    style={{ borderColor: "#c7d7c9" }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = BRAND)}
                    onBlur={(e) =>
                      (e.currentTarget.style.borderColor = "#c7d7c9")
                    }
                  />
                  <Mail className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 opacity-60" />
                </div>
              </label>

              {/* Password or OTP */}
              {tab === "password" ? (
                <label htmlFor="password" className="grid gap-1">
                  <span className="text-sm font-medium">Password</span>
                  <div className="relative">
                    <input
                      id="password"
                      name="password"
                      required
                      type={showPwd ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Enter your Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-lg border bg-white px-3 py-2.5 pr-10 text-[15px] outline-none ring-4 ring-transparent"
                      style={{ borderColor: "#c7d7c9" }}
                      onFocus={(e) =>
                        (e.currentTarget.style.borderColor = BRAND)
                      }
                      onBlur={(e) =>
                        (e.currentTarget.style.borderColor = "#c7d7c9")
                      }
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((s) => !s)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-2 text-slate-500 hover:bg-slate-50"
                      aria-label={showPwd ? "Hide password" : "Show password"}
                    >
                      {showPwd ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </label>
              ) : (
                <div className="grid gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busy || cooldown > 0 || !isOnline}
                      onClick={handleSendOtp}
                      className="inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm hover:bg-green-50 disabled:opacity-50"
                      style={{ borderColor: BRAND, color: BRAND }}
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : null}
                      {!isOnline
                        ? "Go online to send OTP"
                        : otpSent
                        ? cooldown > 0
                          ? `Resend in ${cooldown}s`
                          : "Resend OTP"
                        : "Send OTP"}
                    </button>
                    <span className="text-xs text-slate-500">
                      OTP will be sent to your email/mobile.
                    </span>
                  </div>
                  <label htmlFor="otp" className="grid gap-1">
                    <span className="text-sm font-medium">Enter OTP</span>
                    <input
                      id="otp"
                      name="otp"
                      required
                      inputMode="numeric"
                      pattern="[0-9]{4,8}"
                      autoComplete="one-time-code"
                      placeholder="6-digit code"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      className="w-full rounded-lg border bg-white px-3 py-2.5 text-[15px] outline-none ring-4 ring-transparent"
                      style={{ borderColor: "#c7d7c9" }}
                      onFocus={(e) =>
                        (e.currentTarget.style.borderColor = BRAND)
                      }
                      onBlur={(e) =>
                        (e.currentTarget.style.borderColor = "#c7d7c9")
                      }
                    />
                  </label>
                </div>
              )}

              {/* Utilities */}
              {tab === "password" && (
                <div className="flex items-center justify-between text-sm">
                  <label
                    htmlFor="remember"
                    className="inline-flex items-center gap-2"
                  >
                    <input
                      id="remember"
                      name="remember"
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-white"
                      style={{ accentColor: BRAND }}
                    />
                    <span>Remember me</span>
                  </label>
                  <Link href="/forgot" className="hover:underline" style={{ color: BRAND }}>
                    Forgot password?
                  </Link>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={busy || !isOnline}
                className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-medium text-white hover:opacity-95 active:scale-[.99] disabled:opacity-60"
                style={{ backgroundColor: BRAND }}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {!isOnline
                  ? "Go online to continue"
                  : tab === "password"
                  ? "Continue"
                  : "Verify & Continue"}
              </button>

              {/* Divider */}
              <div className="relative my-2 text-center text-xs text-slate-400">
                <span className="before:absolute before:left-0 before:top-1/2 before:h-px before:w-2/5 before:-translate-y-1/2 before:bg-slate-200 after:absolute after:right-0 after:top-1/2 after:h-px after:w-2/5 after:-translate-y-1/2 after:bg-slate-200">
                  or
                </span>
              </div>

              {/* Social */}
              <div className="grid gap-3">
                <button
                  type="button"
                  onClick={onGoogle}
                  className="rounded-lg border bg-white px-4 py-2.5 hover:bg-green-50"
                  style={{ borderColor: BRAND }}
                >
                  <div
                    className="mx-auto flex items-center justify-center gap-2 text-sm font-medium"
                    style={{ color: BRAND }}
                  >
                    <FcGoogle className="h-4 w-4" /> Continue with Google
                  </div>
                </button>
              </div>

              <p className="text-xs leading-relaxed text-slate-600">
                By continuing, you agree to our{" "}
                <Link className="underline" href="/terms" style={{ color: BRAND }}>
                  Terms
                </Link>{" "}
                and{" "}
                <Link className="underline" href="/privacy" style={{ color: BRAND }}>
                  Privacy Policy
                </Link>
                .
              </p>

              <p className="text-sm text-slate-700">
                New to OWEG?{" "}
                <Link href="/signup" className="font-medium underline" style={{ color: BRAND }}>
                  Create your account
                </Link>
              </p>
            </form>
          </section>

          {/* Offers/Ads panel */}
          <aside
            className="order-1 md:order-2 rounded-xl border bg-white shadow-sm overflow-hidden p-0"
            style={{ borderColor: "#d9ead9" }}
          >
            <div className="relative h-full min-h-[16rem]">
              <Image src={PROMO_IMAGE_URL} alt="Current OWEG promotion" fill className="object-cover" />
            </div>
          </aside>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 text-center text-xs text-slate-500">
          &copy; {new Date().getFullYear()} OWEG
        </div>
      </footer>

      {/* REGISTER SLIDE-OVER disabled; using dedicated /signup page */}
      {false && (
        <div
          className="fixed inset-0 z-50"
          aria-labelledby="register-title"
          aria-modal="true"
          role="dialog"
        >
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setMode("login")}
          />
          <section className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-auto border-l bg-white shadow-2xl">
            <div className="border-b" style={{ backgroundColor: "#f3faf3" }}>
              <div className="mx-auto max-w-2xl px-6 py-4 flex items-center justify-between">
                <h3
                  id="register-title"
                  className="text-lg font-semibold"
                  style={{ color: BRAND }}
                >
                  Create account
                </h3>
                <button
                  onClick={() => setMode("login")}
                  className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                  aria-label="Close register"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <form
              onSubmit={handleRegister}
              className="mx-auto max-w-2xl px-6 py-6 grid gap-5"
            >
              {/* Are you */}
              <fieldset className="grid gap-2">
                <legend className="text-sm font-medium">Are you</legend>
                <div className="inline-flex rounded-lg bg-green-50 p-1 text-sm w-max">
                  <button
                    type="button"
                    onClick={() => setReg({ ...reg, type: "individual" })}
                    className={
                      "rounded-md px-3 py-1.5 transition " +
                      (reg.type === "individual"
                        ? "bg-white shadow"
                        : "text-slate-700 hover:text-slate-900")
                    }
                    style={
                      reg.type === "individual" ? { color: BRAND } : undefined
                    }
                  >
                    Individual
                  </button>
                  <button
                    type="button"
                    onClick={() => setReg({ ...reg, type: "business" })}
                    className={
                      "rounded-md px-3 py-1.5 transition " +
                      (reg.type === "business"
                        ? "bg-white shadow"
                        : "text-slate-700 hover:text-slate-900")
                    }
                    style={
                      reg.type === "business" ? { color: BRAND } : undefined
                    }
                  >
                    Business
                  </button>
                </div>
              </fieldset>

              {/* Business-only */}
              {reg.type === "business" && (
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-1" htmlFor="gst">
                    <span className="text-sm font-medium">GST No</span>
                    <input
                      id="gst"
                      name="gst"
                      required
                      maxLength={15}
                      value={reg.gst}
                      onChange={(e) =>
                        setReg({ ...reg, gst: e.target.value.toUpperCase() })
                      }
                      placeholder="27ABCDE1234F1Z5"
                      pattern="[0-9A-Z]{15}"
                      className="w-full rounded-lg border bg-white px-3 py-2.5 outline-none ring-4 ring-transparent"
                      style={{ borderColor: "#c7d7c9" }}
                      onFocus={(e) =>
                        (e.currentTarget.style.borderColor = BRAND)
                      }
                      onBlur={(e) =>
                        (e.currentTarget.style.borderColor = "#c7d7c9")
                      }
                    />
                  </label>
                  <label className="grid gap-1" htmlFor="company">
                    <span className="text-sm font-medium">Company Name</span>
                    <input
                      id="company"
                      name="company"
                      required
                      value={reg.company}
                      onChange={(e) =>
                        setReg({ ...reg, company: e.target.value })
                      }
                      placeholder="Registered business name"
                      className="w-full rounded-lg border bg-white px-3 py-2.5 outline-none ring-4 ring-transparent"
                      style={{ borderColor: "#c7d7c9" }}
                      onFocus={(e) =>
                        (e.currentTarget.style.borderColor = BRAND)
                      }
                      onBlur={(e) =>
                        (e.currentTarget.style.borderColor = "#c7d7c9")
                      }
                    />
                  </label>
                </div>
              )}
              {reg.type === "business" && !gstValid && (
                <p className="text-sm text-rose-600" aria-live="polite">
                  GSTIN must be 15 characters (A-Z, 0-9).
                </p>
              )}

              {/* Referral */}
              <label className="grid gap-1" htmlFor="referral">
                <span className="text-sm font-medium">Referral Code</span>
                <input
                  id="referral"
                  name="referral"
                  type="text"
                  value={reg.referral}
                  onChange={(e) => setReg({ ...reg, referral: e.target.value })}
                  placeholder="Optional"
                  className="w-full rounded-lg border bg-white px-3 py-2.5 outline-none ring-4 ring-transparent"
                  style={{ borderColor: "#c7d7c9" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = BRAND)}
                  onBlur={(e) =>
                    (e.currentTarget.style.borderColor = "#c7d7c9")
                  }
                />
              </label>

              {/* Name */}
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1" htmlFor="first">
                  <span className="text-sm font-medium">First Name</span>
                  <input
                    id="first"
                    name="first"
                    required
                    type="text"
                    autoComplete="given-name"
                    value={reg.first}
                    onChange={(e) => setReg({ ...reg, first: e.target.value })}
                    placeholder="First Name"
                    className="w-full rounded-lg border bg-white px-3 py-2.5 outline-none ring-4 ring-transparent"
                    style={{ borderColor: "#c7d7c9" }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = BRAND)}
                    onBlur={(e) =>
                      (e.currentTarget.style.borderColor = "#c7d7c9")
                    }
                  />
                </label>
                <label className="grid gap-1" htmlFor="last">
                  <span className="text-sm font-medium">Last Name</span>
                  <input
                    id="last"
                    name="last"
                    required
                    type="text"
                    autoComplete="family-name"
                    value={reg.last}
                    onChange={(e) => setReg({ ...reg, last: e.target.value })}
                    placeholder="Last Name"
                    className="w-full rounded-lg border bg-white px-3 py-2.5 outline-none ring-4 ring-transparent"
                    style={{ borderColor: "#c7d7c9" }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = BRAND)}
                    onBlur={(e) =>
                      (e.currentTarget.style.borderColor = "#c7d7c9")
                    }
                  />
                </label>
              </div>

              {/* Email & Mobile */}
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1" htmlFor="email">
                  <span className="text-sm font-medium">E-Mail</span>
                  <input
                    id="email"
                    name="email"
                    required
                    type="email"
                    autoComplete="email"
                    value={reg.email}
                    onChange={(e) => setReg({ ...reg, email: e.target.value })}
                    placeholder="name@example.com"
                    className="w-full rounded-lg border bg-white px-3 py-2.5 outline-none ring-4 ring-transparent"
                    style={{ borderColor: "#c7d7c9" }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = BRAND)}
                    onBlur={(e) =>
                      (e.currentTarget.style.borderColor = "#c7d7c9")
                    }
                  />
                </label>
                <label className="grid gap-1" htmlFor="mobile">
                  <span className="text-sm font-medium">Mobile</span>
                  <input
                    id="mobile"
                    name="mobile"
                    required
                    inputMode="tel"
                    pattern="[0-9]{10}"
                    autoComplete="tel"
                    value={reg.mobile}
                    onChange={(e) => setReg({ ...reg, mobile: e.target.value })}
                    placeholder="10-digit mobile number"
                    className="w-full rounded-lg border bg-white px-3 py-2.5 outline-none ring-4 ring-transparent"
                    style={{ borderColor: "#c7d7c9" }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = BRAND)}
                    onBlur={(e) =>
                      (e.currentTarget.style.borderColor = "#c7d7c9")
                    }
                  />
                </label>
              </div>

              {/* Passwords */}
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1" htmlFor="pwd">
                  <span className="text-sm font-medium">Your Password</span>
                  <input
                    id="pwd"
                    name="pwd"
                    required
                    type="password"
                    autoComplete="new-password"
                    value={reg.pwd}
                    onChange={(e) => setReg({ ...reg, pwd: e.target.value })}
                    placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                    className="w-full rounded-lg border bg-white px-3 py-2.5 outline-none ring-4 ring-transparent"
                    style={{ borderColor: "#c7d7c9" }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = BRAND)}
                    onBlur={(e) =>
                      (e.currentTarget.style.borderColor = "#c7d7c9")
                    }
                  />
                </label>
                <label className="grid gap-1" htmlFor="confirm">
                  <span className="text-sm font-medium">Password Confirm</span>
                  <input
                    id="confirm"
                    name="confirm"
                    required
                    type="password"
                    autoComplete="new-password"
                    value={reg.confirm}
                    onChange={(e) =>
                      setReg({ ...reg, confirm: e.target.value })
                    }
                    placeholder="Repeat password"
                    className="w-full rounded-lg border bg-white px-3 py-2.5 outline-none ring-4 ring-transparent"
                    style={{ borderColor: "#c7d7c9" }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = BRAND)}
                    onBlur={(e) =>
                      (e.currentTarget.style.borderColor = "#c7d7c9")
                    }
                  />
                </label>
              </div>
              {reg.pwd && reg.confirm && reg.pwd !== reg.confirm && (
                <p className="text-sm text-rose-600" aria-live="polite">
                  Passwords do not match.
                </p>
              )}

              {/* Newsletter */}
              <fieldset className="grid gap-1">
                <legend className="text-sm font-medium">
                  Newsletter -- Subscribe
                </legend>
                <div className="inline-flex gap-2 rounded-lg bg-green-50 p-1 text-sm w-max">
                  <button
                    type="button"
                    onClick={() => setReg({ ...reg, newsletter: "yes" })}
                    className={
                      "rounded-md px-3 py-1.5 transition " +
                      (reg.newsletter === "yes"
                        ? "bg-white shadow"
                        : "text-slate-700 hover:text-slate-900")
                    }
                    style={
                      reg.newsletter === "yes" ? { color: BRAND } : undefined
                    }
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => setReg({ ...reg, newsletter: "no" })}
                    className={
                      "rounded-md px-3 py-1.5 transition " +
                      (reg.newsletter === "no"
                        ? "bg-white shadow"
                        : "text-slate-700 hover:text-slate-900")
                    }
                    style={
                      reg.newsletter === "no" ? { color: BRAND } : undefined
                    }
                  >
                    No
                  </button>
                </div>
              </fieldset>

              {/* Actions */}
              {regError && (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {regError}
                </div>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={!regCanSubmit || !isOnline}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 font-medium text-white disabled:opacity-50 hover:opacity-95 active:scale-[.99]"
                  style={{ backgroundColor: BRAND }}
                >
                  <UserPlus className="h-4 w-4" /> Submit
                </button>
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2.5 text-slate-700 hover:bg-green-50"
                  style={{ borderColor: BRAND }}
                >
                  <X className="h-4 w-4" /> Cancel
                </button>
              </div>

              <p className="text-xs text-slate-500">
                By creating an account, you agree to our Terms & Privacy Policy.
              </p>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  )
}
