import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** Verified postal centroids used for distance ranking at checkout. */
export class Migration20261018140000 extends Migration {
  async up(): Promise<void> {
    this.addSql(`CREATE TABLE IF NOT EXISTS "postal_location_cache" (
      "postal_code" text PRIMARY KEY,
      "latitude" numeric NOT NULL CHECK (latitude BETWEEN -90 AND 90),
      "longitude" numeric NOT NULL CHECK (longitude BETWEEN -180 AND 180),
      "source" text NOT NULL,
      "verified_at" timestamptz NOT NULL DEFAULT now()
    );`)
  }

  async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "postal_location_cache";`)
  }
}
