"use client";

import { useState } from "react";
import type { ChangeEvent, FocusEvent } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import Image from "next/image";

const Signup = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [userType, setUserType] = useState("individual");
  const [newsletter, setNewsletter] = useState("yes");

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

  // track touched fields so errors appear after blur/submit
  const [touched, setTouched] = useState<Partial<Record<FormKeys, boolean>>>({});

  // inline errors
  const [errors, setErrors] = useState<Partial<Record<FormKeys, string>>>({});

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
        msg = "GSTIN must be 15 characters (A–Z, 0–9)";
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
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateAll()) {
      // invalid -> inline errors shown
      return;
    }

    // form valid -> proceed (send to API)
    // show a console.log for now
    console.log("Form submitted", form, { userType, newsletter });
    // TODO: call API
  };

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 bg-background py-8">
        <div className="container max-w-3xl mx-auto px-4">
          <div className="bg-card rounded-lg shadow-lg overflow-hidden">
            {/* Banner */}
            <div className="bg-gray-100">
              <Image
                src="/HeroBaneer_3.png"
                alt="OWEG"
                width={1200}
                height={420}
                className="w-full h-56 md:h-72 lg:h-80 object-cover rounded-t-lg"
              />
            </div>

            {/* Form */}
            <div className="p-8">
              <h1 className="text-3xl font-bold text-center mb-8 text-foreground font-footer">
                Register for free to start shopping
              </h1>

              <form className="space-y-6" onSubmit={handleSubmit} noValidate>
                {/* User Type */}
                <div>
                  <Label className="text-base mb-3 block font-footer">Are you?</Label>
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
                    className="flex gap-8"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="individual" id="individual" />
                      <Label htmlFor="individual" className="font-normal cursor-pointer font-footer">
                        Individual
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="business" id="business" />
                      <Label htmlFor="business" className="font-normal cursor-pointer font-footer">
                        Business
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Business-only */}
                {userType === "business" && (
                  <div className="grid gap-6 md:grid-cols-2">
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
                <div className={`input-group ${form.referral ? "filled" : ""}`}>
                  <Label htmlFor="referral" className="form-label font-footer">
                    Referral code
                  </Label>
                  <Input
                    id="referral"
                    placeholder="Referral code"
                    className="mt-2 font-footer form-input"
                    value={form.referral}
                    onChange={handleChange}
                    onBlur={handleBlur}
                  />
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
                      <span className="ml-1 text-sm font-footer">Hide</span>
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
                      <span className="ml-1 text-sm font-footer">Hide</span>
                    </button>
                  </div>
                  {touched.confirmPassword && errors.confirmPassword && (
                    <p id="confirmPassword-error" className="mt-1 text-xs text-rose-600 font-footer">
                      {errors.confirmPassword}
                    </p>
                  )}
                </div>

                {/* Newsletter Subscription */}
                <div>
                  <Label className="text-base mb-3 block font-footer">Newsletter Subscription?</Label>
                  <RadioGroup value={newsletter} onValueChange={setNewsletter} className="flex gap-8">
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
                  className={`w-full h-12 text-base font-footer submit-btn ${isFormValid() ? "" : "disabled"}`}
                  disabled={!isFormValid()}
                >
                  Submit
                </Button>

                {/* Login Link */}
                <p className="text-center text-sm text-muted-foreground font-footer">
                  Already have an account?{" "}
                  <Link
                    href="/login"
                    className="text-foreground hover:text-footer-hover transition-colors font-medium link-like"
                  >
                    Log in
                  </Link>
                </p>
              </form>
            </div>
          </div>
        </div>
      </main>

      {/* Styles (inline) */}
      <style jsx global>{`
        @font-face {
          font-family: "OPTIHandelGothic-Light";
          src: url("/fonts/OPTIHandelGothic-Light.woff2") format("woff2");
          font-weight: 300;
          font-style: normal;
          font-display: swap;
        }

        :root {
          --form-accent: #7AC943;
          --form-bg: #ffffff;
          --form-text: #111827;
          --muted: #6b7280;
          --danger: #ef4444;
        }

        .font-footer {
          font-family: "OPTIHandelGothic-Light", ui-sans-serif, system-ui, -apple-system,
            "Segoe UI", Roboto, "Helvetica Neue", Arial;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        .input-group {
          position: relative;
        }
        .form-label {
          display: inline-block;
          margin-bottom: 6px;
          color: var(--muted);
          transition: color 180ms ease;
          position: relative;
        }
        .form-label::after {
          content: "";
          display: block;
          margin-top: 6px;
          height: 2px;
          width: 0%;
          background: var(--form-accent);
          transition: width 220ms cubic-bezier(.2,.9,.2,1), opacity 180ms ease;
          opacity: 0;
        }

        .input-group:focus-within .form-label,
        .input-group.filled .form-label {
          color: var(--form-accent);
        }
        .input-group:focus-within .form-label::after,
        .input-group.filled .form-label::after {
          width: 28%;
          opacity: 1;
        }

        .form-input {
          padding-right: 4rem !important;
          border-radius: 6px;
        }

        .eye-btn {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: transparent;
          border: none;
          color: rgba(0,0,0,0.6);
          cursor: pointer;
          padding: 4px 6px;
          border-radius: 6px;
          white-space: nowrap;
          transition: color 160ms ease, transform 120ms ease;
        }
        .eye-btn:hover {
          color: var(--form-accent);
          transform: translateY(-50%) scale(1.02);
        }
        .eye-btn svg { display: block; }

        /* Submit button styling & states */
        .submit-btn {
          background: var(--form-accent);
          color: #fff;
          border: none;
          transition: transform 120ms ease, box-shadow 160ms ease, opacity 160ms ease;
          box-shadow: 0 6px 20px rgba(122,201,67,0.18);
        }
        .submit-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 30px rgba(122,201,67,0.22);
        }
        .submit-btn:active:not(:disabled) {
          transform: translateY(0);
        }
        .submit-btn.disabled,
        .submit-btn[disabled] {
          opacity: 0.6;
          cursor: not-allowed;
          box-shadow: none;
          transform: none;
        }

        /* Error messages */
        .text-rose-600 {
          color: var(--danger);
        }

        /* helper text color */
        .text-muted-foreground { color: var(--muted); }

        @media (max-width: 640px) {
          .eye-btn { right: 8px; gap:6px; }
        }
      `}</style>
    </div>
  );
};

export default Signup;
