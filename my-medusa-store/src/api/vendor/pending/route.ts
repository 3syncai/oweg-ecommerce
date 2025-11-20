import type { MedusaRequest, MedusaResponse } from "@medusajs/framework"

export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Vendor Access Pending</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; padding: 24px; max-width: 720px; margin: 0 auto; background:#111; color:#e5e5e5; }
      .card { background:#1b1b1d; padding:20px; border:1px solid #333; border-radius:8px; }
      a { color:#7ab7ff; text-decoration:none; }
    </style>
  </head>
  <body>
    <h1>Vendor Access Pending</h1>
    <div class="card">
      <p>Your vendor account has been created and is awaiting admin approval.</p>
      <p>You won’t be able to access the vendor dashboard until your profile is approved.</p>
      <p>You can close this page and check back later, or <a href="/vendor/login">return to login</a>.</p>
    </div>
  </body>
</html>`;
  res.setHeader("content-type", "text/html; charset=utf-8")
  res.send(html)
}


