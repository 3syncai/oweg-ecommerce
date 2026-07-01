"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  DebugControllerSettings,
  DebugControllerStats,
  ProductSearchResult,
  SiteStatus,
} from "@/lib/debug-controller/types";

const TOKEN_KEY = "oweg_debug_controller_token";

type SystemInfo = {
  nodeEnv: string;
  medusaUrl: string;
  medusaOnline: boolean;
  databaseConfigured: boolean;
  opensearchConfigured: boolean;
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
  const [productQuery, setProductQuery] = useState("");
  const [products, setProducts] = useState<ProductSearchResult[]>([]);
  const [productLoading, setProductLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

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
        fetch("/api/debug-controller/settings"),
        fetch("/api/debug-controller/stats", {
          headers: { "x-debug-controller-token": activeToken },
        }),
      ]);

      if (!statsRes.ok) {
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
      if (!res.ok) throw new Error("Failed to update settings");
      const data = await res.json();
      setSettings(data.settings);
      showMessage("Settings updated");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  };

  const runAction = async (
    action: string,
    extra?: Record<string, unknown>
  ) => {
    setError("");
    try {
      const res = await fetch("/api/debug-controller/actions", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");
      showMessage(`Action "${action}" completed`);
      if (token) await loadDashboard(token);
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
      return null;
    }
  };

  const searchProducts = async () => {
    setProductLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/debug-controller/products?q=${encodeURIComponent(productQuery)}`,
        { headers: { "x-debug-controller-token": token } }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setProducts(data.products || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setProductLoading(false);
    }
  };

  const deleteProduct = async (productId: string) => {
    setError("");
    try {
      const res = await fetch(`/api/debug-controller/products/${productId}`, {
        method: "DELETE",
        headers: { "x-debug-controller-token": token },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      showMessage(`Product ${productId} deleted`);
      setDeleteConfirm(null);
      await searchProducts();
      if (token) await loadDashboard(token);
      await runAction("remove-opensearch-product", { productId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
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
              OWEG Debug Controller
            </p>
            <h1 className="text-2xl font-bold mt-2">Access Required</h1>
            <p className="text-slate-400 text-sm mt-2">
              Enter your debug controller secret to manage site controls.
            </p>
          </div>
          <Input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="DEBUG_CONTROLLER_SECRET"
            className="bg-slate-950 border-slate-700 text-white"
          />
          {authError ? (
            <p className="text-sm text-rose-400">{authError}</p>
          ) : null}
          <Button
            type="submit"
            disabled={loading || !token}
            className="w-full bg-emerald-600 hover:bg-emerald-500"
          >
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
              OWEG Debug Controller
            </p>
            <h1 className="text-xl font-bold">Site Control Panel</h1>
          </div>
          <div className="flex items-center gap-2">
            {message ? (
              <span className="text-sm text-emerald-400">{message}</span>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => token && loadDashboard(token)}
              className="border-slate-700"
            >
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                sessionStorage.removeItem(TOKEN_KEY);
                setAuthenticated(false);
                setToken("");
              }}
              className="border-slate-700"
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
          <h2 className="text-lg font-semibold">Website Status</h2>
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
                  {option.value === "live" && "Site fully operational"}
                  {option.value === "read_only" && "Browse only, checkout blocked"}
                  {option.value === "maintenance" && "Shows maintenance page to visitors"}
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
          <h2 className="text-lg font-semibold">Protection & UX Controls</h2>
          <div className="grid md:grid-cols-2 gap-3">
            <ToggleRow
              label="Disable right click"
              description="Blocks context menu, DevTools shortcuts, and hides page when Inspect is open"
              checked={Boolean(settings?.disableRightClick)}
              onChange={(value) => patchSettings({ disableRightClick: value })}
            />
            <ToggleRow
              label="Disable text selection"
              description="Prevents copy/select on pages"
              checked={Boolean(settings?.disableTextSelect)}
              onChange={(value) => patchSettings({ disableTextSelect: value })}
            />
            <ToggleRow
              label="Block DevTools shortcuts"
              description="Blocks F12, View Source, and Inspect shortcuts; hides page when DevTools is open"
              checked={Boolean(settings?.disableDevToolsShortcuts)}
              onChange={(value) =>
                patchSettings({ disableDevToolsShortcuts: value })
              }
            />
            <ToggleRow
              label="WhatsApp widget"
              description="Show or hide floating WhatsApp button"
              checked={Boolean(settings?.enableWhatsAppWidget)}
              onChange={(value) => patchSettings({ enableWhatsAppWidget: value })}
            />
            <ToggleRow
              label="Enable checkout"
              description="When off, checkout routes return blocked state"
              checked={Boolean(settings?.enableCheckout)}
              onChange={(value) => patchSettings({ enableCheckout: value })}
            />
            <ToggleRow
              label="Enable registration"
              description="When off, signup is blocked"
              checked={Boolean(settings?.enableRegistration)}
              onChange={(value) => patchSettings({ enableRegistration: value })}
            />
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <label className="block space-y-1 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
              <span className="text-sm text-slate-400">WhatsApp number (with country code)</span>
              <Input
                value={settings?.whatsappNumber || ""}
                onChange={(e) =>
                  setSettings((prev) =>
                    prev ? { ...prev, whatsappNumber: e.target.value } : prev
                  )
                }
                onBlur={() => patchSettings({ whatsappNumber: settings?.whatsappNumber })}
                placeholder="918797787877"
                className="bg-slate-950 border-slate-700"
              />
            </label>
            <label className="block space-y-1 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
              <span className="text-sm text-slate-400">WhatsApp pre-filled message</span>
              <Input
                value={settings?.whatsappMessage || ""}
                onChange={(e) =>
                  setSettings((prev) =>
                    prev ? { ...prev, whatsappMessage: e.target.value } : prev
                  )
                }
                onBlur={() => patchSettings({ whatsappMessage: settings?.whatsappMessage })}
                placeholder="Hi, I need help with my order."
                className="bg-slate-950 border-slate-700"
              />
            </label>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
            <ToggleRow
              label="Announcement banner"
              description="Show a site-wide banner message"
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Products" value={stats?.products ?? "—"} />
            <StatCard label="Variants" value={stats?.variants ?? "—"} />
            <StatCard label="Orders" value={stats?.orders ?? "—"} />
            <StatCard label="Customers" value={stats?.customers ?? "—"} />
            <StatCard label="Active Carts" value={stats?.carts ?? "—"} />
            <StatCard label="Abandoned (7d+)" value={stats?.abandonedCarts ?? "—"} />
            <StatCard label="Return Requests" value={stats?.returnRequests ?? "—"} />
            <StatCard label="Vendors" value={stats?.vendors ?? "—"} />
          </div>
          {system ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300 grid md:grid-cols-2 gap-2">
              <p>Environment: <span className="text-white">{system.nodeEnv}</span></p>
              <p>Medusa: <span className={system.medusaOnline ? "text-emerald-400" : "text-rose-400"}>{system.medusaOnline ? "Online" : "Offline"}</span></p>
              <p>Backend URL: <span className="text-white break-all">{system.medusaUrl}</span></p>
              <p>Database: <span className={system.databaseConfigured ? "text-emerald-400" : "text-rose-400"}>{system.databaseConfigured ? "Connected" : "Missing"}</span></p>
              <p>OpenSearch: <span className={system.opensearchConfigured ? "text-emerald-400" : "text-amber-400"}>{system.opensearchConfigured ? "Configured" : "Not configured"}</span></p>
            </div>
          ) : null}
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Product Management</h2>
          <div className="flex flex-wrap gap-2">
            <Input
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
              placeholder="Search by title, handle, or ID..."
              className="bg-slate-900 border-slate-700 max-w-md"
            />
            <Button
              onClick={searchProducts}
              disabled={productLoading}
              className="bg-emerald-600 hover:bg-emerald-500"
            >
              {productLoading ? "Searching..." : "Search Products"}
            </Button>
          </div>
          <div className="space-y-2">
            {products.map((product) => (
              <div
                key={product.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {product.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.thumbnail}
                      alt=""
                      className="h-10 w-10 rounded object-cover bg-slate-800"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded bg-slate-800" />
                  )}
                  <div className="min-w-0">
                    <p className="font-medium truncate">{product.title}</p>
                    <p className="text-xs text-slate-400 truncate">
                      {product.handle} · {product.id} · {product.status}
                    </p>
                  </div>
                </div>
                {deleteConfirm === product.id ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteProduct(product.id)}
                    >
                      Confirm Delete
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDeleteConfirm(null)}
                      className="border-slate-700"
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setDeleteConfirm(product.id)}
                  >
                    Delete from DB
                  </Button>
                )}
              </div>
            ))}
            {!productLoading && products.length === 0 ? (
              <p className="text-sm text-slate-500">Search to find products to manage.</p>
            ) : null}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Maintenance Actions</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Button
              variant="outline"
              className="border-slate-700 justify-start h-auto py-3"
              onClick={() => runAction("cleanup-test-payments")}
            >
              Cleanup test payments (24h)
            </Button>
            <Button
              variant="outline"
              className="border-slate-700 justify-start h-auto py-3"
              onClick={() => runAction("purge-abandoned-carts", { days: 7 })}
            >
              Purge abandoned carts (7d+)
            </Button>
            <Button
              variant="outline"
              className="border-slate-700 justify-start h-auto py-3"
              onClick={() => runAction("revalidate-all")}
            >
              Revalidate site cache
            </Button>
            <Button
              variant="outline"
              className="border-slate-700 justify-start h-auto py-3"
              onClick={() => runAction("sync-opensearch-index")}
            >
              Verify OpenSearch index
            </Button>
            <Button
              variant="outline"
              className="border-slate-700 justify-start h-auto py-3"
              onClick={() => runAction("clear-flash-sale-cache")}
            >
              Clear flash sale cache
            </Button>
            <Button
              variant="outline"
              className="border-slate-700 justify-start h-auto py-3"
              onClick={() =>
                patchSettings({
                  cacheBustVersion: (settings?.cacheBustVersion || 0) + 1,
                })
              }
            >
              Bump cache bust version
            </Button>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Legacy Debug Endpoints (Dev Only)</h2>
          <p className="text-sm text-slate-400">
            Disabled in production. In development, pass{" "}
            <code className="text-slate-300">x-debug-controller-token</code> with
            your debug-controller secret. Use the &quot;Cleanup test payments&quot;
            button above instead of hitting{" "}
            <code className="text-slate-300">/api/cleanup-payments</code> directly.
          </p>
          <div className="grid sm:grid-cols-2 gap-2 text-sm">
            {[
              "/api/debug/fix-reservations?id=ORDER_ID",
              "/api/debug/force-fulfill?id=ORDER_ID",
              "/api/debug/fix-catalog-profiles",
              "/api/debug/fix-profile-mismatch?id=ORDER_ID",
              "/api/debug/fulfillment",
              "/api/affiliate/debug-wallet?code=AFFILIATE_CODE",
            ].map((endpoint) => (
              <code
                key={endpoint}
                className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-slate-300 break-all"
              >
                {endpoint}
              </code>
            ))}
          </div>
          <p className="text-xs text-slate-500 break-all">
            Example: curl -H &quot;x-debug-controller-token: YOUR_SECRET&quot;
            &quot;http://localhost:3000/api/debug/fulfillment&quot;
          </p>
        </section>
      </div>
    </div>
  );
}
