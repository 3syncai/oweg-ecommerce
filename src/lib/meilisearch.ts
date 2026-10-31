/** Local config shape — avoid ESM type-only import issues under CJS/TS builds. */
type MeiliConfig = {
  host: string
  apiKey?: string
}

type MeiliClient = {
  index: (uid: string) => any
  getIndex: (uid: string) => Promise<any>
  createIndex: (uid: string, options?: { primaryKey?: string }) => Promise<{ taskUid: number }>
  deleteIndex: (uid: string) => Promise<{ taskUid: number }>
  tasks: {
    waitForTask: (taskUid: number, options?: { timeout?: number; interval?: number }) => Promise<any>
  }
}

export async function waitForMeiliTask(
  client: MeiliClient,
  taskUid: number,
  timeOutMs = 60_000
): Promise<any> {
  return client.tasks.waitForTask(taskUid, { timeout: timeOutMs })
}

const host = (process.env.MEILI_HOST || "http://127.0.0.1:7700").replace(/\/$/, "")
const apiKey = process.env.MEILI_MASTER_KEY || process.env.MEILI_API_KEY || ""

let client: MeiliClient | null = null

function resolveMeilisearchConstructor(): new (config: MeiliConfig) => MeiliClient {
  // Avoid named-import casing issues across Next/Turbopack and CJS loaders.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("meilisearch") as Record<string, unknown> & {
    default?: Record<string, unknown> | (new (config: MeiliConfig) => MeiliClient)
  }

  const candidates = [
    mod.Meilisearch,
    mod.MeiliSearch,
    typeof mod.default === "function" ? mod.default : undefined,
    mod.default && typeof mod.default === "object"
      ? (mod.default as Record<string, unknown>).Meilisearch ||
        (mod.default as Record<string, unknown>).MeiliSearch
      : undefined,
  ]

  const Ctor = candidates.find((c) => typeof c === "function") as
    | (new (config: MeiliConfig) => MeiliClient)
    | undefined

  if (!Ctor) {
    throw new Error(
      "meilisearch client constructor not found (expected Meilisearch export)"
    )
  }
  return Ctor
}

export function getMeiliClient(): MeiliClient {
  if (!client) {
    const Meilisearch = resolveMeilisearchConstructor()
    client = new Meilisearch({
      host,
      apiKey: apiKey || undefined,
    })
  }
  return client
}

export function getProductsIndexName(): string {
  return process.env.MEILI_PRODUCTS_INDEX || "products"
}

export function isMeiliConfigured(): boolean {
  return Boolean(process.env.MEILI_HOST || process.env.MEILI_MASTER_KEY)
}

export default getMeiliClient
