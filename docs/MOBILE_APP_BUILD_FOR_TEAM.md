# Build & try OWEG Preview (team guide)

Capacitor shell for the customer storefront. Preview app id: `in.oweg.store.preview` → loads `https://0weg.in`.

Full rollout / Play cutover: [MOBILE_APP_ROLLOUT.md](./MOBILE_APP_ROLLOUT.md).

## Prerequisites

- Node 20+ (or current project Node)
- Xcode (for iOS simulator / device)
- For Android **without** Android Studio UI:
  - JDK **21** (`brew install openjdk@21`)
  - Android SDK at `~/Library/Android/sdk` (platforms **36**, build-tools)
- Optional: Android Studio if you prefer the IDE

## 1. Get the code

```bash
git fetch origin
git checkout <branch-name>   # e.g. feature/capacitor-preview-app
cd mobile
npm install
npm run sync:preview
```

`sync:preview` writes Capacitor config for Preview and syncs `ios/` + `android/`.

## 2. Run on iOS (local)

```bash
cd mobile
npm run open:ios
```

In Xcode: select a simulator or device → Run (▶).

Confirm: **no Safari URL bar**, site is `0weg.in`, OWEG splash/icon.

## 2b. iOS TestFlight (App Store Connect) — how we ship Preview

Preview is **not** the public App Store app. It is a separate listing: **OWEG Preview** (`in.oweg.store.preview`) → TestFlight internal only. Live store app remains **OWEG Online**.

### One-time: App Store Connect app + Bundle ID

