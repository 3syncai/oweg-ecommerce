"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
async function GET(_req, res) {
    const base = (process.env.BACKEND_URL || "http://localhost:9000").replace(/\/$/, "");
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Vendor Reset Password</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; padding: 24px; max-width: 520px; margin: 0 auto; background:#111; color:#e5e5e5; }
      input, button { padding: 10px; margin: 6px 0; width: 100%; background:#1d1d1f; color:#e5e5e5; border:1px solid #333; border-radius:6px; }
      .err { background:#fee; color:#a00; padding:8px; border:1px solid #f99; margin-bottom:10px; }
      .ok { background:#e7ffee; color:#065; padding:8px; border:1px solid #9ec; margin-bottom:10px; }
      a { color:#7ab7ff; text-decoration:none; }
    </style>
  </head>
  <body>
    <h1>Set a new password</h1>
    <div id="msg"></div>
    <form id="f">
      <label>Current (temporary) password</label>
      <input name="old" type="password" required />
      <label>New password</label>
      <input name="newp" type="password" minlength="8" required />
      <label>Confirm new password</label>
      <input name="newp2" type="password" minlength="8" required />
      <button type="submit">Save</button>
    </form>
    <script>
      const msg = document.getElementById('msg');
      const form = document.getElementById('f');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        msg.innerHTML = '';
        const data = new FormData(form);
        const oldp = data.get('old');
        const np = data.get('newp');
        const np2 = data.get('newp2');
        if (np !== np2) { msg.innerHTML = '<div class="err">Passwords do not match</div>'; return; }
        const token = localStorage.getItem('vendor_token') || '';
        try {
          const res = await fetch('${base}/vendor/auth/change-password', {
            method: 'POST',
            headers: { 'content-type':'application/json', 'Authorization':'Bearer ' + token },
            body: JSON.stringify({ old_password: String(oldp||''), new_password: String(np||'') })
          });
          if (!res.ok) { const t = await res.text(); throw new Error(t || 'Failed'); }
          msg.innerHTML = '<div class="ok">Password updated. Redirecting…</div>';
          setTimeout(()=>{ location.href='/vendor/dashboard'; }, 800);
        } catch (err) {
          msg.innerHTML = '<div class="err">' + (err && err.message ? err.message : 'Error') + '</div>';
        }
      })
    </script>
  </body>
</html>`;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.send(html);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91dGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvYXBpL3ZlbmRvci9yZXNldC1wYXNzd29yZC9yb3V0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUVBLGtCQTBEQztBQTFETSxLQUFLLFVBQVUsR0FBRyxDQUFDLElBQW1CLEVBQUUsR0FBbUI7SUFDaEUsTUFBTSxJQUFJLEdBQUcsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVcsSUFBSSx1QkFBdUIsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUE7SUFDcEYsTUFBTSxJQUFJLEdBQUc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztxQ0F1Q3NCLElBQUk7Ozs7Ozs7Ozs7Ozs7O1FBY2pDLENBQUM7SUFDUCxHQUFHLENBQUMsU0FBUyxDQUFDLGNBQWMsRUFBRSwwQkFBMEIsQ0FBQyxDQUFBO0lBQ3pELEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUE7QUFDaEIsQ0FBQyJ9