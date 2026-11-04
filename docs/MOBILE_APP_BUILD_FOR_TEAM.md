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

## 2. Run on iOS

```bash
cd mobile
npm run open:ios
```

In Xcode: select a simulator or device → Run (▶).

Confirm: **no Safari URL bar**, site is `0weg.in`, OWEG splash/icon.

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
