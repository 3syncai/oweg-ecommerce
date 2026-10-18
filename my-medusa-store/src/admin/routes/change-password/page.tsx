import { Container, Heading, Text, Button, Input, Label } from "@medusajs/ui"
import { useState, type FormEvent } from "react"
import { accessRequest } from "../../lib/admin-access-client"

export default function ChangePasswordPage() {
  const [current, setCurrent] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("")
    if (password !== confirm) { setError("Your new passwords do not match."); return }
    setBusy(true)
    try {
      await accessRequest("/change-password", { current_password: current, new_password: password })
      setCurrent(""); setPassword(""); setConfirm(""); setDone(true)
      await new Promise(resolve => setTimeout(resolve, 1100))
      window.location.replace("/app/login")
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Unable to change your password") }
    finally { setBusy(false) }
  }
  return <Container className="mx-auto my-8 max-w-lg p-8">
    <Text size="small" className="mb-3 text-ui-fg-subtle">OWEG ADMIN · ACCOUNT SECURITY</Text>
    <Heading level="h1">Set your own password</Heading>
    <Text className="mt-3 text-ui-fg-subtle">Welcome to the team. Replace your temporary admin password to unlock your assigned responsibilities. Your customer password is separate and will stay unchanged.</Text>
    {done ? <Text role="status" className="mt-6">Password changed. Taking you back to sign in…</Text> : <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
      {error && <Text role="alert" className="text-ui-fg-error">{error}</Text>}
      <div><Label htmlFor="current-password">Temporary / current password</Label><Input id="current-password" type="password" autoComplete="current-password" required maxLength={128} value={current} onChange={e => setCurrent(e.target.value)} /></div>
      <div><Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} /><Text size="small" className="mt-2 text-ui-fg-subtle">12–128 characters, including uppercase, lowercase, a number and a symbol.</Text></div>
      <div><Label htmlFor="confirm-password">Confirm new password</Label><Input id="confirm-password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirm} onChange={e => setConfirm(e.target.value)} /></div>
      <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save password and sign in"}</Button>
      <a href="/app/login" className="text-center text-sm underline">Back to sign in</a>
    </form>}
  </Container>
}
