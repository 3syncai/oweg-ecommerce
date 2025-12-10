"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Migration20251118211014 = void 0;
const migrations_1 = require("@medusajs/framework/mikro-orm/migrations");
class Migration20251118211014 extends migrations_1.Migration {
    async up() {
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
    async down() {
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
exports.Migration20251118211014 = Migration20251118211014;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTWlncmF0aW9uMjAyNTExMTgyMTEwMTQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvbW9kdWxlcy92ZW5kb3IvbWlncmF0aW9ucy9NaWdyYXRpb24yMDI1MTExODIxMTAxNC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSx5RUFBcUU7QUFFckUsTUFBYSx1QkFBd0IsU0FBUSxzQkFBUztJQUNwRCxLQUFLLENBQUMsRUFBRTtRQUNOLElBQUksQ0FBQyxNQUFNLENBQUM7Ozs7Ozs7Ozs7Ozs7O0tBY1gsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLE1BQU0sQ0FBQzs7Ozs7Ozs7O0tBU1gsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLE1BQU0sQ0FBQzs7Ozs7Ozs7Ozs7OztLQWFYLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxNQUFNLENBQUM7Ozs7Ozs7Ozs7O0tBV1gsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLE1BQU0sQ0FBQzs7Ozs7Ozs7Ozs7Ozs7S0FjWCxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsTUFBTSxDQUFDOzs7Ozs7Ozs7OztLQVdYLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxNQUFNLENBQUM7Ozs7Ozs7OztLQVNYLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxNQUFNLENBQUM7Ozs7Ozs7Ozs7OztLQVlYLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRCxLQUFLLENBQUMsSUFBSTtRQUNSLElBQUksQ0FBQyxNQUFNLENBQUMsMkNBQTJDLENBQUMsQ0FBQztRQUN6RCxJQUFJLENBQUMsTUFBTSxDQUFDLDZDQUE2QyxDQUFDLENBQUM7UUFDM0QsSUFBSSxDQUFDLE1BQU0sQ0FBQywyQ0FBMkMsQ0FBQyxDQUFDO1FBQ3pELElBQUksQ0FBQyxNQUFNLENBQUMsZ0RBQWdELENBQUMsQ0FBQztRQUM5RCxJQUFJLENBQUMsTUFBTSxDQUFDLDZDQUE2QyxDQUFDLENBQUM7UUFDM0QsSUFBSSxDQUFDLE1BQU0sQ0FBQywyQ0FBMkMsQ0FBQyxDQUFDO1FBQ3pELElBQUksQ0FBQyxNQUFNLENBQUMsdUNBQXVDLENBQUMsQ0FBQztRQUNyRCxJQUFJLENBQUMsTUFBTSxDQUFDLDBDQUEwQyxDQUFDLENBQUM7SUFDMUQsQ0FBQztDQUNGO0FBMUhELDBEQTBIQyJ9