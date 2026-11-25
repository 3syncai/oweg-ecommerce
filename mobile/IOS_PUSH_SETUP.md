# iOS push notifications: what to do (for the iOS teammate)

Handoff note for the iOS teammate. The code changes are already made.
What is left needs a Mac, Xcode and the Apple Developer / Firebase accounts.

## What is already done in the code
- `mobile/ios/App/Podfile`: added `pod 'FirebaseMessaging'`
- `mobile/ios/App/App/AppDelegate.swift`: configures Firebase (only if `GoogleService-Info.plist` is bundled) and
  forwards the APNs token to Firebase, then hands the FCM token to Capacitor.
- `mobile/ios/App/App/Info.plist`: added `UIBackgroundModes` -> `remote-notification`
- Web app (`src/lib/native-push.ts`, `src/components/mobile/NativePushPrompt.tsx`): shows the "Enable notifications"
  sheet once, asks for permission, registers the token with the server.

## Why Firebase is needed on iOS
The backend sends through Firebase Cloud Messaging (FCM) for both platforms. Capacitor on iOS normally returns a raw
APNs token, which FCM cannot use. The Firebase SDK exchanges it for an FCM token. Do not skip this.

## Steps (in order)

### 1. Firebase console (project owner may need to do this)
1. Open the existing Firebase project (the one Android uses).
2. Project settings -> General -> Your apps -> **Add app -> iOS**.
3. Bundle ID: `in.oweg.store.preview` (preview build). For the live app use the real production bundle ID.
   It must match the Xcode bundle identifier exactly.
4. Download **GoogleService-Info.plist**.
5. Do not commit it. It is gitignored (`mobile/.gitignore`).

### 2. Apple Developer account: APNs key
1. developer.apple.com -> Certificates, Identifiers & Profiles -> **Keys** -> "+".
2. Tick **Apple Push Notifications service (APNs)**, create, download the `.p8` file (one-time download). Note the **Key ID** and your **Team ID**.
3. Identifiers -> select the app ID `in.oweg.store.preview` -> enable **Push Notifications** capability -> Save.
4. Firebase console -> Project settings -> **Cloud Messaging** -> Apple app configuration -> **APNs Authentication Key**
   -> Upload the `.p8`, enter Key ID and Team ID.
5. Keep the `.p8` somewhere safe. Never commit it (`*.p8` is gitignored).

### 3. On the Mac
From the repo root:

```bash
git pull   # get the branch with the push changes
cd mobile
npm install
npm run sync:preview        # runs cap sync, also installs pods
cd ios/App
pod install --repo-update   # make sure FirebaseMessaging is installed
open App.xcworkspace        # always the .xcworkspace, not .xcodeproj
```

### 4. Xcode
1. Drag **GoogleService-Info.plist** into the `App` folder (under the `App` target), tick **Copy items if needed** and
   target membership **App**. Confirm it appears under Build Phases -> Copy Bundle Resources.
2. Select the **App** target -> **Signing & Capabilities**:
   - Pick the Team, keep "Automatically manage signing".
   - Click **+ Capability** -> **Push Notifications**. (This creates `App.entitlements` with `aps-environment`.)
   - Click **+ Capability** -> **Background Modes** -> tick **Remote notifications**
     (the Info.plist key is already there; this keeps Xcode's view consistent).
3. Bundle identifier must be `in.oweg.store.preview` (preview) and match Firebase and the Apple App ID.
4. If the build fails on `import FirebaseCore`/`FirebaseMessaging`: run `pod install` again and open the `.xcworkspace`.

### 5. Test on a REAL iPhone (simulators cannot receive remote push reliably)
1. Connect the iPhone, select it as the run target, press Run.
2. App opens -> after a few seconds the "Stay in the loop" sheet appears -> tap **Enable notifications** -> tap **Allow**.
3. Log in to a customer account in the app. The device token is saved to the server once the customer is signed in.
4. In Firebase console -> Messaging -> "Send test message", paste the FCM token (print it from Xcode logs if needed),
   or send a campaign from the Medusa admin -> Push notifications page.
5. Put the app in the background / lock the phone and confirm the notification arrives. Tap it and confirm it opens the right page.

### 6. TestFlight / release builds
- Debug builds use the APNs **sandbox**; TestFlight/App Store builds use **production** APNs.
  The single APNs key from step 2 works for both, so no extra setup is needed.
- Archive with a Distribution profile that has Push Notifications enabled.

## Troubleshooting
| Symptom | Likely cause |
|---|---|
| App crashes on launch | `GoogleService-Info.plist` bundle ID mismatch, or Firebase pod missing. (A *missing* plist does not crash; push just stays off.) |
| Permission accepted but no token | Push Notifications capability missing, or running on a simulator |
| Token saved, nothing arrives | APNs key not uploaded to Firebase, wrong Key ID/Team ID, or bundle ID mismatch |
| Works in debug, not TestFlight | App ID lacks Push Notifications, or distribution provisioning profile is stale: regenerate it |
| "App notifications are not available yet" | Server missing `FCM_PUSH_ENABLED=true` and FCM service account env vars (see `mobile/firebase/README.md`) |

## Send back to the owner
- Confirmation that the push test on a real device worked.
- Anything changed in `project.pbxproj` / `App.entitlements` (commit those; they are safe to commit).
- Do NOT commit: `GoogleService-Info.plist`, `.p8`, provisioning profiles.
