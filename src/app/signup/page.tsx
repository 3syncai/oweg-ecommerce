"use client";

import { Suspense, useState, useEffect } from "react";
import type { ChangeEvent, FocusEvent } from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2, Heart, PackageCheck, ShoppingBag, ArrowUpRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthProvider";
import { getSafeRedirect } from "@/lib/auth-redirect";
import "./signup.css";

const Signup = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [userType, setUserType] = useState("individual");
  const [newsletter, setNewsletter] = useState("yes");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { customer, initializing, setCustomer, refresh } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  // Where to send the user after a successful sign-up. Defaults to "/" but
  // when the user came from a guarded page (e.g. /checkout) we honour the
  // ?redirect=... param so they land back where they were.
  const redirectTarget = getSafeRedirect(searchParams.get("redirect"));
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Referral code validation state
  const [referralStatus, setReferralStatus] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [referralAgentName, setReferralAgentName] = useState<string>("");
  const [referralError, setReferralError] = useState<string>("");

  const validateReferralCode = async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) {
      setReferralStatus("idle");
      setReferralAgentName("");
      setReferralError("");
      return;
    }
    setReferralStatus("checking");
    setReferralAgentName("");
    setReferralError("");
    try {
      const res = await fetch(`/api/store/validate-referral?code=${encodeURIComponent(trimmed)}`)
      const data = await res.json();
      if (data.valid) {
        setReferralStatus("valid");
        setReferralAgentName(data.agent_name || "");
      } else {
        setReferralStatus("invalid");
        setReferralError("Invalid referral code. Please check or leave blank.");
      }
    } catch {
      setReferralStatus("invalid");
      setReferralError("Could not validate code. Try again or leave blank.");
    }
  };

  const FORM_KEYS = [
    "referral",
    "firstName",
    "lastName",
    "email",
    "mobile",
    "password",
    "confirmPassword",
    "gst",
    "company",
  ] as const;
  type FormKeys = typeof FORM_KEYS[number];
  type FormState = Record<FormKeys, string>;

  const [form, setForm] = useState<FormState>({
    referral: "",
    firstName: "",
    lastName: "",
    email: "",
    mobile: "",
    password: "",
    confirmPassword: "",
    gst: "",
    company: "",
  });

  // Read referral code from URL query parameters or localStorage on component mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const refCode = params.get('ref');

      // Priority: URL param > localStorage
      if (refCode) {
        setForm(prev => ({ ...prev, referral: refCode }));
      } else {
        // Check localStorage for referral code from product page
        try {
          const storedRef = localStorage.getItem('affiliateReferralCode');
          if (storedRef) {
            setForm(prev => ({ ...prev, referral: storedRef }));
            console.log('Loaded referral code from localStorage:', storedRef);
          }
        } catch (error) {
          console.error('Failed to read referral code from localStorage:', error);
        }
      }
    }
  }, []);

  // track touched fields so errors appear after blur/submit
  const [touched, setTouched] = useState<Partial<Record<FormKeys, boolean>>>({});

  // inline errors
  const [errors, setErrors] = useState<Partial<Record<FormKeys, string>>>({});

  useEffect(() => {
    if (initializing) return;
    if (customer) {
      router.replace(redirectTarget);
    }
  }, [customer, initializing, router, redirectTarget]);

  // helpers: regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const mobileRegex = /^\d{10}$/;
  const gstRegex = /^[0-9A-Z]{15}$/i;

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setForm((s) => ({ ...s, [id as FormKeys]: value }));
    // live-validate the field
    validateField(id as FormKeys, value);
  };

  const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
    const { id } = e.target;
    setTouched((t) => ({ ...t, [id as FormKeys]: true }));
    validateField(id as FormKeys, form[id as FormKeys]);
  };

  const validateField = (field: FormKeys, value: string) => {
    let msg = "";

    // required fields
    const requiredFields: FormKeys[] = [
      "firstName",
      "lastName",
      "email",
      "mobile",
      "password",
      "confirmPassword",
    ];

    if (requiredFields.includes(field)) {
      if (!value || value.trim() === "") {
        msg = "This field is required";
        setErrors((prev) => ({ ...prev, [field]: msg }));
        return;
      }
    }

    // specific validations
    if (field === "email") {
      if (value && !emailRegex.test(value)) {
        msg = "Enter a valid email";
      }
    }
    if (field === "mobile") {
      if (value && !mobileRegex.test(value)) {
        msg = "Enter a valid 10-digit mobile number";
      }
    }
    if (field === "password") {
      if (value && value.length < 8) {
        msg = "Password must be at least 8 characters";
      }
    }
    if (field === "confirmPassword") {
      if (value && value !== form.password) {
        msg = "Passwords do not match";
      }
    }
    if (field === "gst" && userType === "business") {
      if (value && !gstRegex.test(value)) {
        msg = "GSTIN must be 15 characters (A-Z, 0-9)";
      }
    }

    // set/unset error
    setErrors((prev) => {
      const next = { ...prev };
      if (msg) next[field] = msg;
      else delete next[field];
      return next;
    });
  };

  // validate all on submit
  const validateAll = () => {
    const newErrors: Partial<Record<FormKeys, string>> = {};
    const required: FormKeys[] = [
      "firstName",
      "lastName",
      "email",
      "mobile",
      "password",
      "confirmPassword",
    ];

    required.forEach((f) => {
      if (!form[f] || form[f].toString().trim() === "") {
        newErrors[f] = "This field is required";
      }
    });

    if (form.email && !emailRegex.test(form.email)) {
      newErrors.email = "Enter a valid email";
    }
    if (form.mobile && !mobileRegex.test(form.mobile)) {
      newErrors.mobile = "Enter a valid 10-digit mobile number";
    }
    if (form.password && form.password.length < 8) {
      newErrors.password = "Password must be at least 8 characters";
    }
    if (form.confirmPassword && form.confirmPassword !== form.password) {
      newErrors.confirmPassword = "Passwords do not match";
    }
    if (userType === "business") {
      if (!form.company || form.company.trim() === "") {
        newErrors.company = "Company name is required for business";
      }
      if (!form.gst || !gstRegex.test(form.gst)) {
        newErrors.gst = "Valid GSTIN is required for business";
      }
    }

    setErrors(newErrors);
    // mark all touched so errors visible
    const allTouched: Partial<Record<FormKeys, boolean>> = {};
    FORM_KEYS.forEach((k) => (allTouched[k] = true));
    setTouched(allTouched);

    return Object.keys(newErrors).length === 0;
  };

  const isFormValid = () => {
    // quick check without marking touched: required + specific checks
    if (
      !form.firstName ||
      !form.lastName ||
      !form.email ||
      !form.mobile ||
      !form.password ||
      !form.confirmPassword
    )
      return false;
    if (!emailRegex.test(form.email)) return false;
    if (!mobileRegex.test(form.mobile)) return false;
    if (form.password.length < 8) return false;
    if (form.password !== form.confirmPassword) return false;
    if (userType === "business") {
      if (!form.company || !gstRegex.test(form.gst)) return false;
    }
    // Block submission if user entered an invalid referral code
    if (form.referral.trim() && referralStatus === "invalid") return false;
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!validateAll()) {
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setSubmitError("You are offline. Please connect to the internet to continue.");
      return;
    }

    const payload = {
      referral: form.referral.trim() || undefined,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim().toLowerCase(),
      mobile: form.mobile.trim(),
      password: form.password,
      gst: userType === "business" ? form.gst.trim() : undefined,
      company: userType === "business" ? form.company.trim() : undefined,
      userType: userType as "individual" | "business",
      newsletter: newsletter === "yes",
    };

    try {
      setSubmitting(true);
      const res = await fetch("/api/medusa/customers/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        const message = data?.error || "Unable to create your account.";
        setSubmitError(message);
        toast.error(message);
        return;
      }

      const nextCustomer = data?.customer ?? null;

      // Save referral code to database if present
      if (payload.referral && nextCustomer?.id) {
        try {
          const saveRes = await fetch('/api/store/save-referral', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              customer_id: nextCustomer.id,
              referral_code: payload.referral
            }),
            credentials: 'include'
          });
          const saveData = await saveRes.json();
          if (saveData.success) {
            console.log('Referral code saved successfully');
          } else {
            console.warn('Failed to save referral code:', saveData);
          }
        } catch (e) {
          console.error('Error saving referral code:', e);
        }
      }

      if (nextCustomer) {
        setCustomer(nextCustomer);
      } else {
        await refresh();
      }
      toast.success("Welcome to OWEG! Your account is ready.");
      router.push(redirectTarget);
    } catch (err) {
      console.error("Registration failed", err);
      setSubmitError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="signup-page">
      <div className="signup-main">
        <div className="signup-container">
          <div className="auth-shell">
            <aside className="signup-intro" aria-label="Your OWEG account">
              <Link href="/" className="signup-wordmark" aria-label="OWEG home">
                <Image src="/icons/brand/oweg-wordmark.svg" alt="OWEG" width={160} height={40} priority />
              </Link>
              <span className="signup-eyebrow">A LITTLE INSPIRATION. A LOT TO EXPLORE.</span>
              <h2>Good finds.<br />Great beginnings.</h2>
              <p className="signup-intro-copy">Make room for the things you love. Your next everyday favourite is waiting.</p>
              <div className="signup-benefits">
                <div><span><Heart size={20} /></span><p><strong>Keep your favourites close</strong><small>Save the finds you want to come back to.</small></p></div>
                <div><span><PackageCheck size={20} /></span><p><strong>Every order, in one place</strong><small>Follow your purchases from your account.</small></p></div>
                <div><span><ShoppingBag size={20} /></span><p><strong>For you. For your business.</strong><small>Choose the account that fits your needs.</small></p></div>
              </div>
              <Link href="/" className="signup-explore">Explore OWEG <ArrowUpRight size={17} /></Link>
            </aside>

            <section className="form-column">
              <div className="form-panel">
                <div className="signup-heading">
                  <span className="signup-eyebrow">WELCOME TO OWEG</span>
                  <h1>Create your account</h1>
                  <p>
                    A few details, and you’re ready to explore.
                  </p>
                </div>

              {submitError && (
                <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {submitError}
                </div>
              )}

              <form className="signup-form" onSubmit={handleSubmit} noValidate>
                {/* User Type */}
                <div className="signup-wide signup-account-type">
                  <Label className="signup-group-label">I’m shopping as</Label>
                  <RadioGroup
                    value={userType}
                    onValueChange={(v) => {
                      setUserType(v);
                      // reset business-specific errors when switching
                      setErrors((prev) => {
                        const p = { ...prev };
                        delete p.gst;
                        delete p.company;
                        return p;
                      });
                    }}
                    className="signup-type-options"
                    aria-label="Account type"
                  >
                    <div className={`signup-type-card ${userType === "individual" ? "is-selected" : ""}`}>
                      <RadioGroupItem value="individual" id="individual" />
                      <Label htmlFor="individual" className="font-normal cursor-pointer font-footer">
                        <span>Individual<small>For everyday shopping</small></span>
                      </Label>
                    </div>
                    <div className={`signup-type-card ${userType === "business" ? "is-selected" : ""}`}>
                      <RadioGroupItem value="business" id="business" />
                      <Label htmlFor="business" className="font-normal cursor-pointer font-footer">
                        <span>Business<small>For your company</small></span>
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Business-only */}
                {userType === "business" && (
                  <div className="signup-wide signup-business-fields">
                    <div className={`input-group ${form.gst ? "filled" : ""}`}>
                      <Label htmlFor="gst" className="form-label font-footer">
                        GST No
                      </Label>
                      <Input
                        id="gst"
                        maxLength={15}
                        placeholder="27ABCDE1234F1Z5"
                        className="mt-2 font-footer form-input"
                        value={form.gst}
                        onChange={(e) =>
                          setForm((s) => ({ ...s, gst: e.target.value.toUpperCase() }))
                        }
                        onBlur={handleBlur}
                        aria-invalid={!!errors.gst}
                        aria-describedby={errors.gst ? "gst-error" : undefined}
                      />
                      {touched.gst && errors.gst && (
                        <p id="gst-error" className="mt-1 text-xs text-rose-600 font-footer">
                          {errors.gst}
                        </p>
                      )}
                    </div>
                    <div className={`input-group ${form.company ? "filled" : ""}`}>
                      <Label htmlFor="company" className="form-label font-footer">
                        Company Name
                      </Label>
                      <Input
                        id="company"
                        placeholder="Registered business name"
                        className="mt-2 font-footer form-input"
                        value={form.company}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        aria-invalid={!!errors.company}
                        aria-describedby={errors.company ? "company-error" : undefined}
                      />
                      {touched.company && errors.company && (
                        <p id="company-error" className="mt-1 text-xs text-rose-600 font-footer">
                          {errors.company}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Referral */}
                <div className={`signup-wide input-group signup-referral ${form.referral ? "filled" : ""}`}>
                  <Label htmlFor="referral" className="form-label font-footer">
                    Referral code <span className="text-xs text-muted-foreground">(optional)</span>
                  </Label>
                  <div className="relative mt-2">
                    <Input
                      id="referral"
                      placeholder="Enter referral (if you have one)"
                      className={`font-footer form-input pr-10 ${
                        referralStatus === "valid" ? "border-green-400" :
                        referralStatus === "invalid" ? "border-red-400" : ""
                      }`}
                      value={form.referral}
                      onChange={(e) => {
                        handleChange(e);
                        setReferralStatus("idle");
                        setReferralAgentName("");
                        setReferralError("");
                      }}
                      onBlur={(e) => {
                        handleBlur(e);
                        validateReferralCode(form.referral);
                      }}
                    />
                    {referralStatus === "checking" && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">Checking...</span>
                    )}
                    {referralStatus === "valid" && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500">OK</span>
                    )}
                    {referralStatus === "invalid" && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-red-500">X</span>
                    )}
                  </div>
                  {referralStatus === "valid" && referralAgentName && (
                    <p className="mt-1 text-xs text-green-600 font-footer">Referred by: <strong>{referralAgentName}</strong></p>
                  )}
                  {referralStatus === "invalid" && (
                    <p className="mt-1 text-xs text-rose-600 font-footer">{referralError}</p>
                  )}
                </div>

                {/* First Name */}
                <div className={`input-group ${form.firstName ? "filled" : ""}`}>
                  <Label htmlFor="firstName" className="form-label font-footer">
                    First name
                  </Label>
                  <Input
                    id="firstName"
                    placeholder="Enter your First name"
                    className="mt-2 font-footer form-input"
                    value={form.firstName}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    aria-invalid={!!errors.firstName}
                    aria-describedby={errors.firstName ? "firstName-error" : undefined}
                    required
                  />
                  {touched.firstName && errors.firstName && (
                    <p id="firstName-error" className="mt-1 text-xs text-rose-600 font-footer">
                      {errors.firstName}
                    </p>
                  )}
                </div>

                {/* Last Name */}
                <div className={`input-group ${form.lastName ? "filled" : ""}`}>
                  <Label htmlFor="lastName" className="form-label font-footer">
                    Last name
                  </Label>
                  <Input
                    id="lastName"
                    placeholder="Enter your Last name"
                    className="mt-2 font-footer form-input"
                    value={form.lastName}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    aria-invalid={!!errors.lastName}
                    aria-describedby={errors.lastName ? "lastName-error" : undefined}
                    required
                  />
                  {touched.lastName && errors.lastName && (
                    <p id="lastName-error" className="mt-1 text-xs text-rose-600 font-footer">
                      {errors.lastName}
                    </p>
                  )}
                </div>

                {/* Email */}
                <div className={`input-group ${form.email ? "filled" : ""}`}>
                  <Label htmlFor="email" className="form-label font-footer">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your Email address"
                    className="mt-2 font-footer form-input"
                    value={form.email}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    aria-invalid={!!errors.email}
                    aria-describedby={errors.email ? "email-error" : undefined}
                    required
                  />
                  {touched.email && errors.email && (
                    <p id="email-error" className="mt-1 text-xs text-rose-600 font-footer">
                      {errors.email}
                    </p>
                  )}
                </div>

                {/* Mobile */}
                <div className={`input-group ${form.mobile ? "filled" : ""}`}>
                  <Label htmlFor="mobile" className="form-label font-footer">
                    Mobile no.
                  </Label>
                  <Input
                    id="mobile"
                    type="tel"
                    placeholder="Enter your Mobile no."
                    className="mt-2 font-footer form-input"
                    value={form.mobile}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    aria-invalid={!!errors.mobile}
                    aria-describedby={errors.mobile ? "mobile-error" : undefined}
                    required
                  />
                  {touched.mobile && errors.mobile && (
                    <p id="mobile-error" className="mt-1 text-xs text-rose-600 font-footer">
                      {errors.mobile}
                    </p>
                  )}
                </div>

                {/* Password */}
                <div className={`input-group ${form.password ? "filled" : ""}`}>
                  <Label htmlFor="password" className="form-label font-footer">
                    Password
                  </Label>
                  <div className="relative mt-2">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      className="pr-16 font-footer form-input"
                      value={form.password}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      aria-invalid={!!errors.password}
                      aria-describedby={errors.password ? "password-error" : undefined}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="eye-btn"
                      aria-label="Toggle password visibility"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      <span className="ml-1 text-sm font-footer">{showPassword ? "Hide" : "Show"}</span>
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 font-footer">
                    Use 8 or more characters with a mix of letters, numbers & symbols
                  </p>
                  {touched.password && errors.password && (
                    <p id="password-error" className="mt-1 text-xs text-rose-600 font-footer">
                      {errors.password}
                    </p>
                  )}
                </div>

                {/* Confirm Password */}
                <div className={`input-group ${form.confirmPassword ? "filled" : ""}`}>
                  <Label htmlFor="confirmPassword" className="form-label font-footer">
                    Confirm Password
                  </Label>
                  <div className="relative mt-2">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      className="pr-16 font-footer form-input"
                      value={form.confirmPassword}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      aria-invalid={!!errors.confirmPassword}
                      aria-describedby={errors.confirmPassword ? "confirmPassword-error" : undefined}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="eye-btn"
                      aria-label="Toggle confirm password visibility"
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      <span className="ml-1 text-sm font-footer">{showConfirmPassword ? "Hide" : "Show"}</span>
                    </button>
                  </div>
                  {touched.confirmPassword && errors.confirmPassword && (
                    <p id="confirmPassword-error" className="mt-1 text-xs text-rose-600 font-footer">
                      {errors.confirmPassword}
                    </p>
                  )}
                </div>

                {/* Newsletter Subscription */}
                <div className="signup-wide signup-newsletter">
                  <div><Label className="signup-group-label">A little inspiration in your inbox?</Label><p>Receive news and offers from OWEG.</p></div>
                  <RadioGroup value={newsletter} onValueChange={setNewsletter} className="flex gap-5" aria-label="Newsletter subscription">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="yes" id="yes" />
                      <Label htmlFor="yes" className="font-normal cursor-pointer font-footer">Yes</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="no" id="no" />
                      <Label htmlFor="no" className="font-normal cursor-pointer font-footer">No</Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Submit Button */}
                <Button
                  type="submit"
                  className={`signup-wide w-full h-12 text-base font-footer submit-btn ${isFormValid() && !submitting ? "" : "disabled"
                    }`}
                  disabled={!isFormValid() || submitting}
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating your account...
                    </span>
                  ) : (
                    "Create account"
                  )}
                </Button>

                {/* Login Link */}
                <p className="signup-wide signup-login text-center text-sm text-muted-foreground font-footer">
                  Already have an account?{" "}
                  <Link
                    href={
                      redirectTarget && redirectTarget !== "/"
                        ? `/login?redirect=${encodeURIComponent(redirectTarget)}`
                        : "/login"
                    }
                    className="text-foreground hover:text-footer-hover transition-colors font-medium link-like"
                  >
                    Log in
                  </Link>
                </p>
              </form>
              <div className="signup-security"><ShieldCheck size={15} /> One account for your OWEG finds.</div>
              </div>
            </section>

          </div>
        </div>
      </div>


    </div>
  );
};

// useSearchParams() inside <Signup/> requires a Suspense boundary so Next.js
// can statically prerender the page shell. Without this wrapper the build
// fails with "useSearchParams() should be wrapped in a suspense boundary".
const SignupPage = () => {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-slate-600">
          Loading sign up...
        </div>
      }
    >
      <Signup />
    </Suspense>
  );
};

export default SignupPage;
