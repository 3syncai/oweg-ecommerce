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

function patchLogin(source) {
  return source.replace('const from = location.state?.from?.pathname || "/orders";', 'const from = location.state?.from?.pathname || "/my-access";')
    .replace(/message: error\.message(?!\s*\|\|)/g, 'message: error.message || "Unable to connect to the admin server. Please try again."')
}

// Admin on Vercel + API on Hostinger is cross-origin. Session cookies fail
// (especially in Incognito). Use JWT in localStorage + Authorization Bearer.
const jwtMarker = "OWEG_JWT_AUTH"
function patchJwtAuth(source) {
  if (source.includes(jwtMarker)) return source
  if (!source.includes('type: "session"')) return source
  return source.replace(
    /auth:\s*\{\s*type:\s*"session"\s*,?\s*\}/,
    `auth: {\n    // ${jwtMarker}\n    type: "jwt",\n    jwtTokenStorageMethod: "local",\n  }`
  )
}

function apply() {
  const dashboard = path.resolve(__dirname, "../node_modules/@medusajs/dashboard")
  const candidates = [
    "src/hooks/api/feature-flags.tsx",
    "src/routes/login/login.tsx",
    "src/lib/client/client.ts",
    ...fs.readdirSync(path.join(dashboard, "dist")).filter(name => name.endsWith(".mjs") || name === "app.js").map(name => `dist/${name}`),
  ]
  let patchedFlags = 0
  let patchedJwt = 0
  for (const relative of candidates) {
    const filename = path.join(dashboard, relative)
    if (!fs.existsSync(filename)) continue
    const original = fs.readFileSync(filename, "utf8")
    let source = original
    if (source.includes('queryKey: ["admin", "feature-flags"]')) { source = patchFeatureFlags(source); patchedFlags++ }
    if (relative === "src/routes/login/login.tsx" || relative.startsWith("dist/login-") || relative === "dist/app.js") source = patchLogin(source)
    if (source.includes('type: "session"') || source.includes(jwtMarker)) {
      const next = patchJwtAuth(source)
      if (next !== source) patchedJwt++
      source = next
    }
    if (relative === "dist/app.js") source = source.replace('import { useSyncExternalStore as owegUseLocation } from "react";', 'const { useSyncExternalStore: owegUseLocation } = require("react");')
    if (source !== original) fs.writeFileSync(filename, source)
  }
  if (patchedFlags < 2) throw new Error("Expected source and runtime feature-flags hooks")
  if (patchedJwt < 1) throw new Error("Expected dashboard JWT auth patch")
  console.log("[admin] Auth-aware feature flags ready")
  console.log("[admin] JWT auth enabled for cross-origin admin")
}
module.exports = { apply, patchFeatureFlags, patchLogin, patchJwtAuth }
if (require.main === module) apply()
