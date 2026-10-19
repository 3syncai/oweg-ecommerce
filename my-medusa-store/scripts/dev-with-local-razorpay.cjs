const { spawn } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")
const dotenv = require("dotenv")

const projectRoot = path.resolve(__dirname, "..")
const envPath = path.join(projectRoot, ".env")
const env = { ...process.env }

// A stale exported key in the developer shell must not override the local
// Medusa credentials. Production startup remains unchanged.
if (fs.existsSync(envPath)) {
  const local = dotenv.parse(fs.readFileSync(envPath))
  for (const key of ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"]) {
    if (local[key]) env[key] = local[key]
  }
}

const cli = path.join(projectRoot, "node_modules", "@medusajs", "cli", "cli.js")
const child = spawn(process.execPath, [cli, "develop"], {
  cwd: projectRoot,
  env,
  stdio: "inherit",
})

child.on("exit", (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1)
})
