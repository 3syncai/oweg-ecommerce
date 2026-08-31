# Runtime path (avoid OneDrive drift)

Next (`:3000`) and Medusa (`:9000`) for payment QA must run from:

`C:\dev\oweg_ecom_module\oweg-ecommerce`

Do **not** start servers from the OneDrive Desktop copy (`…\OneDrive\Desktop\oweg_ecom_module`). That tree can lag or diverge and reintroduce hard-delete / missing-snapshot behavior.

```powershell
cd C:\dev\oweg_ecom_module\oweg-ecommerce
npm run dev:warm
```

If both copies exist, prefer editing and verifying only under `C:\dev`.
