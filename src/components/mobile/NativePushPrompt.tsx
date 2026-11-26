"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useAuth } from "@/contexts/AuthProvider";
import { isNativeApp } from "@/lib/native-app";
import {
  enableNativePush,
  initNativePush,
  nativePushPermission,
  requestNativePushPermission,
  restoreNativePush,
  setNativePushCustomer,
  type NativePushPermission,
} from "@/lib/native-push";

// Bump the version to ask again after a release (users who already allowed are never asked).
const PROMPT_KEY = "oweg.push.prompt.v1";
const MAX_ASKS = 3;
const RETRY_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const SHOW_DELAY_MS = 4000;

type PromptState = { asks: number; lastAt: number; done: boolean };

function readState(): PromptState {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROMPT_KEY) || "null") as Partial<PromptState> | null;
    return { asks: parsed?.asks ?? 0, lastAt: parsed?.lastAt ?? 0, done: Boolean(parsed?.done) };
  } catch {
    return { asks: 0, lastAt: 0, done: false };
  }
}

function writeState(state: PromptState) {
  try {
    localStorage.setItem(PROMPT_KEY, JSON.stringify(state));
  } catch {
    /* storage may be unavailable */
  }
}

function shouldAsk(): boolean {
  const state = readState();
  if (state.done || state.asks >= MAX_ASKS) return false;
  return state.asks === 0 || Date.now() - state.lastAt >= RETRY_AFTER_MS;
}

/**
 * One-time "turn on notifications" sheet for the native app, plus the silent
 * background sync that keeps a signed-in customer's device token registered.
 */
export default function NativePushPrompt() {
  const { customer } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState<NativePushPermission | "unsupported" | null>(null);
  const syncedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!isNativeApp()) return;
    let cancelled = false;
    let timer: number | undefined;
    void (async () => {
      await initNativePush();
      const state = await nativePushPermission();
      if (cancelled) return;
      setPermission(state);
      if (state === "granted") {
        writeState({ ...readState(), done: true });
        return;
      }
      if (state === "unsupported" || state === "denied" || !shouldAsk()) return;
      timer = window.setTimeout(() => {
        if (!cancelled) setOpen(true);
      }, SHOW_DELAY_MS);
    })();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  // Keep the token registered for the signed-in customer (silent, never prompts).
  useEffect(() => {
    setNativePushCustomer(customer?.id ?? null);
    if (!customer?.id || permission !== "granted" || syncedFor.current === customer.id) return;
    syncedFor.current = customer.id;
    void restoreNativePush(customer.id);
  }, [customer?.id, permission]);

  const later = useCallback(() => {
    const state = readState();
    writeState({ asks: state.asks + 1, lastAt: Date.now(), done: false });
    setOpen(false);
  }, []);

  const allow = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await requestNativePushPermission();
      setPermission(result);
      writeState({ asks: readState().asks + 1, lastAt: Date.now(), done: true });
      if (result === "granted" && customer?.id) {
        syncedFor.current = customer.id;
        await enableNativePush({ customerId: customer.id }).catch(() => undefined);
      }
    } catch {
      /* the user can still enable from Account > Notifications */
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }, [busy, customer?.id]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[99990] flex items-end bg-black/40" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="oweg-push-prompt-title"
        className="w-full rounded-t-3xl bg-white px-6 pt-6 shadow-2xl"
        style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#eaf4df] text-[#155344]">
          <Bell className="h-7 w-7" aria-hidden />
        </div>
        <h2 id="oweg-push-prompt-title" className="mt-4 text-center text-xl font-semibold text-[#1F2A33]">
          Stay in the loop
        </h2>
        <p className="mt-2 text-center text-sm leading-relaxed text-gray-600">
          Turn on notifications to get offers, order updates and new arrivals from OWEG, even when the
          app is closed. You can change this anytime in your phone settings.
        </p>
        <button
          type="button"
          onClick={() => void allow()}
          disabled={busy}
          className="mt-6 w-full rounded-full bg-[#155344] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Please wait…" : "Enable notifications"}
        </button>
        <button
          type="button"
          onClick={later}
          disabled={busy}
          className="mt-2 w-full rounded-full px-5 py-3 text-sm font-medium text-gray-600"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
