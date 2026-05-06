export function ok<T>(data: T, status = 200) {
  return Response.json({ success: true, data }, { status })
}

export function fail(message: string, status = 400, code?: string) {
  return Response.json(
    { success: false, error: { message, ...(code ? { code } : {}) } },
    { status }
  )
}
