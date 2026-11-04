# OWEG Capacitor mobile rollout

Customer storefront only. Shell lives in [`mobile/`](../mobile/). Storefront detects Capacitor and uses native push + force-update. Backend extends the existing campaign worker with FCM.

## Architecture

| Flavor | App name | Bundle / applicationId | Loads |
|--------|----------|------------------------|-------|
| preview (default) | OWEG Preview | `in.oweg.store.preview` | `https://0weg.in` |
| production | OWEG | live IDs (`OWEG_*_APP_ID`) | `https://oweg.in` |

Private test app and live OWEG listing are **separate store records**. Cutover = upload prod flavor as a **new version** of the existing OWEG apps, then raise min version.

## One-time setup

### Code / DB

```bash
# From my-medusa-store (after backup / isolated rehearsal)
node scripts/install-native-push.cjs --apply
```

Set worker env (in addition to existing web-push vars):

```bash
FCM_PUSH_ENABLED=true
FCM_PROJECT_ID=...
FCM_SERVICE_ACCOUNT_FILE=/path/to/sa.json
OWEG_IOS_MIN_VERSION=0.0.0
OWEG_ANDROID_MIN_VERSION=0.0.0
OWEG_IOS_STORE_URL=https://apps.apple.com/app/idXXXXXXXX
OWEG_ANDROID_STORE_URL=https://play.google.com/store/apps/details?id=YOUR_LIVE_ID
```

Restart `medusa-api` and `oweg-notification-worker`.

### Mobile project

```bash
cd mobile
npm install
npm run sync:preview
npx cap add ios
npx cap add android
npm run sync:preview
```

Place Firebase files per [`mobile/firebase/README.md`](../mobile/firebase/README.md).

Open Xcode / Android Studio:

```bash
npm run open:ios
npm run open:android
```

Enable Push Notifications capability on the iOS target. Ensure Android `google-services` plugin is applied (Capacitor Push docs).

## Private UAT (Preview)

1. Build Preview scheme / `applicationIdSuffix` flavor → `in.oweg.store.preview`.
2. **Play:** create app “OWEG Preview” → Internal testing → upload AAB → add testers.
3. **Apple:** App Store Connect app “OWEG Preview” → archive → TestFlight internal.
4. Verify on device: login, cart, Razorpay checkout, Account → Notifications enable, admin campaign delivery, notification tap opens path.

## Cutover to live OWEG listings

1. Confirm live Bundle ID / applicationId + signing continuity.
2. Register those IDs in Firebase; download prod `google-services` files into the prod flavor build.
3. `OWEG_APP_FLAVOR=production OWEG_IOS_BUNDLE_ID=... OWEG_ANDROID_APP_ID=... npm run sync:prod`
4. Upload AAB/IPA as **updates** to existing OWEG store listings (staged rollout recommended).
5. After production release is live, set:

```bash
OWEG_IOS_MIN_VERSION=1.0.0   # new Capacitor version
OWEG_ANDROID_MIN_VERSION=1.0.0
```

Force-update gate in the storefront blocks older binaries and opens the store URL.

## Storefront behaviour

- `isNativeApp()` → hide PWA install prompt; use `NativePushPreferences` / Capacitor Push plugin.
- Browser/PWA path unchanged (`browser-push` + VAPID).
- `GET /store/app-version` (proxied as `/api/medusa/app-version`) drives the gate.

## Checklist before calling UAT done

- [ ] Preview installs via Internal testing + TestFlight
- [ ] `0weg.in` loads inside WebView
- [ ] Razorpay completes a test payment
- [ ] FCM token saved (`provider=fcm` row) after opt-in
- [ ] Campaign reaches device
- [ ] Force-update shows when min_version > installed version
