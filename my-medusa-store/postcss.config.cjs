/**
 * Intentionally-empty PostCSS config.
 *
 * Why this file exists:
 *
 * Medusa's admin build (Vite) starts its PostCSS config search from
 * `my-medusa-store/` and walks UP the filesystem if it doesn't find one.
 * Without this file it walks all the way to the repo root and picks up the
 * Next.js storefront's `postcss.config.mjs`, which references the
 * `@tailwindcss/postcss` plugin. That plugin is installed in the storefront
 * but NOT in `my-medusa-store/node_modules`, so PostCSS receives an
 * unresolved plugin string and the Vercel build fails with:
 *
 *   [Failed to load PostCSS config: ...
 *    TypeError: Invalid PostCSS Plugin found at: plugins[0]
 *    (@/vercel/path0/postcss.config.mjs)]
 *
 * Medusa's admin SDK handles its own CSS pipeline, so no plugins are needed
 * here — the empty list simply stops the upward search and lets the
 * admin build succeed.
 */
module.exports = {
  plugins: [],
}
