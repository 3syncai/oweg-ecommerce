import type { Config } from "meilisearch"

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

function resolveMeilisearchConstructor(): new (config: Config) => MeiliClient {
  // Medusa exec (CJS/ts-node) can mangle named ESM imports; resolve at runtime.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("meilisearch") as Record<string, unknown> & {
    default?: Record<string, unknown> | (new (config: Config) => MeiliClient)
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
    | (new (config: Config) => MeiliClient)
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
    if (!host) {
      throw new Error("MEILI_HOST is not configured")
    }
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

export default getMeiliClient
