"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { isStandalonePwa } from "@/lib/open-storefront-link";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISS_KEY = "oweg-pwa-install-dismissed";

function isIosSafari(): boolean {
  if (typeof window === "undefined") return false;

  const ua = window.navigator.userAgent;
  const isIosDevice =
    /iPad|iPhone|iPod/.test(ua) ||
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);

  if (!isIosDevice) return false;

  // iOS Chrome/Firefox/Edge cannot install PWAs — only Safari can.
  const isOtherIosBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return !isOtherIosBrowser;
}

function wasDismissedRecently(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberDismissal() {
  try {
    window.localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Ignore storage failures.
  }
}

export default function PWAInstallPrompt() {
  const [mounted, setMounted] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (isStandalonePwa() || wasDismissedRecently()) return;

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setShowIosGuide(false);
      setVisible(true);
    };

    window.addEventListener(
      "beforeinstallprompt",
      onBeforeInstallPrompt as EventListener,
    );

    let iosTimer: number | undefined;
    if (isIosSafari()) {
      iosTimer = window.setTimeout(() => {
        setShowIosGuide(true);
        setVisible(true);
      }, 2500);
    }

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        onBeforeInstallPrompt as EventListener,
      );
      if (iosTimer) window.clearTimeout(iosTimer);
    };
  }, [mounted]);

  if (!mounted || !visible) return null;

  const dismiss = () => {
    rememberDismissal();
    setVisible(false);
    setDeferred(null);
    setShowIosGuide(false);
  };

  const handleInstall = async () => {
    if (!deferred) return;

    try {
      await deferred.prompt();
      await deferred.userChoice;
    } finally {
      dismiss();
    }
  };

  return (
    <div className="fixed bottom-24 left-1/2 z-[950] w-[95%] max-w-md -translate-x-1/2 rounded-xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur-md md:bottom-4">
      <div className="flex items-start gap-3 p-4">
        <div className="relative size-10 shrink-0 overflow-hidden rounded-lg">
          <Image
            src="/icon-192x192.png"
            alt="OWEG"
            width={40}
            height={40}
            className="size-10 object-cover"
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">Install OWEG App</p>
          {showIosGuide && !deferred ? (
            <div className="mt-1 space-y-1 text-xs leading-relaxed text-slate-600">
              <p>Add OWEG to your home screen for faster access:</p>
              <ol className="list-decimal space-y-0.5 pl-4">
                <li>Tap the Share button in Safari</li>
                <li>Select &quot;Add to Home Screen&quot;</li>
                <li>Tap &quot;Add&quot;</li>
              </ol>
            </div>
          ) : (
            <p className="mt-1 text-xs text-slate-600">
              Faster access from your home screen
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {deferred ? (
            <button
              type="button"
              onClick={() => void handleInstall()}
              className="rounded-md bg-[#7AC943] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#6bb838]"
            >
              Install
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Dismiss install prompt"
            onClick={dismiss}
            className="px-2 py-1 text-xs text-slate-500 hover:text-slate-900"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
