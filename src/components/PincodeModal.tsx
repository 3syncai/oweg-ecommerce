"use client"

import { useEffect, useId } from "react"
import { createPortal } from "react-dom"
import { Loader2, MapPin, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export type PincodeModalProps = {
  open: boolean
  onClose: () => void
  value: string
  onChange: (value: string) => void
  onSave: () => void
  saving?: boolean
  error?: string | null
  /** Existing or last-known place label for preview chip */
  placeHint?: string | null
}

export default function PincodeModal({
  open,
  onClose,
  value,
  onChange,
  onSave,
  saving = false,
  error = null,
  placeHint = null,
}: PincodeModalProps) {
  const titleId = useId()
  const inputId = "oweg-pincode-input"

  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => {
      document.getElementById(inputId)?.focus()
    }, 40)
    return () => window.clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, saving, onClose])

  if (!open || typeof document === "undefined") return null

  return createPortal(
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center px-4 animate-in fade-in duration-200"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px] transition-opacity"
        disabled={saving}
        onClick={() => {
          if (!saving) onClose()
        }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "relative z-10 w-full max-w-[420px] rounded-2xl bg-white p-6 sm:p-8",
          "shadow-[0_12px_40px_rgba(0,0,0,0.12)] ring-1 ring-black/5",
          "animate-in fade-in zoom-in-95 duration-200"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50"
          onClick={onClose}
          disabled={saving}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#7AC943]/15 text-[#5ea82e] shadow-[inset_0_0_0_1px_rgba(122,201,67,0.25)]">
            <MapPin className="h-7 w-7" strokeWidth={2} aria-hidden />
          </div>
          <h3 id={titleId} className="text-xl font-semibold tracking-tight text-gray-900">
            Update delivery pincode
          </h3>
          <p className="mt-1.5 max-w-[280px] text-sm leading-relaxed text-gray-500">
            Enter your area pincode to personalize delivery.
          </p>
        </div>

        <div className="mt-6 space-y-3 text-left">
          <label htmlFor={inputId} className="text-sm font-semibold text-gray-800">
            Pincode
          </label>
          <Input
            id={inputId}
            value={value}
            onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="6-digit PIN"
            inputMode="numeric"
            maxLength={6}
            autoComplete="postal-code"
            disabled={saving}
            aria-invalid={Boolean(error)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !saving) onSave()
            }}
            className={cn(
              "h-12 rounded-xl border-gray-200 bg-gray-50 px-4 text-center text-lg font-semibold tracking-[0.2em] text-gray-900",
              "placeholder:text-sm placeholder:font-normal placeholder:tracking-normal placeholder:text-gray-400",
              "focus-visible:border-[#7AC943] focus-visible:bg-white focus-visible:ring-[#7AC943]/30",
              error && "border-rose-300 focus-visible:border-rose-400 focus-visible:ring-rose-200"
            )}
          />
          {error ? (
            <p className="text-sm text-rose-600" role="alert">
              {error}
            </p>
          ) : null}
          {placeHint && !error ? (
            <div className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#F4F7F2] px-3 py-1.5 text-left text-xs font-medium text-[#326b00] ring-1 ring-[#7AC943]/20">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-[#7AC943]" aria-hidden />
              <span className="truncate">{placeHint}</span>
            </div>
          ) : null}
        </div>

        <div className="mt-7 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={saving}
            className="h-11 min-w-[96px] rounded-xl text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="h-11 min-w-[112px] rounded-full bg-[#7AC943] px-6 font-semibold text-white shadow-sm hover:bg-[#6bb832] active:bg-[#5aa028] focus-visible:ring-[#7AC943]/40"
          >
            {saving ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Saving…
              </span>
            ) : (
              "Save"
            )}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
