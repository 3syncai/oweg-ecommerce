"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Mail,
  Eye,
  EyeOff,
  Phone,
  Loader2,
  ChevronDown,
  Lock,
  KeyRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth, type StoreCustomer } from "@/contexts/AuthProvider";

const COUNTRY_CODES = [
  { code: "+91", country: "IN", flag: "🇮🇳", name: "India" },
  { code: "+1", country: "US", flag: "🇺🇸", name: "USA" },
  { code: "+44", country: "GB", flag: "🇬🇧", name: "UK" },
  { code: "+971", country: "AE", flag: "🇦🇪", name: "UAE" },
  { code: "+65", country: "SG", flag: "🇸🇬", name: "Singapore" },
];

const BRAND = "#7AC943";
const BRAND_LIGHT = "#8FD95A";

type InputType = "email" | "phone" | "unknown";

function getApiMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const record = payload as Record<string, unknown>;

  const directError = record.error;
  if (typeof directError === "string" && directError.trim()) return directError;
  if (directError && typeof directError === "object") {
    const nested = (directError as Record<string, unknown>).message;
    if (typeof nested === "string" && nested.trim()) return nested;
  }

  const directMessage = record.message;
  if (typeof directMessage === "string" && directMessage.trim())
    return directMessage;

  const dataMessage =
    record.data && typeof record.data === "object"
      ? (record.data as Record<string, unknown>).message
      : null;
  if (typeof dataMessage === "string" && dataMessage.trim()) return dataMessage;

  return fallback;
}

export type CustomerLoginFlowProps = {
  variant?: "page" | "modal";
  onSuccess: (customer: NonNullable<StoreCustomer>) => void;
  onClose?: () => void;
  /** Path to return to after signup (e.g. /checkout?buyNow=1...) */
  signupRedirectPath?: string;
  /** Forgot-password href (defaults to /forgot) */
  forgotHref?: string;
  className?: string;
};

