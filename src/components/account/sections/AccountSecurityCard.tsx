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
};

function PasswordField({
  id,
  label,
  value,
  visible,
  placeholder,
  onChange,
  onToggle,
}: PasswordFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
      </label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="pr-10"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 transition-colors hover:text-gray-700"
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
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 md:p-6">
      <div className="mb-5 flex items-center gap-2">
        <AccountHubIcon name="account-security" size={22} className="h-[22px] w-[22px]" />
        <h3 className="text-base font-semibold text-[#1F2A33] md:text-lg">
          Account Security
        </h3>
      </div>

      <div className="space-y-3">
        <PasswordField
          id="current-password"
          label="Current Password"
          value={currentPassword}
          visible={showCurrentPassword}
          placeholder="Enter current password"
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
          type="button"
          size="sm"
          className={`w-full text-sm md:text-base ${
            !canSubmit
              ? "cursor-not-allowed bg-[#EAF8E7] text-[#66C940] hover:bg-[#EAF8E7]"
              : "bg-[#66C940] text-white hover:bg-[#5ab838]"
          }`}
          onClick={handlePasswordSave}
          disabled={savingPassword || !canSubmit}
        >
          {savingPassword ? "Saving..." : "Update password"}
        </Button>
      </div>
    </div>
  );
}
