"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { Mail, Eye, EyeOff, Phone, Loader2, ChevronDown, Lock, KeyRound } from "lucide-react";
import { FcGoogle } from "react-icons/fc";

// OWEG Modern Login -- Simplified two-step flow with intelligent detection
// File: app/login/page.tsx (Next.js App Router)

// Country codes for phone number support
const COUNTRY_CODES = [
  { code: "+91", country: "IN", flag: "🇮🇳", name: "India" },
  { code: "+1", country: "US", flag: "🇺🇸", name: "USA" },
  { code: "+44", country: "GB", flag: "🇬🇧", name: "UK" },
  { code: "+971", country: "AE", flag: "🇦🇪", name: "UAE" },
  { code: "+65", country: "SG", flag: "🇸🇬", name: "Singapore" },
];

type InputType = "email" | "phone" | "unknown";

function LoginPageInner() {
  // THEME
  const BRAND = "#7AC943";
  const BRAND_LIGHT = "#8FD95A";

  // STEP MANAGEMENT
  const [step, setStep] = useState<1 | 2>(1); // Step 1: Identifier, Step 2: Auth method

  // INPUT DETECTION
  const [identifier, setIdentifier] = useState("");
  const [inputType, setInputType] = useState<InputType>("unknown");
  const [countryCode, setCountryCode] = useState("+91");
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);

  // AUTH
  const [authMethod, setAuthMethod] = useState<"password" | "otp">("password");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  // OTP helpers
  const [otpSent, setOtpSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  // UI STATE
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // INTELLIGENT INPUT DETECTION
  const detectInputType = (value: string): InputType => {
    // Remove spaces and special characters for detection
    const cleaned = value.replace(/[\s\-\(\)]/g, "");
    
    // Check if it's all digits (phone number)
    if (/^\d+$/.test(cleaned)) {
      // Indian phone numbers start with 6-9 and are 10 digits
      if (/^[6-9]\d{0,9}$/.test(cleaned)) {
        return "phone";
      }
      // Any other number pattern
      if (cleaned.length >= 1) {
        return "phone";
      }
    }
    
    // Check if it contains @ symbol (email)
    if (value.includes("@")) {
      return "email";
    }
    
    // Check if it looks like an email without @ yet
    if (/^[a-zA-Z0-9._-]+$/.test(value) && value.length > 0) {
      return "unknown"; // Could be email or username
    }
    
    return "unknown";
  };

  // Handle identifier input change
  const handleIdentifierChange = (value: string) => {
    setIdentifier(value);
    const type = detectInputType(value);
    setInputType(type);
  };

  // ACTIONS
  async function handleStepOne(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    
    if (!identifier.trim()) {
      return setError("Please enter your email or mobile number");
    }
    
    // Validate based on detected type
    if (inputType === "phone") {
      const cleaned = identifier.replace(/[\s\-\(\)]/g, "");
      if (cleaned.length < 10) {
        return setError("Please enter a valid mobile number");
      }
    } else if (inputType === "email") {
      if (!identifier.includes("@") || !identifier.includes(".")) {
        return setError("Please enter a valid email address");
      }
    }
    
    // Move to step 2
    setStep(2);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    
    if (authMethod === "password" && !password) {
      return setError("Please enter your password");
    }
    if (authMethod === "otp" && !otp) {
      return setError("Please enter the OTP");
    }
    if (!navigator.onLine) {
      return setError("You are offline. Connect to the internet to sign in.");
    }

    try {
      setBusy(true);
      // Example PWA-safe fetch (no caching of auth):
      const fullIdentifier = inputType === "phone" 
        ? `${countryCode}${identifier}` 
        : identifier;
      
      // await fetch("/api/auth/login", {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      //   cache: "no-store",
      //   credentials: "include",
      //   body: JSON.stringify({ 
      //     identifier: fullIdentifier, 
      //     password: authMethod === "password" ? password : undefined,
      //     otp: authMethod === "otp" ? otp : undefined 
      //   })
      // });
      
      await new Promise((r) => setTimeout(r, 800));
      console.log("Login with:", fullIdentifier);
      // router.push("/account")
    } catch {
      setError("Login failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSendOtp() {
    setError(null);
    if (!navigator.onLine) {
      return setError("You are offline. Connect to request an OTP.");
    }
    
    try {
      setBusy(true);
      // const fullIdentifier = inputType === "phone" 
      //   ? `${countryCode}${identifier}` 
      //   : identifier;
        
      // await fetch("/api/auth/send-otp", {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      //   cache: "no-store",
      //   body: JSON.stringify({ identifier: fullIdentifier })
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

  function handleBack() {
    setStep(1);
    setError(null);
    setPassword("");
    setOtp("");
    setOtpSent(false);
  }

  function handleEditIdentifier() {
    setStep(1);
    setError(null);
  }

  // Public banner image for preview (replace with your own when ready)
  const PROMO_IMAGE_URL = "/loginofferbanner.webp";

  // Get current country
  const selectedCountry = COUNTRY_CODES.find(c => c.code === countryCode) || COUNTRY_CODES[0];

  return (
    <div 
      className="min-h-[100svh] bg-gradient-to-br from-slate-50 to-green-50/30 text-slate-800"
      style={{ fontFamily: 'OPTIHandelGothic-Light, "Inter", "Arial", sans-serif' }}
    >
      {/* Offline banner (after mount to avoid hydration mismatch) */}
      {mounted && !isOnline && (
        <div className="mx-auto max-w-6xl px-4 pt-3">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 text-sm">
            ⚠️ You are offline. Forms are disabled until connection is restored.
          </div>
        </div>
      )}

      {/* Main: Login + Promo panel */}
      <main className="mx-auto max-w-7xl px-4 py-12 md:py-20">
        <div className="grid gap-8 md:grid-cols-2 items-stretch">
          {/* Login card */}
          <section className="rounded-2xl border border-slate-200/60 bg-white/90 backdrop-blur-sm p-8 md:p-10 shadow-xl order-2 md:order-1 flex flex-col">
            {/* Header */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold mb-2" style={{ color: BRAND }}>
                {step === 1 ? "Welcome Back" : "Sign In"}
              </h1>
              <p className="text-slate-600 text-sm">
                {step === 1 
                  ? "Enter your details to continue" 
                  : "Choose how you'd like to sign in"}
              </p>
            </div>

            {/* STEP 1: Identifier Input */}
            {step === 1 && (
              <form onSubmit={handleStepOne} className="grid gap-6" noValidate>
                <div className="grid gap-2">
                  <label htmlFor="identifier" className="text-sm font-medium text-slate-700">
                    Email or Mobile Number
                  </label>
                  <div className="relative">
                    {/* Country Code Dropdown for Phone */}
                    {inputType === "phone" && (
                      <div className="absolute left-0 top-0 bottom-0 flex items-center">
                        <button
                          type="button"
                          onClick={() => setShowCountryDropdown(!showCountryDropdown)}
                          className="h-full px-3 flex items-center gap-1 border-r hover:bg-slate-50 rounded-l-lg transition cursor-pointer"
                          style={{ borderColor: "#e2e8f0" }}
                        >
                          <span className="text-lg">{selectedCountry.flag}</span>
                          <span className="text-sm font-medium text-slate-700">{selectedCountry.code}</span>
                          <ChevronDown className="h-3 w-3 text-slate-500" />
                        </button>
                        
                        {/* Dropdown Menu */}
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
                      id="identifier"
                      name="identifier"
                      required
                      type="text"
                      inputMode={inputType === "phone" ? "tel" : "email"}
                      autoComplete="username"
                      placeholder={inputType === "phone" ? "9876543210" : "jane@example.com"}
                      value={identifier}
                      onChange={(e) => handleIdentifierChange(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white py-3.5 pr-12 text-[16px] outline-none focus:ring-2 focus:ring-offset-1 transition"
                      style={{ 
                        paddingLeft: inputType === "phone" ? "130px" : "16px"
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
                    
                    {/* Dynamic Icon */}
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

                {/* Error */}
                {error && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 flex items-start gap-2">
                    <span className="text-rose-500 font-bold">⚠</span>
                    <span>{error}</span>
                  </div>
                )}

                {/* Continue Button */}
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

                {/* Divider */}
                <div className="relative my-2">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="bg-white px-4 text-slate-500">or</span>
                  </div>
                </div>

                {/* Social Login */}
                <button
                  type="button"
                  onClick={onGoogle}
                  disabled={!isOnline}
                  className="w-full rounded-lg border-2 border-slate-200 bg-white px-6 py-3.5 font-medium text-slate-700 transition-all hover:bg-slate-50 hover:border-slate-300 active:scale-[.98] disabled:opacity-50 cursor-pointer"
                >
                  <span className="flex items-center justify-center gap-3">
                    <FcGoogle className="h-5 w-5" />
                    Continue with Google
                  </span>
                </button>

                {/* Footer Links */}
                <div className="text-center space-y-3 pt-4">
                  <p className="text-sm text-slate-600">
                    New to OWEG?{" "}
                    <Link href="/signup" className="font-semibold hover:underline cursor-pointer" style={{ color: BRAND }}>
                      Create an account
                    </Link>
                  </p>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    By continuing, you agree to our{" "}
                    <Link className="underline hover:text-slate-700 cursor-pointer" href="/terms">
                      Terms
                    </Link>{" "}
                    and{" "}
                    <Link className="underline hover:text-slate-700 cursor-pointer" href="/privacy">
                      Privacy Policy
                    </Link>
                  </p>
                </div>
              </form>
            )}

            {/* STEP 2: Authentication Method */}
            {step === 2 && (
              <form onSubmit={handleLogin} className="grid gap-6" noValidate>
                {/* Show identifier with edit option */}
                <div className="bg-slate-50 rounded-lg p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {inputType === "phone" ? (
                      <Phone className="h-5 w-5 text-green-600" />
                    ) : (
                      <Mail className="h-5 w-5 text-blue-600" />
                    )}
                    <div>
                      <p className="text-xs text-slate-500">Signing in as:</p>
                      <p className="font-medium text-slate-800">
                        {inputType === "phone" ? `${countryCode} ${identifier}` : identifier}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleEditIdentifier}
                    className="text-sm font-medium hover:underline cursor-pointer"
                    style={{ color: BRAND }}
                  >
                    Edit
                  </button>
                </div>

                {/* Auth Method Selector - Compact */}
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
                          ? "bg-white shadow-sm text-slate-800"
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
                          ? "bg-white shadow-sm text-slate-800"
                          : "text-slate-600 hover:text-slate-800"
                      }`}
                      style={authMethod === "otp" ? { color: BRAND } : undefined}
                    >
                      <KeyRound className="h-4 w-4" />
                      OTP
                    </button>
                  </div>
                </div>

                {/* Password Field */}
                {authMethod === "password" && (
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between">
                      <label htmlFor="password" className="text-sm font-medium text-slate-700">
                        Password
                      </label>
                      <Link href="/forgot" className="text-xs font-medium hover:underline cursor-pointer" style={{ color: BRAND }}>
                        Forgot password?
                      </Link>
                    </div>
                    <div className="relative">
                      <input
                        id="password"
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
                        {showPwd ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>
                )}

                {/* OTP Field */}
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
                        <label htmlFor="otp" className="text-sm font-medium text-slate-700">
                          Enter OTP
                        </label>
                        <input
                          id="otp"
                          name="otp"
                          required
                          inputMode="numeric"
                          pattern="[0-9]{4,8}"
                          autoComplete="one-time-code"
                          placeholder="Enter 6-digit code"
                          value={otp}
                          onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                          maxLength={6}
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
                          OTP sent to {inputType === "phone" ? `${countryCode} ${identifier}` : identifier}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 flex items-start gap-2">
                    <span className="text-rose-500 font-bold">⚠</span>
                    <span>{error}</span>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="grid gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={busy || !isOnline || (authMethod === "password" && !password) || (authMethod === "otp" && !otp)}
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

          {/* Promo panel - Image Banner */}
          <aside className="order-1 md:order-2 rounded-2xl overflow-hidden shadow-2xl bg-white">
            <div className="relative w-full h-full min-h-[28rem]">
              <Image 
                src={PROMO_IMAGE_URL} 
                alt="OWEG Promotional Banner" 
                fill 
                className="object-cover"
                priority
              />
            </div>
          </aside>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200/60 bg-white/50 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-4 py-6 text-center text-xs text-slate-500">
          &copy; {new Date().getFullYear()} OWEG. All rights reserved.
        </div>
      </footer>
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
