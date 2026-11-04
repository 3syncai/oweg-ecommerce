# Homepage snapshot rollout

The refresh script builds one public catalogue snapshot for the storefront. Use the same publishable key, sales channel and currency as the Vercel storefront. The worker defaults to the local Medusa listener on port 9000. Set `HOME_FEED_MEDUSA_URL` if that listener differs.

1. Deploy the code with `HOME_FEED_SNAPSHOT_ENABLED` unset. Confirm the VPS and storefront use the same PostgreSQL database and schema. The VPS needs Node 20 or newer and the backend dependencies used for the Medusa build, including `ts-node`.
2. In `/var/www/oweg/oweg-ecommerce/my-medusa-store`, apply and seed the snapshot:

   ```sh
   node scripts/refresh-home-feed.cjs --migrate &&
   timeout 120s node scripts/refresh-home-feed.cjs &&
   node scripts/refresh-home-feed.cjs --check
   ```

3. Schedule the refresh script on the existing VPS every five minutes using the absolute Node path and a 120-second timeout. Use the existing server log collection for its output. A PostgreSQL advisory lock coordinates refreshes across workers. The read-only `--check` command exits with an error if the snapshot is missing, invalid or expired.
4. Enable `HOME_FEED_SNAPSHOT_ENABLED=true` on a Vercel preview using a staging database first. Check the first rows at a mobile viewport on Fast 4G. Confirm repeated feed requests return the same rows while the snapshot is current. In staging, fail a category request during a refresh and confirm the last successful feed is still served. Verify cart and checkout against current catalogue data.
5. After the preview checks pass and the production seed is verified, enable the same flag on production and redeploy the storefront. Check the homepage and `/api/home/feed`, refresh logs, snapshot age, database connections and origin request rates. The snapshot expires after 30 minutes. The worker keeps the previous version when a refresh fails.

To roll back, unset the storefront flag and redeploy. The existing feed path resumes. Stop the VPS refresh schedule if rolling back the worker as well. The snapshot table can be retained for diagnosis.
