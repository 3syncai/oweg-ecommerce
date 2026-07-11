"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Input, Text } from "@medusajs/ui";
import type {
  DebugControllerSettings,
  DebugControllerStats,
  SiteStatus,
} from "@/lib/debug-controller/types";

const TOKEN_KEY = "oweg_vendor_debug_controller_token";

type SystemInfo = {
  nodeEnv: string;
  medusaUrl: string;
  medusaOnline: boolean;
  databaseConfigured: boolean;
};

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 cursor-pointer">
      <div>
        <p className="font-medium text-slate-100">{label}</p>
        {description ? (
          <p className="text-sm text-slate-400 mt-0.5">{description}</p>
        ) : null}
      </div>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-5 w-5 accent-emerald-500"
      />
    </label>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-2xl font-semibold text-white mt-1">{value}</p>
    </div>
  );
}

export default function DebugControllerDashboard() {
  const [token, setToken] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<DebugControllerSettings | null>(null);
  const [stats, setStats] = useState<DebugControllerStats | null>(null);
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const authHeaders = useMemo(
    () => ({
      "Content-Type": "application/json",
      "x-debug-controller-token": token,
    }),
    [token]
  );

  const showMessage = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(""), 4000);
  };

  const loadDashboard = useCallback(async (activeToken: string) => {
    setLoading(true);
    setError("");
    try {
      const [settingsRes, statsRes] = await Promise.all([
        fetch("/api/debug-controller/settings", {
          headers: { "x-debug-controller-token": activeToken },
        }),
        fetch("/api/debug-controller/stats", {
          headers: { "x-debug-controller-token": activeToken },
        }),
      ]);

      if (!settingsRes.ok || !statsRes.ok) {
        throw new Error("Failed to load protected data");
      }

      const settingsData = await settingsRes.json();
      const statsData = await statsRes.json();
      setSettings(settingsData.settings);
      setStats(statsData.stats);
      setSystem(statsData.system);
      setAuthenticated(true);
      sessionStorage.setItem(TOKEN_KEY, activeToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
      setAuthenticated(false);
      sessionStorage.removeItem(TOKEN_KEY);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem(TOKEN_KEY);
    if (saved) {
      setToken(saved);
      loadDashboard(saved);
    }
  }, [loadDashboard]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthError("");
    setLoading(true);
    try {
      const res = await fetch("/api/debug-controller/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        throw new Error("Invalid access token");
      }
      await loadDashboard(token);
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "Authentication failed");
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  const patchSettings = async (patch: Partial<DebugControllerSettings>) => {
    setError("");
    try {
      const res = await fetch("/api/debug-controller/settings", {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error || "Failed to update settings");
      }
      const data = await res.json();
      setSettings(data.settings);
      showMessage("Settings updated");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  };

  const siteStatusOptions: { value: SiteStatus; label: string; color: string }[] = [
    { value: "live", label: "Live", color: "bg-emerald-500" },
    { value: "read_only", label: "Read Only", color: "bg-amber-500" },
    { value: "maintenance", label: "Maintenance", color: "bg-rose-500" },
  ];

  if (!authenticated) {
    return (
      <div className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl space-y-5"
        >
          <div>
            <p className="text-emerald-400 text-sm font-semibold uppercase tracking-wider">
              OWEG Vendor Portal Debug Controller
            </p>
            <h1 className="text-2xl font-bold mt-2">Access Required</h1>
            <Text className="text-slate-400 text-sm mt-2">
              Enter your debug controller secret to manage vendor portal controls.
            </Text>
          </div>
          <Input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="DEBUG_CONTROLLER_SECRET"
            className="bg-slate-950 border-slate-700 text-white"
          />
          {authError ? (
            <Text className="text-sm text-rose-400">{authError}</Text>
          ) : null}
          <Button type="submit" disabled={loading || !token} className="w-full">
            {loading ? "Verifying..." : "Unlock Controller"}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950 text-slate-100">
      <div className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-emerald-400 text-xs font-semibold uppercase tracking-wider">
              OWEG Vendor Portal Debug Controller
            </p>
            <h1 className="text-xl font-bold">Site Control Panel</h1>
          </div>
          <div className="flex items-center gap-2">
            {message ? (
              <span className="text-sm text-emerald-400">{message}</span>
            ) : null}
            <Button variant="secondary" size="small" onClick={() => token && loadDashboard(token)}>
              Refresh
            </Button>
            <Button
              variant="secondary"
              size="small"
              onClick={() => {
                sessionStorage.removeItem(TOKEN_KEY);
                setAuthenticated(false);
                setToken("");
              }}
            >
              Lock
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-8">
        {error ? (
          <div className="rounded-xl border border-rose-900 bg-rose-950/40 px-4 py-3 text-rose-300 text-sm">
            {error}
          </div>
        ) : null}

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Portal Status</h2>
          <div className="grid sm:grid-cols-3 gap-3">
            {siteStatusOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => patchSettings({ siteStatus: option.value })}
                className={`rounded-xl border px-4 py-4 text-left transition ${
                  settings?.siteStatus === option.value
                    ? "border-emerald-500 bg-emerald-500/10"
                    : "border-slate-800 bg-slate-900/60 hover:border-slate-600"
                }`}
              >
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${option.color}`} />
                <p className="font-medium mt-2">{option.label}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {option.value === "live" && "Portal fully operational"}
                  {option.value === "read_only" && "Browse only for vendors"}
                  {option.value === "maintenance" && "Shows maintenance page"}
                </p>
              </button>
            ))}
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-sm text-slate-400">Maintenance title</span>
              <Input
                value={settings?.maintenanceTitle || ""}
                onChange={(e) =>
                  setSettings((prev) =>
                    prev ? { ...prev, maintenanceTitle: e.target.value } : prev
                  )
                }
                onBlur={() =>
                  patchSettings({ maintenanceTitle: settings?.maintenanceTitle })
                }
                className="bg-slate-900 border-slate-700"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-sm text-slate-400">Maintenance message</span>
              <Input
                value={settings?.maintenanceMessage || ""}
                onChange={(e) =>
                  setSettings((prev) =>
                    prev ? { ...prev, maintenanceMessage: e.target.value } : prev
                  )
                }
                onBlur={() =>
                  patchSettings({ maintenanceMessage: settings?.maintenanceMessage })
                }
                className="bg-slate-900 border-slate-700"
              />
            </label>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Protection Controls</h2>
          <p className="text-sm text-slate-400">
            Strict DevTools blocking is enabled by default. Vendors cannot use Inspect,
            F12, or View Source while these protections are on.
          </p>
          <div className="grid md:grid-cols-2 gap-3">
            <ToggleRow
              label="Block DevTools shortcuts"
              description="Blocks F12, Inspect, View Source; hides page when DevTools is open"
              checked={Boolean(settings?.disableDevToolsShortcuts)}
              onChange={(value) => patchSettings({ disableDevToolsShortcuts: value })}
            />
            <ToggleRow
              label="Disable right click"
              description="Blocks context menu on all vendor pages"
              checked={Boolean(settings?.disableRightClick)}
              onChange={(value) => patchSettings({ disableRightClick: value })}
            />
            <ToggleRow
              label="Disable text selection"
              description="Prevents copy/select across the portal"
              checked={Boolean(settings?.disableTextSelect)}
              onChange={(value) => patchSettings({ disableTextSelect: value })}
            />
            <ToggleRow
              label="Enable vendor signup"
              description="When off, /signup redirects to login"
              checked={Boolean(settings?.enableRegistration)}
              onChange={(value) => patchSettings({ enableRegistration: value })}
            />
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
            <ToggleRow
              label="Announcement banner"
              description="Show a portal-wide banner message"
              checked={Boolean(settings?.showAnnouncementBanner)}
              onChange={(value) => patchSettings({ showAnnouncementBanner: value })}
            />
            <Input
              value={settings?.announcementBanner || ""}
              onChange={(e) =>
                setSettings((prev) =>
                  prev ? { ...prev, announcementBanner: e.target.value } : prev
                )
              }
              onBlur={() =>
                patchSettings({ announcementBanner: settings?.announcementBanner })
              }
              placeholder="Banner message..."
              className="bg-slate-950 border-slate-700"
            />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Database Stats</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard label="Products" value={stats?.products ?? "—"} />
            <StatCard label="Variants" value={stats?.variants ?? "—"} />
            <StatCard label="Orders" value={stats?.orders ?? "—"} />
            <StatCard label="Customers" value={stats?.customers ?? "—"} />
            <StatCard label="Vendors" value={stats?.vendors ?? "—"} />
          </div>
          {system ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300 grid md:grid-cols-2 gap-2">
              <p>
                Environment: <span className="text-white">{system.nodeEnv}</span>
              </p>
              <p>
                Medusa:{" "}
                <span className={system.medusaOnline ? "text-emerald-400" : "text-rose-400"}>
                  {system.medusaOnline ? "Online" : "Offline"}
                </span>
              </p>
              <p>
                Backend URL:{" "}
                <span className="text-white break-all">{system.medusaUrl}</span>
              </p>
              <p>
                Database:{" "}
                <span
                  className={
                    system.databaseConfigured ? "text-emerald-400" : "text-rose-400"
                  }
                >
                  {system.databaseConfigured ? "Connected" : "Missing DATABASE_URL"}
                </span>
              </p>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
