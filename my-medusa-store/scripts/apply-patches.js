/**
 * Resilient patch applicator for Vercel / CI.
 * Stale node_modules caches often leave @medusajs/dashboard half-patched so
 * plain `patch-package` fails. Prefer git apply, then patch-package, then
 * reinstall the package and retry.
 */
const { execSync, spawnSync } = require("child_process")
const fs = require("fs")
const path = require("path")

const ROOT = path.resolve(__dirname, "..")
const DASHBOARD = path.join(ROOT, "node_modules", "@medusajs", "dashboard")
const PATCH = path.join(
  ROOT,
  "patches",
  "@medusajs+dashboard+2.11.3.patch"
)
const DASHBOARD_VERSION = "2.11.3"

function run(cmd, opts = {}) {
  return spawnSync(cmd, {
    cwd: ROOT,
    shell: true,
    encoding: "utf8",
    ...opts,
  })
}

function log(msg) {
  console.log(`[apply-patches] ${msg}`)
}

function hasDashboard() {
  return fs.existsSync(path.join(DASHBOARD, "package.json"))
}

function isAlreadyPatched() {
  try {
    const mainLayout = path.join(
      DASHBOARD,
      "src",
      "components",
      "layout",
      "main-layout",
      "main-layout.tsx"
    )
    if (!fs.existsSync(mainLayout)) return false
    const src = fs.readFileSync(mainLayout, "utf8")
    return src.includes("PROMOTED_EXTENSION_PATHS")
  } catch {
    return false
  }
}

function gitApplyArgv(extraArgs = []) {
  // Repo root may be the parent monorepo; patch paths are relative to my-medusa-store.
  const args = ["apply", "--ignore-whitespace", ...extraArgs]
  try {
    const top = execSync("git rev-parse --show-toplevel", {
      cwd: ROOT,
      encoding: "utf8",
    }).trim()
    const rel = path.relative(top, ROOT).replace(/\\/g, "/")
    if (rel && rel !== ".") {
      args.push(`--directory=${rel}`)
    }
  } catch {
    // not a git checkout; plain apply from ROOT is fine
  }
  args.push(PATCH)
  return args
}

function runGitApply(extraArgs = []) {
  return spawnSync("git", gitApplyArgv(extraArgs), {
    cwd: ROOT,
    shell: false,
    encoding: "utf8",
  })
}

function tryGitApply() {
  if (!fs.existsSync(PATCH)) {
    log("No dashboard patch file found; skipping")
    return true
  }
  // --check first
  const check = runGitApply(["--check"])
  if (check.status !== 0) {
    log(`git apply --check failed: ${(check.stderr || check.stdout || "").slice(0, 400)}`)
    return false
  }
  const apply = runGitApply()
  if (apply.status !== 0) {
    log(`git apply failed: ${(apply.stderr || apply.stdout || "").slice(0, 400)}`)
    return false
  }
  log("Applied dashboard patch via git apply")
  return true
}

function tryPatchPackage() {
  const result = run("npx patch-package", {
    env: { ...process.env, PATCH_PACKAGE_ERROR_ON_FAIL: "1" },
  })
  if (result.status !== 0) {
    log(`patch-package failed: ${(result.stderr || result.stdout || "").slice(0, 600)}`)
    return false
  }
  log("Applied patches via patch-package")
  return true
}

function reinstallDashboard() {
  log("Removing cached @medusajs/dashboard for clean reinstall...")
  fs.rmSync(DASHBOARD, { recursive: true, force: true })
  const result = run(
    `npm install @medusajs/dashboard@${DASHBOARD_VERSION} --no-save --legacy-peer-deps --ignore-scripts`,
    { stdio: "inherit" }
  )
  if (result.status !== 0) {
    throw new Error("Failed to reinstall @medusajs/dashboard")
  }
  log("Reinstalled @medusajs/dashboard@" + DASHBOARD_VERSION)
}

function applyOnce() {
  if (!hasDashboard()) {
    log("@medusajs/dashboard not installed; nothing to patch")
    return true
  }
  if (isAlreadyPatched()) {
    log("Dashboard already contains OWEG nav patch; treating as success")
    return true
  }
  if (tryGitApply()) return true
  if (tryPatchPackage()) return true
  return false
}

function main() {
  process.chdir(ROOT)

  // Always run patch-package for any other patches first (idempotent when clean)
  // then ensure dashboard patch lands.
  if (!fs.existsSync(path.join(ROOT, "patches"))) {
    log("No patches/ directory; done")
    return
  }

  if (applyOnce()) {
    // Best-effort for other packages; never fail install if dashboard is already patched
    if (!tryPatchPackage()) {
      log("patch-package reported an error, but dashboard patch is already present — continuing")
    }
    return
  }

  log("Retrying after clean reinstall of @medusajs/dashboard...")
  reinstallDashboard()

  if (applyOnce()) {
    tryPatchPackage()
    return
  }

  console.error("[apply-patches] FATAL: could not apply @medusajs/dashboard patch")
  process.exit(1)
}

main()
