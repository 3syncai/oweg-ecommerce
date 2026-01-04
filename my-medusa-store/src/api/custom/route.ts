// Minimal types to avoid coupling to framework types at build time
type Res = { sendStatus: (code: number) => void }

export async function GET(
  _req: unknown,
  res: Res
) {
  res.sendStatus(200);
}
