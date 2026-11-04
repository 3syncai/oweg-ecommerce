# OWEG mobile (Capacitor)

Private **OWEG Preview** (`in.oweg.store.preview` → `https://0weg.in`) first, then production flavor → live OWEG store listings (`https://oweg.in`).

**Team build / try guide:** [`docs/MOBILE_APP_BUILD_FOR_TEAM.md`](../docs/MOBILE_APP_BUILD_FOR_TEAM.md)  
Full rollout: [`docs/MOBILE_APP_ROLLOUT.md`](../docs/MOBILE_APP_ROLLOUT.md)  
Firebase: [`firebase/README.md`](./firebase/README.md)

```bash
npm install
npm run sync:preview
npm run open:ios
# Android CLI build (no Studio required): see team guide → ./gradlew assembleRelease
```

Production cutover:

```bash
OWEG_APP_FLAVOR=production \
OWEG_IOS_BUNDLE_ID=YOUR_LIVE_IOS_ID \
OWEG_ANDROID_APP_ID=YOUR_LIVE_ANDROID_ID \
npm run sync:prod
```