1. Sign in: [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **Apps**.
2. If a yellow banner asks for the **Paid Applications Schedule**: the **Account Holder (Legal)** must accept it under **Business**, and accept the latest Apple Developer Program License Agreement on [developer.apple.com](https://developer.apple.com) if prompted. Until that is done, new apps / submissions are blocked.
3. Register Bundle ID (if missing):
   - [developer.apple.com](https://developer.apple.com) → **Certificates, Identifiers & Profiles** → **Identifiers** → **+**
   - App IDs → App → Description `OWEG Preview` → Explicit Bundle ID `in.oweg.store.preview` → Register  
   - Optional: enable **Push Notifications** (can add later).
4. Create the app: Apps → **+** → **New App**
   - Platforms: **iOS** only  
   - Name: `OWEG Preview`  
   - Primary Language: English (U.S.)  
   - Bundle ID: `in.oweg.store.preview`  
   - SKU: `oweg-preview`  
   - User Access: **Full Access** → Create  
5. Ignore **Distribution** / screenshots / “Add for Review” for Preview. Use the **TestFlight** tab only.

Do **not** reuse **OWEG Online** or the removed **Oweg** listing for Preview.

### Status bar / Dynamic Island (Capacitor)

Native config uses `StatusBar.overlaysWebView: true` + `ios.contentInset: "never"` so the
WebView draws edge-to-edge; the storefront header pads with safe-area (`NativeStatusBar`
publishes `--oweg-sat` when needed). This avoids the white gap above the logo on iPhone.
After changing StatusBar config, run `npm run sync:preview` and ship a **new** TestFlight build.

### First upload from Xcode

```bash
cd mobile
npm install
npm run sync:preview
npm run open:ios
```

In Xcode:

1. Toolbar device: **Any iOS Device (arm64)** — **not** a Simulator (Archive is disabled on Simulator).
2. Left sidebar: press **⌘1** → click the top blue **App** project → **TARGETS → App**.
3. **Signing & Capabilities**:
   - **Automatically manage signing** on  
   - **Team**: paid org team (e.g. `MAMTA CHOUDHARY`) — **not** `… (Personal Team)`  
   - Bundle Identifier must be `in.oweg.store.preview`
4. Menu: **Product → Archive** (wait for build).  
   - If macOS asks for a keychain password for `codesign`: use the **Mac login password** → prefer **Always Allow**.  
   - If an **Xcode Cloud / Grant Access to Source Code** wizard appears: **Cancel** — we upload a local archive, not Xcode Cloud.
5. **Organizer** opens (or **Window → Organizer**):
   - Select the archive → **Distribute App**  
   - **App Store Connect** → **Next**  
   - **Upload** → **Next** → leave defaults → Upload  
6. “Upload completed with warnings” about iOS 15 / future SDK (e.g. April 2027) can be ignored for now → **Done**.

### TestFlight after upload

1. App Store Connect → **OWEG Preview** → **TestFlight**.
2. Build shows **Processing**, then often **Missing Compliance** → **Manage**:
   - Encryption: choose **None of the algorithms mentioned above** (HTTPS / system networking only) → Save.  
3. When status is **Ready to Submit** / ready to test:
   - **Internal Testing** → **+** create a group (e.g. `OWEG Team`).  
   - **Builds** tab on the group: attach build **1.0 (1)** if not already attached.  
   - **Testers**: add people who already exist under **Users and Access**.  
   - Emails **not** in the list: top nav **Users and Access** → invite with role Developer/Marketing + access to OWEG Preview → they accept → then add them to the TestFlight group.
4. On iPhone: install **TestFlight** → same Apple ID as the invite → Install **OWEG Preview**.  
5. Smoke-check: no Safari URL bar, site is `0weg.in`.

### Pushing new changes to TestFlight

| Kind of change | Need new IPA? |
|----------------|---------------|
| Only website / `0weg.in` content | Usually **no** — shell loads the live site |
| Native / Capacitor / icons / splash / iOS config / plugins | **Yes** — new archive + upload |

For each new native build:

```bash
cd mobile
npm run sync:preview
npm run open:ios
```

1. Xcode → **TARGETS → App → General**: bump **Build** (`1` → `2` → `3`…). Bump **Version** only when you want a visible version change. **Never reuse** a Build number — Apple rejects it.
2. Device: **Any iOS Device (arm64)** → **Product → Archive** → Distribute → Upload.
3. TestFlight: wait for Processing → compliance if asked. Internal group testers get the new build (Update in TestFlight).

### Identifiers cheat sheet

| Field | Value |
|-------|--------|
| App name | OWEG Preview |
| Bundle ID | `in.oweg.store.preview` |
| SKU | `oweg-preview` |
| Loads URL | `https://0weg.in` |
| Distribution | TestFlight **internal** (not public App Store) |

## 3. Build Android AAB / APK (CLI — no Android Studio required)

```bash
cd mobile

# One-time: create your own upload keystore (do NOT commit)
keytool -genkeypair -v -storetype PKCS12 \
  -keystore oweg-preview.keystore \
  -alias oweg-preview \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=OWEG Preview, OU=Mobile, O=YourOrg, C=IN"

# android/keystore.properties (gitignored) example:
# storeFile=../oweg-preview.keystore
# storePassword=...
# keyAlias=oweg-preview
# keyPassword=...

export JAVA_HOME=/opt/homebrew/opt/openjdk@21
export ANDROID_HOME=$HOME/Library/Android/sdk

cd android
./gradlew bundleRelease    # → app/build/outputs/bundle/release/app-release.aab
./gradlew assembleRelease  # → app/build/outputs/apk/release/app-release.apk
```

Notes:

- `minSdk` **24**, `targetSdk` / `compileSdk` **36** (Play requirements as of this branch).
- Bump `versionCode` / `versionName` in `android/app/build.gradle` before each Play upload.
- **Play updates** for the existing Preview listing need the **same upload keystore** as the first release. Ask the teammate who published for a secure copy — do not put it in git.

## 4. Try the app (testers)

### A. Play Internal testing (preferred for QA)

1. Be on the **oweg test cluster** (or whatever email list is enabled) in Play Console.
2. Open the **Join on the web** link from Internal testing → Testers (on the phone).
3. Accept → Install from Play.

If Play shows **Can’t download … (unreviewed)**: finish Dashboard **Set up your app** tasks, wait, or use APK below.

### B. Sideload APK (fast local try)

```bash
adb install -r mobile/android/app/build/outputs/apk/release/app-release.apk
```

Or copy `app-release.apk` to the phone and open it (allow unknown apps).

## 5. What not to commit

- `*.keystore`, `android/keystore.properties`, `oweg-preview-upload-credentials.txt`
- `google-services.json` / `GoogleService-Info.plist` (Firebase — later)
- `node_modules/`, `android/app/build/`, Pods

## 6. Native push (optional later)

Firebase is **not** required to browse/login/checkout. When ready: [mobile/firebase/README.md](../mobile/firebase/README.md) + Medusa `FCM_*` env + `install-native-push.cjs`.
