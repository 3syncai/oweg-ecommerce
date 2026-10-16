export type ActivityView = "activity" | "technical"

/** Read-time presentation only: the underlying audit records are never changed. */
export function activityViewCtes(view: ActivityView): string {
  if (view === "technical")
    return `activity_events AS (
    SELECT a.*, 1::int AS repeat_count, a.created_at AS first_occurred_at FROM audit_snapshot a
  )`
  return `meaningful_events AS (
    SELECT a.* FROM audit_snapshot a WHERE
      a.category IN ('access_change','navigation')
      OR (a.category='authentication' AND a.action IN ('auth.login','auth.login_failed','auth.logout'))
      OR (a.category='api' AND a.method IN ('POST','PUT','PATCH','DELETE')
        AND COALESCE(a.path,'') NOT IN ('/admin/vendor-payouts/calculate','/admin/access/activity/page-view')
        AND NOT (COALESCE(a.status_code,200) < 400 AND a.request_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM audit_snapshot change
          WHERE change.category='access_change' AND change.request_id=a.request_id AND change.actor_id=a.actor_id
        )))
  ), previous_events AS (
    SELECT a.*, LAG(action) OVER actor_order AS previous_action,
      LAG(path) OVER actor_order AS previous_path, LAG(status_code) OVER actor_order AS previous_status,
      LAG(created_at) OVER actor_order AS previous_at, LAG(ip_address) OVER actor_order AS previous_ip,
      LAG(user_agent) OVER actor_order AS previous_agent
    FROM meaningful_events a WINDOW actor_order AS (PARTITION BY actor_id ORDER BY created_at,id)
  ), grouped_events AS (
    SELECT a.*, SUM(CASE WHEN category='navigation' AND action=previous_action
      AND path=previous_path AND status_code IS NOT DISTINCT FROM previous_status
      AND ip_address IS NOT DISTINCT FROM previous_ip AND user_agent IS NOT DISTINCT FROM previous_agent
      AND created_at-previous_at <= INTERVAL '60 seconds' THEN 0 ELSE 1 END)
      OVER (PARTITION BY actor_id ORDER BY created_at,id) AS activity_group
    FROM previous_events a
  ), ranked_events AS (
    SELECT id, actor_id, COUNT(*) OVER same_group AS repeat_count,
      MIN(created_at) OVER same_group AS first_occurred_at,
      ROW_NUMBER() OVER (PARTITION BY actor_id,activity_group ORDER BY created_at DESC,id DESC) AS position
    FROM grouped_events WINDOW same_group AS (PARTITION BY actor_id,activity_group)
  ), activity_events AS (
    SELECT original.*, grouped.repeat_count::int, grouped.first_occurred_at
    FROM ranked_events grouped JOIN audit_snapshot original ON original.id=grouped.id
    WHERE grouped.position=1
  )`
}
