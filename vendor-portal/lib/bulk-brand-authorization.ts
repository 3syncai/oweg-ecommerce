export type SavedBrandAuthorization =
  | { status: "authorized" | "pending" | "uploaded"; fileUrl?: string }
  | { status: "missing" }

export type BrandAuthState = SavedBrandAuthorization
  | { status: "checking" }
  | { status: "preparing" | "uploading"; file: File; previous: SavedBrandAuthorization }
  | { status: "selected"; file: File; previous: SavedBrandAuthorization; message?: string }
  | { status: "error"; message: string }

export function savedAuthorization(state: BrandAuthState | undefined): SavedBrandAuthorization {
  if (state && "previous" in state) return state.previous
  if (state?.status === "authorized" || state?.status === "pending" || state?.status === "uploaded" || state?.status === "missing") return state
  return { status: "missing" }
}

/** Called only by explicit Submit. Successful letters are retained if a later upload fails. */
export async function submitBrandLetters(
  brands: ReadonlyArray<{ key: string; display: string }>,
  states: Record<string, BrandAuthState>,
  upload: (brand: string, file: File) => Promise<string>,
  onChange: (key: string, state: BrandAuthState) => void,
) {
  for (const brand of brands) {
    const state = states[brand.key]
    if (state?.status !== "selected") continue
    onChange(brand.key, { ...state, status: "uploading" })
    try {
      const fileUrl = await upload(brand.display, state.file)
      if (!fileUrl) throw new Error("The server did not return a brand letter URL. Please retry.")
      onChange(brand.key, { status: "uploaded", fileUrl })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Failed to upload brand letter"
      onChange(brand.key, { ...state, message })
      throw new Error(`${brand.display}: ${message}`)
    }
  }
}
