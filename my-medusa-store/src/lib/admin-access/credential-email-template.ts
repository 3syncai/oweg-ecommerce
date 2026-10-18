type CredentialEmailDetails = {
  heading: string
  intro: string
  email: string
  password: string
  role: string
  adminUrl: string
  date: string
  reset: boolean
}

function escape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

/** Table layout and inline styles also work in email clients without modern CSS. */
export function renderCredentialEmail(input: CredentialEmailDetails): string {
  const url = escape(input.adminUrl)
  const field = (label: string, value: string, password = false) => `
    <tr><td style="padding:18px 22px;${password ? "border-top:1px solid #dce6d8;" : ""}">
      <p style="margin:0 0 7px;color:#667363;font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">${label}</p>
      <p style="margin:0;color:#183c2a;font-family:${password ? "Consolas,'Courier New',monospace" : "Arial,Helvetica,sans-serif"};font-size:${password ? "20" : "16"}px;line-height:26px;font-weight:${password ? "700" : "400"};overflow-wrap:anywhere;word-break:break-all;">${escape(value)}</p>
    </td></tr>`
  const step = (number: string, title: string, detail: string) => `<tr>
    <td width="40" valign="top" style="padding:0 12px 18px 0;"><span style="display:inline-block;width:28px;height:28px;line-height:28px;text-align:center;background:#eef5e9;color:#32643c;font-size:11px;font-weight:700;border-radius:50%;">${number}</span></td>
    <td valign="top" style="padding:0 0 18px;"><p style="margin:1px 0 3px;font-size:14px;line-height:20px;font-weight:700;color:#24382c;">${title}</p><p style="margin:0;font-size:13px;line-height:20px;color:#68736c;">${detail}</p></td>
  </tr>`
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${escape(input.heading)}</title>
<style>@media only screen and (max-width:600px){.email-outer{padding:16px 8px!important}.email-pad{padding-left:24px!important;padding-right:24px!important}.email-title{font-size:28px!important;line-height:35px!important}.email-button{display:block!important;text-align:center!important}.email-card{border-radius:16px!important}}</style></head>
<body style="margin:0;padding:0;background:#f3f5f0;color:#24382c;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f5f0;"><tr><td align="center" class="email-outer" style="padding:36px 16px;">
<!--[if mso]><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="email-card" style="max-width:600px;background:#ffffff;border:1px solid #e0e6dc;border-radius:22px;overflow:hidden;">
  <tr><td style="height:5px;background:#7ac943;font-size:0;line-height:0;">&nbsp;</td></tr>
  <tr><td class="email-pad" style="padding:30px 40px 25px;border-bottom:1px solid #edf0e9;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
      <td><img src="https://www.0weg.in/oweg_logo.png" width="121" height="32" alt="OWEG" style="display:block;width:121px;height:32px;border:0;color:#32643c;font-size:24px;font-weight:700;"></td>
      <td align="right" style="color:#7b8579;font-size:10px;line-height:16px;font-weight:700;letter-spacing:1.6px;">ADMINISTRATION</td>
    </tr></table>
  </td></tr>
  <tr><td class="email-pad" style="padding:32px 40px 25px;">
    <p style="margin:0 0 12px;font-size:11px;line-height:17px;letter-spacing:1.7px;font-weight:700;color:#578541;">${input.reset ? "ACCOUNT SECURITY" : "WELCOME TO THE TEAM"}</p>
    <h1 class="email-title" style="margin:0 0 16px;font-size:32px;line-height:39px;letter-spacing:-0.7px;font-weight:700;color:#183c2a;">${escape(input.heading)}</h1>
    <p style="margin:0;font-size:15px;line-height:25px;color:#607064;">${escape(input.intro)}</p>
  </td></tr>
  <tr><td class="email-pad" style="padding:0 40px 24px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #dce6d8;border-radius:12px;background:#f7faf4;">
      ${field("Login email", input.email)}${field("Temporary password", input.password, true)}
    </table>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding-top:15px;font-size:12px;line-height:20px;color:#73806e;">Assigned role <strong style="color:#36563c;">${escape(input.role)}</strong></td></tr>
      <tr><td style="padding-top:3px;font-size:12px;line-height:20px;color:#73806e;">${input.reset ? "Reset" : "Created"} on ${escape(input.date)}</td></tr></table>
  </td></tr>
  <tr><td class="email-pad" style="padding:0 40px 30px;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;"><tr><td align="center" bgcolor="#245638" style="border-radius:8px;mso-padding-alt:16px 24px;">
      <a class="email-button" href="${url}" style="display:block;padding:16px 24px;color:#ffffff;text-decoration:none;font-size:14px;line-height:20px;font-weight:700;border-radius:8px;">Sign in to OWEG Admin &nbsp;&rarr;</a>
    </td></tr></table>
    <p style="margin:12px 0 0;text-align:center;font-size:11px;line-height:18px;color:#7c8877;">Your admin workspace &middot; Access is based on your assigned role</p>
  </td></tr>
  <tr><td class="email-pad" style="padding:26px 40px 10px;border-top:1px solid #edf0e9;">
    <p style="margin:0 0 20px;font-size:11px;line-height:17px;font-weight:700;letter-spacing:1.4px;color:#6b7866;">GET STARTED IN THREE STEPS</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      ${step("01", "Open your admin workspace", "Use the button above to visit the OWEG admin website.")}
      ${step("02", "Sign in with your temporary credentials", "Enter the login email and temporary password shown in this email.")}
      ${step("03", "Set your own password", "You must choose a new password before accessing the dashboard.")}
    </table>
  </td></tr>
  <tr><td class="email-pad" style="padding:0 40px 30px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding:16px 18px;background:#f7f8f5;border-left:3px solid #9ac777;border-radius:0 8px 8px 0;">
      <p style="margin:0 0 5px;font-size:12px;line-height:18px;font-weight:700;color:#3b563d;">Keep your account secure</p>
      <p style="margin:0;font-size:12px;line-height:20px;color:#6b7667;">Keep these credentials private. ${input.reset ? "If you did not request this reset" : "If you were not expecting this account"}, contact your superadmin before signing in.</p>
    </td></tr></table>
    <p style="margin:22px 0 0;font-size:13px;line-height:21px;color:#667360;">${input.reset ? "Thank you for keeping your account secure." : "We look forward to working with you."}<br><strong style="color:#36563c;">The OWEG team</strong></p>
  </td></tr>
  <tr><td class="email-pad" style="padding:22px 40px;background:#fafbf8;border-top:1px solid #edf0e9;">
    <p style="margin:0 0 8px;font-size:11px;line-height:18px;color:#788371;">Button not opening? Copy this address into your browser:</p>
    <a href="${url}" style="font-size:11px;line-height:18px;color:#426f3c;text-decoration:underline;word-break:break-all;">${url}</a>
    <p style="margin:14px 0 0;font-size:11px;line-height:18px;color:#929b8d;">This is an automated account notification from OWEG.<br>Need help? Contact your superadmin.</p>
  </td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`
}