export default function CustomerLoginFlow({
  variant = "page",
  onSuccess,
  onClose,
  signupRedirectPath,
  forgotHref = "/forgot",
  className = "",
}: CustomerLoginFlowProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [identifier, setIdentifier] = useState("");
  const [inputType, setInputType] = useState<InputType>("unknown");
  const [countryCode, setCountryCode] = useState("+91");
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [authMethod, setAuthMethod] = useState<"password" | "otp">("password");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [otpRequestedFor, setOtpRequestedFor] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requiresPasswordReset, setRequiresPasswordReset] = useState(false);
  const [sendingResetLink, setSendingResetLink] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [mounted, setMounted] = useState(false);

  const { setCustomer, refresh } = useAuth();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

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

  const detectInputType = (value: string): InputType => {
    const cleaned = value.replace(/[\s-()]/g, "");
    if (/^\d+$/.test(cleaned)) {
      if (/^[6-9]\d{0,9}$/.test(cleaned)) return "phone";
      if (cleaned.length >= 1) return "phone";
    }
    if (value.includes("@")) return "email";
    if (/^[a-zA-Z0-9._-]+$/.test(value) && value.length > 0) return "unknown";
    return "unknown";
  };

  const normalizePhoneDigits = (value: string) => value.replace(/[\s-()]/g, "");

  const phoneE164 = () => `${countryCode}${normalizePhoneDigits(identifier)}`;

  const handleIdentifierChange = (value: string) => {
    setIdentifier(value);
    setInputType(detectInputType(value));
    if (requiresPasswordReset) setRequiresPasswordReset(false);
  };

  async function completeLogin(nextCustomer: NonNullable<StoreCustomer> | null) {
    if (nextCustomer) {
      setCustomer(nextCustomer);
      onSuccess(nextCustomer);
      return;
    }
    await refresh();
    onSuccess({ id: "session" } as NonNullable<StoreCustomer>);
  }

  async function handleStepOne(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!identifier.trim()) {
      return setError("Please enter your email or mobile number");
    }
    if (inputType === "phone") {
      const cleaned = normalizePhoneDigits(identifier);
      if (cleaned.length < 10) {
        return setError("Please enter a valid mobile number");
      }
    } else if (inputType === "email") {
      if (!identifier.includes("@") || !identifier.includes(".")) {
        return setError("Please enter a valid email address");
      }
    }
    setStep(2);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setRequiresPasswordReset(false);

    if (authMethod === "otp") {
      if (!otpRequestedFor) {
        return setError("Please request an OTP first.");
      }
      if (!otp.trim()) {
        return setError(
          inputType === "phone"
            ? "Please enter the 4-digit OTP."
            : "Please enter the 6-digit OTP.",
        );
      }

      try {
        setBusy(true);
        const endpoint =
          inputType === "phone"
            ? "/api/auth/verify-otp"
            : "/api/medusa/auth/login-otp/verify";
        const payload =
          inputType === "phone"
            ? { phone: phoneE164(), otp: otp.trim() }
            : { email: otpRequestedFor, otp: otp.trim() };
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
          credentials: "include",
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => null);
        if (!res.ok) {
          const resetRequired =
            data?.code === "PASSWORD_RESET_REQUIRED" ||
            data?.requires_password_reset === true;
          if (resetRequired) {
            const resetMessage =
              "Due to a security update, you'll need to reset your password once. After that, login will work as usual.";
            setError(getApiMessage(data, resetMessage));
            setRequiresPasswordReset(true);
            toast.info(resetMessage);
            return;
          }
          const message = getApiMessage(data, "Invalid or expired OTP.");
          setError(message);
          toast.error(message);
          return;
        }

        const nextCustomer = data?.customer ?? data?.data?.customer ?? null;
        toast.success("Welcome back!");
        await completeLogin(nextCustomer);
        return;
      } catch {
        setError("Login failed. Please try again.");
        return;
      } finally {
        setBusy(false);
      }
    }

    if (!password) {
      return setError("Please enter your password");
    }
    if (!navigator.onLine) {
      return setError("You are offline. Connect to the internet to sign in.");
    }

    try {
      setBusy(true);
      const fullIdentifier =
        inputType === "phone" ? phoneE164() : identifier.trim();

      const res = await fetch("/api/medusa/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
        credentials: "include",
        body: JSON.stringify({ identifier: fullIdentifier, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        const resetRequired =
          data?.code === "PASSWORD_RESET_REQUIRED" ||
          data?.requires_password_reset === true;
        if (resetRequired) {
          const resetMessage =
            "Due to a security update, you'll need to reset your password once. After that, login will work as usual.";
          setError(getApiMessage(data, resetMessage));
          setRequiresPasswordReset(true);
          toast.info(resetMessage);
          return;
        }
        const message = getApiMessage(data, "Login failed. Please try again.");
        setError(message);
        toast.error(message);
        return;
      }

      setRequiresPasswordReset(false);
      toast.success("Welcome back!");
      await completeLogin(data?.customer ?? null);
    } catch {
      setError("Login failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSendOtp() {
    setError(null);
    try {
      setBusy(true);
      const isPhoneFlow = inputType === "phone";
      const endpoint = isPhoneFlow
        ? "/api/auth/send-otp"
        : "/api/medusa/auth/login-otp/request";
      const email = identifier.trim().toLowerCase();
      if (!isPhoneFlow && (!email.includes("@") || !email.includes("."))) {
        setError("Please enter a valid email address.");
        return;
      }
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
        credentials: "include",
        body: JSON.stringify(
          isPhoneFlow ? { phone: phoneE164() } : { email },
        ),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const resetRequired =
          data?.code === "PASSWORD_RESET_REQUIRED" ||
          data?.requires_password_reset === true;
        if (resetRequired) {
          const resetMessage =
            "Due to a security update, you'll need to reset your password once. After that, login will work as usual.";
          setError(getApiMessage(data, resetMessage));
          setRequiresPasswordReset(true);
          toast.info(resetMessage);
          return;
        }
        const message = getApiMessage(
          data,
          "Something went wrong. Please try again.",
        );
        setError(message);
        toast.error(message);
        return;
      }

      setOtpSent(true);
      setOtpRequestedFor(isPhoneFlow ? phoneE164() : email);
      setCooldown(30);
      toast.success(
        getApiMessage(
          data,
          isPhoneFlow
            ? "If an account exists, an OTP has been sent to your mobile number."
            : "If an account exists, an OTP has been sent to your email.",
        ),
      );
    } catch {
      setError("Something went wrong. Please try again.");
      toast.error("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSendPasswordResetLink() {
    setError(null);
    const email = identifier.trim().toLowerCase();
    if (!email.includes("@") || !email.includes(".")) {
      setError("Please enter a valid email address.");
      return;
    }
    try {
      setSendingResetLink(true);
      const res = await fetch("/api/medusa/customers/password-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
        credentials: "include",
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message = getApiMessage(
          data,
          "Unable to send reset link. Please try again.",
        );
        setError(message);
        toast.error(message);
        return;
      }
      toast.success(
        getApiMessage(data, "If an account exists, a reset link has been sent."),
      );
    } catch {
      setError("Unable to send reset link. Please try again.");
      toast.error("Unable to send reset link. Please try again.");
    } finally {
      setSendingResetLink(false);
    }
  }

  function handleBack() {
    setStep(1);
    setError(null);
    setPassword("");
    setOtp("");
    setOtpSent(false);
    setOtpRequestedFor(null);
    setCooldown(0);
    setRequiresPasswordReset(false);
  }

  const selectedCountry =
    COUNTRY_CODES.find((c) => c.code === countryCode) || COUNTRY_CODES[0];

  const signupHref =
    signupRedirectPath && signupRedirectPath !== "/"
      ? `/signup?redirect=${encodeURIComponent(signupRedirectPath)}`
      : "/signup";

  const isModal = variant === "modal";

  return (
    <section
      className={`rounded-2xl border border-slate-200/60 bg-white/90 backdrop-blur-sm shadow-xl flex flex-col ${
        isModal ? "p-6 md:p-7" : "p-8 md:p-10"
      } ${className}`.trim()}
      style={{
        fontFamily: 'OPTIHandelGothic-Light, "Inter", "Arial", sans-serif',
      }}
    >
      {mounted && !isOnline && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 text-sm">
          You are offline. Forms are disabled until connection is restored.
        </div>
      )}

      <div className={`mb-6 ${isModal ? "mb-5" : "mb-8"} flex items-start justify-between gap-3`}>
        <div>
          <h1
            id="customer-login-title"
            className={`font-bold mb-1 ${isModal ? "text-2xl" : "text-3xl"}`}
            style={{ color: BRAND }}
          >
            {step === 1 ? "Welcome Back" : "Sign In"}
          </h1>
          <p className="text-slate-600 text-sm">
            {step === 1
              ? "Enter your details to continue"
              : "Choose how you'd like to sign in"}
          </p>
        </div>
        {isModal && onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        ) : null}
      </div>

      {step === 1 && (
        <form onSubmit={handleStepOne} className="grid gap-5" noValidate>
          <div className="grid gap-2">
            <label
              htmlFor="login-identifier"
              className="text-sm font-medium text-slate-700"
            >
              Email or Mobile Number
            </label>
            <div className="relative">
              {inputType === "phone" && (
                <div className="absolute left-0 top-0 bottom-0 flex items-center">
                  <button
                    type="button"
                    onClick={() => setShowCountryDropdown(!showCountryDropdown)}
                    className="h-full px-3 flex items-center gap-1 border-r hover:bg-slate-50 rounded-l-lg transition cursor-pointer"
                    style={{ borderColor: "#e2e8f0" }}
                  >
                    <span className="text-lg">{selectedCountry.flag}</span>
                    <span className="text-sm font-medium text-slate-700">
                      {selectedCountry.code}
                    </span>
                    <ChevronDown className="h-3 w-3 text-slate-500" />
                  </button>
                  {showCountryDropdown && (
                    <div className="absolute top-full left-0 mt-1 bg-white border rounded-lg shadow-lg z-10 py-1 w-48">
                      {COUNTRY_CODES.map((country) => (
                        <button
                          key={country.code}
                          type="button"
                          onClick={() => {
                            setCountryCode(country.code);
                            setShowCountryDropdown(false);
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2 text-sm cursor-pointer"
                        >
                          <span className="text-lg">{country.flag}</span>
                          <span className="font-medium">{country.code}</span>
                          <span className="text-slate-600">{country.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <input
                id="login-identifier"
                name="identifier"
                required
                type="text"
                inputMode={inputType === "phone" ? "tel" : "email"}
                autoComplete="username"
                placeholder={
                  inputType === "phone" ? "9876543210" : "jane@example.com"
                }
                value={identifier}
                onChange={(e) => handleIdentifierChange(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white py-3.5 pr-12 text-[16px] outline-none focus:ring-2 focus:ring-offset-1 transition"
                style={{
                  paddingLeft: inputType === "phone" ? "130px" : "16px",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = BRAND;
                  e.currentTarget.style.boxShadow = `0 0 0 3px ${BRAND_LIGHT}40`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "#e2e8f0";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                {inputType === "phone" ? (
                  <Phone className="h-5 w-5 text-green-600" />
                ) : inputType === "email" ? (
                  <Mail className="h-5 w-5 text-blue-600" />
                ) : (
                  <Mail className="h-5 w-5 text-slate-400" />
                )}
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!identifier || busy || !isOnline}
            className="w-full rounded-lg px-6 py-3.5 font-semibold text-white transition-all hover:shadow-lg hover:-translate-y-0.5 active:scale-[.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 cursor-pointer"
            style={{ backgroundColor: BRAND }}
          >
            {busy ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Please wait...
              </span>
            ) : (
              "Continue →"
            )}
          </button>

          <div className="text-center space-y-3 pt-2">
            <p className="text-sm text-slate-600">
              New to OWEG?{" "}
              <Link
                href={signupHref}
                className="font-semibold hover:underline cursor-pointer"
                style={{ color: BRAND }}
              >
                Create an account
              </Link>
            </p>
            <p className="text-xs text-slate-500 leading-relaxed">
              By continuing, you agree to our{" "}
              <Link className="underline hover:text-slate-700" href="/terms">
                Terms
              </Link>{" "}
              and{" "}
              <Link
                className="underline hover:text-slate-700"
                href="/privacy-policy"
              >
                Privacy Policy
              </Link>
            </p>
          </div>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={handleLogin} className="grid gap-5" noValidate>
          <div className="bg-slate-50 rounded-lg p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {inputType === "phone" ? (
                <Phone className="h-5 w-5 text-green-600 shrink-0" />
              ) : (
                <Mail className="h-5 w-5 text-blue-600 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-xs text-slate-500">Signing in as:</p>
                <p className="font-medium text-slate-800 truncate">
                  {inputType === "phone"
                    ? `${countryCode} ${identifier}`
                    : identifier}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleBack}
              className="text-sm font-medium hover:underline cursor-pointer shrink-0"
              style={{ color: BRAND }}
            >
              Edit
            </button>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-700">
              Choose authentication method
            </label>
            <div className="inline-flex w-full rounded-lg border border-slate-200 p-1 bg-slate-50">
              <button
                type="button"
                onClick={() => setAuthMethod("password")}
                className={`flex-1 rounded-md px-4 py-2.5 text-sm font-medium transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  authMethod === "password"
                    ? "bg-white shadow-sm"
                    : "text-slate-600 hover:text-slate-800"
                }`}
                style={authMethod === "password" ? { color: BRAND } : undefined}
              >
                <Lock className="h-4 w-4" />
                Password
              </button>
              <button
                type="button"
                onClick={() => setAuthMethod("otp")}
                className={`flex-1 rounded-md px-4 py-2.5 text-sm font-medium transition-all cursor-pointer flex items-center justify-center gap-2 ${
                  authMethod === "otp"
                    ? "bg-white shadow-sm"
                    : "text-slate-600 hover:text-slate-800"
                }`}
                style={authMethod === "otp" ? { color: BRAND } : undefined}
              >
                <KeyRound className="h-4 w-4" />
                OTP
              </button>
            </div>
          </div>

          {authMethod === "password" && (
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="login-password"
                  className="text-sm font-medium text-slate-700"
                >
                  Password
                </label>
                <Link
                  href={forgotHref}
                  className="text-xs font-medium hover:underline cursor-pointer"
                  style={{ color: BRAND }}
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="login-password"
                  name="password"
                  required
                  type={showPwd ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3.5 pr-12 text-[16px] outline-none transition"
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = BRAND;
                    e.currentTarget.style.boxShadow = `0 0 0 3px ${BRAND}20`;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "#e2e8f0";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-slate-500 hover:bg-slate-100 cursor-pointer"
                  aria-label={showPwd ? "Hide password" : "Show password"}
                >
                  {showPwd ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>
          )}

          {authMethod === "otp" && (
            <div className="grid gap-3">
              <button
                type="button"
                disabled={busy || cooldown > 0 || !isOnline}
                onClick={handleSendOtp}
                className="w-full rounded-lg border-2 px-4 py-3 text-sm font-medium transition-all hover:bg-green-50 disabled:opacity-50 cursor-pointer"
                style={{ borderColor: BRAND, color: BRAND }}
              >
                {busy ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending...
                  </span>
                ) : !isOnline ? (
                  "Go online to send OTP"
                ) : otpSent ? (
                  cooldown > 0 ? (
                    `Resend OTP in ${cooldown}s`
                  ) : (
                    "Resend OTP"
                  )
                ) : (
                  `Send OTP to ${inputType === "phone" ? "mobile" : "email"}`
                )}
              </button>

              {otpSent && (
                <div className="grid gap-2">
                  <label
                    htmlFor="login-otp"
                    className="text-sm font-medium text-slate-700"
                  >
                    Enter OTP
                  </label>
                  <input
                    id="login-otp"
                    name="otp"
                    required
                    inputMode="numeric"
                    pattern="[0-9]{4,8}"
                    autoComplete="one-time-code"
                    placeholder={
                      inputType === "phone"
                        ? "Enter 4-digit code"
                        : "Enter 6-digit code"
                    }
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    maxLength={inputType === "phone" ? 4 : 6}
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3.5 text-center text-2xl tracking-widest font-semibold outline-none transition"
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = BRAND;
                      e.currentTarget.style.boxShadow = `0 0 0 3px ${BRAND}20`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "#e2e8f0";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                  <p className="text-xs text-slate-500 text-center">
                    OTP sent to {otpRequestedFor || identifier}
                  </p>
                </div>
              )}
              <p className="text-xs text-slate-500">
                Didn&apos;t receive it? Check your Spam/Junk folder too.
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          {requiresPasswordReset && (
            <button
              type="button"
              disabled={sendingResetLink || busy || !isOnline}
              onClick={handleSendPasswordResetLink}
              className="w-full rounded-lg border-2 px-4 py-3 text-sm font-medium transition-all hover:bg-green-50 disabled:opacity-50 cursor-pointer"
              style={{ borderColor: BRAND, color: BRAND }}
            >
              {sendingResetLink ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending reset link...
                </span>
              ) : (
                "Send password reset link"
              )}
            </button>
          )}

          <div className="grid gap-3 pt-1">
            <button
              type="submit"
              disabled={
                busy ||
                !isOnline ||
                (authMethod === "password" && !password) ||
                (authMethod === "otp" && !otp)
              }
              className="w-full rounded-lg px-6 py-3.5 font-semibold text-white transition-all hover:shadow-lg hover:-translate-y-0.5 active:scale-[.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 cursor-pointer"
              style={{ backgroundColor: BRAND }}
            >
              {busy ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Signing in...
                </span>
              ) : (
                "Sign In"
              )}
            </button>
            <button
              type="button"
              onClick={handleBack}
              className="w-full rounded-lg border-2 border-slate-200 bg-white px-6 py-3 font-medium text-slate-700 transition-all hover:bg-slate-50 active:scale-[.98] cursor-pointer"
            >
              ← Back
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
