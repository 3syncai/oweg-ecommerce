import type { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { Client } from "pg"

/**
 * Create or repair a Medusa admin user (links auth identity to user_id, sets password).
 *
 * Usage:
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='secret' npx medusa exec ./scripts/upsert-admin-user.ts
 */
export default async function upsertAdminUser({ container }: ExecArgs) {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD

  if (!email || !password) {
    throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD environment variables")
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required")
  }

  const userModule = container.resolve(Modules.USER) as {
    listUsers: (filters: { email: string }) => Promise<Array<{ id: string; email: string }>>
    createUsers: (input: Array<{ email: string }>) => Promise<Array<{ id: string; email: string }>>
    deleteUsers: (ids: string[]) => Promise<void>
  }

  const authService = container.resolve(Modules.AUTH) as {
    updateProvider: (
      provider: string,
      input: { entity_id: string; password: string }
    ) => Promise<{ success?: boolean; error?: string }>
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  try {
    await client.query("BEGIN")

    let users = await userModule.listUsers({ email })
    if (!users.length) {
      users = await userModule.createUsers([{ email }])
      console.log(`Created admin user record for ${email}`)
    }

    if (users.length > 1) {
      const keep = users[0]
      const removeIds = users.slice(1).map((u) => u.id)
      await userModule.deleteUsers(removeIds)
      console.log(`Removed ${removeIds.length} duplicate user row(s) for ${email}`)
      users = [keep]
    }

    const userId = users[0].id

    const providerRes = await client.query<{
      auth_identity_id: string
      app_metadata: Record<string, unknown> | null
    }>(
      `
        SELECT ai.id AS auth_identity_id, ai.app_metadata
        FROM provider_identity pi
        JOIN auth_identity ai ON ai.id = pi.auth_identity_id
        WHERE pi.entity_id = $1
          AND pi.provider = 'emailpass'
          AND pi.deleted_at IS NULL
          AND ai.deleted_at IS NULL
        LIMIT 1
      `,
      [email]
    )

    if (!providerRes.rows.length) {
      throw new Error(
        `No emailpass identity for ${email}. Create with: npx medusa user -e ${email} -p <password>`
      )
    }

    const { auth_identity_id, app_metadata } = providerRes.rows[0]
    const currentUserId =
      app_metadata && typeof app_metadata.user_id === "string" ? app_metadata.user_id : null

    if (currentUserId !== userId) {
      await client.query(
        `
          UPDATE auth_identity
          SET app_metadata = $2::jsonb, updated_at = NOW()
          WHERE id = $1
        `,
        [
          auth_identity_id,
          JSON.stringify({
            user_id: userId,
          }),
        ]
      )
      console.log(`Linked ${email} auth identity to admin user ${userId}`)
    }

    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    await client.end()
  }

  const updateResult = await authService.updateProvider("emailpass", {
    entity_id: email,
    password,
  })

  if (!updateResult?.success) {
    throw new Error(updateResult?.error || `Failed to set password for ${email}`)
  }

  console.log(`Admin ready: ${email}`)
}
