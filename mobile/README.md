# OWEG mobile (Capacitor)

Installed app name: **Oweg Online Shopping App**. The preview flavor (`in.oweg.store.preview` → `https://www.0weg.in`) remains separate from the production flavor (`https://oweg.in`).

App icon and splash assets use the HD master at `resources/branding/logo.png`. Run `npm run assets:generate` from `mobile/` to regenerate Android and iOS assets. The Play Store listing name and icon must also be updated separately in Play Console.

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
