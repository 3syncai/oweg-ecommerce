import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20251118211014 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE IF NOT EXISTS customer_login_logs (
        id SERIAL PRIMARY KEY,
        medusa_customer_id TEXT,
        opencart_customer_id INT,
        ip VARCHAR(64),
        user_agent TEXT,
        url TEXT,
        referrer TEXT,
        login_attempts INT DEFAULT 1,
        date_added TIMESTAMP DEFAULT NOW(),
        date_modified TIMESTAMP,
        raw_json JSONB
      );
    `);

    this.addSql(`
      CREATE TABLE IF NOT EXISTS customer_ip_logs (
        id SERIAL PRIMARY KEY,
        medusa_customer_id TEXT,
        opencart_customer_id INT,
        ip VARCHAR(64),
        date_added TIMESTAMP DEFAULT NOW(),
        raw_json JSONB
      );
    `);

    this.addSql(`
      CREATE TABLE IF NOT EXISTS customer_search_logs (
        id SERIAL PRIMARY KEY,
        medusa_customer_id TEXT,
        opencart_customer_id INT,
        keyword TEXT,
        category_id INT,
        sub_category BOOLEAN,
        description BOOLEAN,
        ip VARCHAR(64),
        date_added TIMESTAMP DEFAULT NOW(),
        raw_json JSONB
      );
    `);

    this.addSql(`
      CREATE TABLE IF NOT EXISTS customer_activity_logs (
        id SERIAL PRIMARY KEY,
        medusa_customer_id TEXT,
        opencart_customer_id INT,
        activity_type TEXT,
        data JSONB,
        ip VARCHAR(64),
        date_added TIMESTAMP DEFAULT NOW(),
        raw_json JSONB
      );
    `);

    this.addSql(`
      CREATE TABLE IF NOT EXISTS customer_transaction_logs (
        id SERIAL PRIMARY KEY,
        medusa_customer_id TEXT,
        opencart_customer_id INT,
        order_id INT,
        description TEXT,
        amount NUMERIC(15,2),
        commission NUMERIC(15,2),
        withdrawal_id INT,
        downline_id INT,
        date_added TIMESTAMP DEFAULT NOW(),
        raw_json JSONB
      );
    `);

    this.addSql(`
      CREATE TABLE IF NOT EXISTS customer_reward_logs (
        id SERIAL PRIMARY KEY,
        medusa_customer_id TEXT,
        opencart_customer_id INT,
        order_id INT,
        points INT,
        description TEXT,
        date_added TIMESTAMP DEFAULT NOW(),
        raw_json JSONB
      );
    `);

    this.addSql(`
      CREATE TABLE IF NOT EXISTS customer_wishlist_logs (
        id SERIAL PRIMARY KEY,
        medusa_customer_id TEXT,
        opencart_customer_id INT,
        product_id INT,
        date_added TIMESTAMP DEFAULT NOW(),
        raw_json JSONB
      );
    `);

    this.addSql(`
      CREATE TABLE IF NOT EXISTS customer_online_logs (
        id SERIAL PRIMARY KEY,
        medusa_customer_id TEXT,
        opencart_customer_id INT,
        ip VARCHAR(64),
        user_agent TEXT,
        url TEXT,
        referer TEXT,
        date_added TIMESTAMP DEFAULT NOW(),
        raw_json JSONB
      );
    `);
  }

  async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS customer_online_logs`);
    this.addSql(`DROP TABLE IF EXISTS customer_wishlist_logs`);
    this.addSql(`DROP TABLE IF EXISTS customer_reward_logs`);
    this.addSql(`DROP TABLE IF EXISTS customer_transaction_logs`);
    this.addSql(`DROP TABLE IF EXISTS customer_activity_logs`);
    this.addSql(`DROP TABLE IF EXISTS customer_search_logs`);
    this.addSql(`DROP TABLE IF EXISTS customer_ip_logs`);
    this.addSql(`DROP TABLE IF EXISTS customer_login_logs`);
  }
}

