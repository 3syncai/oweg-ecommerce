import { test } from "node:test"
import assert from "node:assert/strict"
import { adminSiteUrl, credentialMessage, PUBLIC_ADMIN_SITE_URL } from "../credential-mail"

const fixture = { email: "alex@oweg.example", password: "Example-Only-2026!", name: "Alex", role: "Order administrator", date: new Date("2026-10-18T14:54:00Z") }

test("credential emails use the public admin URL even when triggered by a localhost server", () => {
  const original = process.env.ADMIN_SITE_URL
  try {
    for (const url of [undefined, "http://localhost:9000/app", "http://127.0.0.1:9002/app", "http://[::1]:9000/app"]) {
      if (url) process.env.ADMIN_SITE_URL = url
      else delete process.env.ADMIN_SITE_URL
      assert.equal(adminSiteUrl(), PUBLIC_ADMIN_SITE_URL)
      const mail = credentialMessage(fixture)
      assert.ok(mail.htmlBody.includes(`href="${PUBLIC_ADMIN_SITE_URL}"`))
      assert.ok(mail.paragraphs.includes(`Admin site: ${PUBLIC_ADMIN_SITE_URL}`))
      assert.equal(mail.htmlBody.includes("localhost"), false)
    }
  } finally { if (original === undefined) delete process.env.ADMIN_SITE_URL; else process.env.ADMIN_SITE_URL = original }
})

test("welcome and reset templates contain usable credentials, role, date and first-login guidance", () => {
  for (const reset of [false, true]) {
    const mail = credentialMessage({ ...fixture, reset })
    assert.ok(mail.htmlBody.includes('src="https://www.0weg.in/oweg_logo.png"'))
    for (const value of [fixture.email, fixture.password, fixture.role, "2026", "Sign in to OWEG Admin", "Set your own password", "Contact your superadmin"])
      assert.ok(mail.htmlBody.includes(value), value)
    assert.ok(mail.htmlBody.includes('@media only screen and (max-width:600px)'))
    assert.ok(mail.htmlBody.includes('[if mso]'))
    assert.ok(mail.htmlBody.includes(reset ? "ACCOUNT SECURITY" : "WELCOME TO THE TEAM"))
    assert.ok(mail.subject.includes(reset ? "reset" : "Welcome"))
    assert.ok(mail.paragraphs.join("\n").includes(fixture.password))
  }
})

test("email HTML escapes names, roles and passwords while plain text retains the exact credential", () => {
  const password = 'Demo<&"\'Password'
  const mail = credentialMessage({ ...fixture, password, name: '<img src=x onerror="alert(1)">', role: "Orders <script>example</script>" })
  assert.equal(mail.htmlBody.includes('<script>example</script>'), false)
  assert.equal(mail.htmlBody.includes('<img src=x'), false)
  assert.ok(mail.htmlBody.includes('Demo&lt;&amp;&quot;&#39;Password'))
  assert.ok(mail.paragraphs.includes(`Temporary password: ${password}`))
})
