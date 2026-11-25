# Vendor account activity

Apply the vendor module migration `Migration20261123000001` before enabling tracking. The admin vendor detail reads the latest successful login and latest observed activity per staff account. Foreground navigation, interaction with a visible portal, and successful writes count as activity. Background GET polling does not.

For a portal behind a managed ingress, set `VENDOR_ACTIVITY_CLIENT_IP_HEADER` on the portal to a single-IP header that the ingress **overwrites** on every request. Ensure callers cannot reach the origin around that ingress. Set the same random server-only `VENDOR_ACTIVITY_PROXY_SECRET` in the portal and Medusa. The portal replaces incoming activity headers and signs the observed address. Missing configuration or an invalid signature produces an unavailable IP. For direct backend access through trusted reverse proxies, configure their exact addresses or CIDRs in `VENDOR_ACTIVITY_TRUSTED_PROXIES`.

On staging, sign in from two known networks, navigate in each, and compare the admin values with the observed outbound addresses. Verify idle polling leaves the activity timestamp alone. A five-minute same-IP write interval and per-account request caps limit storage traffic. IPv4/IPv6 addresses can identify shared gateways and VPN exits.
