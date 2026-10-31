"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { AccountHubIcon } from "@/components/ui/icons/account-hub";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthProvider";

type PasswordFieldProps = {
  id: string;
  label: string;
  value: string;
  visible: boolean;
  placeholder: string;
  onChange: (value: string) => void;
  onToggle: () => void;
  readOnly?: boolean;
  onFocus?: () => void;
};

function PasswordField({
  id,
  label,
  value,
  visible,
  placeholder,
  onChange,
  onToggle,
  readOnly,
  onFocus,
}: PasswordFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-slate-600">
        {label}
      </label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          readOnly={readOnly}
          onFocus={onFocus}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 rounded-lg border-slate-200 bg-slate-50/50 pr-10 text-sm shadow-none placeholder:text-slate-400 focus-visible:border-green-600 focus-visible:ring-green-600/20"
          autoComplete={id === "current-password" ? "off" : "new-password"}
          data-1p-ignore={id === "current-password" ? true : undefined}
          data-lpignore={id === "current-password" ? "true" : undefined}
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-green-600"
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export default function AccountSecurityCard() {
  const { logout } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [currentPasswordFocused, setCurrentPasswordFocused] = useState(false);

  const trimmedCurrent = currentPassword.trim();
  const trimmedNew = newPassword.trim();
  const trimmedConfirm = confirmPassword.trim();
  const passwordsMatch = trimmedNew === trimmedConfirm;
  const canSubmit =
    Boolean(trimmedCurrent && trimmedNew && trimmedConfirm) && passwordsMatch;

  const handlePasswordSave = async () => {
    setPasswordError(null);

    if (!trimmedCurrent || !trimmedNew) {
      toast.error("Enter your current and new password.");
      return;
    }
    if (trimmedNew.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }
    if (trimmedNew !== trimmedConfirm) {
      toast.error("Passwords do not match.");
      return;
    }

    try {
      setSavingPassword(true);
      const res = await fetch("/api/medusa/customers/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          currentPassword: trimmedCurrent,
          newPassword: trimmedNew,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Unable to update password.");
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setEditingPassword(false);
      setCurrentPasswordFocused(false);
      toast.success("Password updated. Please sign in again.");
      await logout();
    } catch (error) {
      let message =
        error instanceof Error ? error.message : "Unable to update password.";
      const normalized = message.toLowerCase();
      if (
        normalized.includes("current password") ||
        normalized.includes("invalid email or password")
      ) {
        message = "Incorrect Current Password";
      }
      setPasswordError(message);
      toast.error(message);
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
        <AccountHubIcon name="account-security" size={18} className="h-[18px] w-[18px]" />
        <h2 className="text-sm font-semibold text-slate-900">
          Account Security
        </h2>
      </div>

      <div className="space-y-4 p-5">
        <p className="text-xs leading-relaxed text-slate-500">Change your password to keep your account secure.</p>
        {!editingPassword ? (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              setCurrentPassword("");
              setNewPassword("");
              setConfirmPassword("");
              setPasswordError(null);
              setCurrentPasswordFocused(false);
              setShowCurrentPassword(false);
              setShowNewPassword(false);
              setShowConfirmPassword(false);
              setEditingPassword(true);
            }}
          >
            Change password
          </Button>
        ) : (
        <form autoComplete="off" className="space-y-4" onSubmit={(event) => {
          event.preventDefault();
          if (!savingPassword && canSubmit) void handlePasswordSave();
        }}>
        <PasswordField
          id="current-password"
          label="Current Password"
          value={currentPassword}
          visible={showCurrentPassword}
          placeholder="Enter current password"
          readOnly={!currentPasswordFocused}
          onFocus={() => setCurrentPasswordFocused(true)}
          onChange={(value) => {
            setCurrentPassword(value);
            setPasswordError(null);
          }}
          onToggle={() => setShowCurrentPassword((prev) => !prev)}
        />

        <PasswordField
          id="new-password"
          label="New Password"
          value={newPassword}
          visible={showNewPassword}
          placeholder="Enter new password"
          onChange={(value) => {
            setNewPassword(value);
            setPasswordError(null);
          }}
          onToggle={() => setShowNewPassword((prev) => !prev)}
        />

        <PasswordField
          id="confirm-password"
          label="Confirm New Password"
          value={confirmPassword}
          visible={showConfirmPassword}
          placeholder="Confirm new password"
          onChange={(value) => {
            setConfirmPassword(value);
            setPasswordError(null);
          }}
          onToggle={() => setShowConfirmPassword((prev) => !prev)}
        />

        {passwordError ? (
          <p className="text-sm text-rose-600" role="alert">
            {passwordError}
          </p>
        ) : null}

        <Button
          type="submit"
          size="sm"
          className={`h-10 w-full rounded-lg text-xs font-semibold ${
            !canSubmit
              ? "cursor-not-allowed bg-slate-100 text-slate-500 hover:bg-slate-100"
              : "bg-[#326b29] text-white hover:bg-[#285722]"
          }`}
          disabled={savingPassword || !canSubmit}
        >
          {savingPassword ? "Saving..." : "Update password"}
        </Button>
        <Button type="button" variant="ghost" className="w-full" disabled={savingPassword} onClick={() => {
          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");
          setPasswordError(null);
          setCurrentPasswordFocused(false);
          setEditingPassword(false);
        }}>Cancel</Button>
        <p className="text-[11px] leading-relaxed text-slate-400">Your new password must be at least 8 characters.</p>
        </form>
        )}
      </div>
    </section>
  );
}
