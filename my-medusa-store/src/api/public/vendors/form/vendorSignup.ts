export function generateVendorSignupHTML(base: string, pk: string): string {
    return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Vendor Signup</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; padding: 24px; max-width: 720px; margin: 0 auto; }
        input, button { padding: 8px; margin: 4px 0; width: 100%; box-sizing: border-box; }
        label { font-size: 14px; color: #333; display: block; margin-bottom: 4px; }
        .row { margin-bottom: 12px; }
        .note { font-size: 12px; color: #555; }
        button { background: #007bff; color: white; border: none; cursor: pointer; padding: 10px; }
        button:hover { background: #0056b3; }
        a { color: #007bff; text-decoration: none; }
        a:hover { text-decoration: underline; }
      </style>
    </head>
    <body>
      <h1>Vendor Signup</h1>
      <div class="note" style="margin-bottom:8px;">
        Already a vendor? <a href="/app" onclick="event.preventDefault(); window.location='/vendor/login'">Sign in here</a>.
      </div>
      <div id="msg" class="note"></div>
      <form id="f">
        <div class="row"><label>Name</label><input name="name" required /></div>
        <div class="row"><label>Email</label><input name="email" type="email" required /></div>
        <div class="row"><label>Phone</label><input name="phone" /></div>
        <div class="row"><label>PAN / GST</label><input name="pan_gst" /></div>
        <div class="row"><label>Store name</label><input name="store_name" /></div>
        <div class="row"><label>Password (min 8 chars)</label><input name="password" type="password" minlength="8" placeholder="Create a password" /></div>
        <div class="row"><label>Confirm password</label><input name="password2" type="password" minlength="8" placeholder="Confirm password" /></div>
        <div class="row"><label>Store logo</label><input name="logo" type="file" accept="image/*" /></div>
        <div class="row"><label>Documents</label><input name="docs" type="file" multiple /></div>
        <button type="submit">Submit</button>
      </form>
      <script>
        const msg = document.getElementById('msg')
        const f = document.getElementById('f')
        const PK = ${JSON.stringify(pk)}
        const HEADERS = PK ? { "x-publishable-api-key": PK } : {}
        f.addEventListener('submit', async (e) => {
          e.preventDefault()
          msg.textContent = ''
          const data = new FormData(f)
          const name = data.get('name')
          const email = data.get('email')
          const phone = data.get('phone')
          const pan_gst = data.get('pan_gst')
          const store_name = data.get('store_name')
          const logo = data.get('logo')
          const password = (data.get('password') || '').toString()
          const password2 = (data.get('password2') || '').toString()
          const docs = data.getAll('docs')
          try {
            let store_logo
            if (logo && logo.name) {
              const lf = new FormData()
              lf.append('type', 'logo')
              lf.append('vendorHint', email || name || 'temp')
              lf.append('file', logo, logo.name)
              const upRes = await fetch('${base}/store/vendor/uploads', { method: 'POST', body: lf, headers: HEADERS })
              const upData = await upRes.json()
              store_logo = upData.files?.[0]?.url
            }
            const documents = []
            for (const d of docs) {
              if (!d || !d.name) continue
              const df = new FormData()
              df.append('type', 'doc')
              df.append('vendorHint', email || name || 'temp')
              df.append('file', d, d.name)
              const upRes = await fetch('${base}/store/vendor/uploads', { method: 'POST', body: df, headers: HEADERS })
              const upData = await upRes.json()
              const file = upData.files?.[0]
              if (file) documents.push({ key: file.key, url: file.url, name: d.name, type: d.type })
            }
            if (password && password.length < 8) {
              throw new Error('Password must be at least 8 characters')
            }
            if (password && password !== password2) {
              throw new Error('Passwords do not match')
            }
            const payload = { name, email, phone, pan_gst, store_name, store_logo, documents, ...(password ? { password } : {}) }
            const res = await fetch('${base}/store/vendors/signup', {
              method: 'POST',
              headers: Object.assign({ 'content-type': 'application/json' }, HEADERS),
              body: JSON.stringify(payload),
            })
            if (!res.ok) {
              const t = await res.text()
              throw new Error('Signup failed: ' + t)
            }
            msg.textContent = 'Signup submitted. Waiting for admin approval.'
            f.reset()
          } catch (err) {
            msg.textContent = (err && err.message) || 'Error'
          }
        })
      </script>
    </body>
  </html>`
  }
  
  