const fs = require("node:fs")
const path = require("node:path")

// Dashboard ships compiled ESM chunks as well as source. Patch both, since
// editing src alone does not change the separately deployed admin bundle.
const marker = "OWEG_AUTH_FEATURE_FLAGS"
function patchFeatureFlags(source) {
  if (source.includes(marker)) return source
  if (!source.includes('queryKey: ["admin", "feature-flags"]')) throw new Error("Dashboard feature-flags hook changed; review startup patch")
  const helper = `
// ${marker}: auth routes need no privileged feature lookup.
import { useSyncExternalStore as owegUseLocation } from "react";
const owegAuthPage = () => /\\/(login|reset-password|invite)(\\/|$)/.test(window.location.pathname);
const owegSubscribe = (notify) => {
  window.addEventListener("popstate", notify);
  window.addEventListener("oweg-admin-location", notify);
  return () => {
    window.removeEventListener("popstate", notify);
    window.removeEventListener("oweg-admin-location", notify);
  };
};
`
  return helper + source.replace('queryKey: ["admin", "feature-flags"],', `queryKey: ["admin", "feature-flags"],
    enabled: !owegUseLocation(owegSubscribe, owegAuthPage, () => true),
    retry: false,
    refetchOnWindowFocus: false,`).replace(/method: "GET",?\s*\n/, 'method: "GET",\n        signal: AbortSignal.timeout(8000),\n')
}

function apply() {
  const dashboard = path.resolve(__dirname, "../node_modules/@medusajs/dashboard")
  const candidates = ["src/hooks/api/feature-flags.tsx", ...fs.readdirSync(path.join(dashboard, "dist")).filter(name => name.endsWith(".mjs") || name === "app.js").map(name => `dist/${name}`)]
  let patched = 0
  for (const relative of candidates) {
    const filename = path.join(dashboard, relative)
    const source = fs.readFileSync(filename, "utf8")
    if (!source.includes('queryKey: ["admin", "feature-flags"]')) continue
    fs.writeFileSync(filename, patchFeatureFlags(source))
    patched++
  }
  if (patched < 2) throw new Error("Expected source and runtime feature-flags hooks")
  console.log("[admin] Auth-aware feature flags ready")
}
module.exports = { apply, patchFeatureFlags }
if (require.main === module) apply()
