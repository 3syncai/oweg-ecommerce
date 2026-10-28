/** Image inputs accept legacy HTTP, but published URLs must still be HTTPS. */
export function isRemoteImageSource(value: string): boolean {
  try {
    const url = new URL(value.trim())
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
  } catch { return false }
}
