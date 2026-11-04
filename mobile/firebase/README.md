# Firebase / FCM setup

1. Create a Firebase project (Console → Add project).
2. Add an **Android** app with package `in.oweg.store.preview` (and later the live `applicationId`).
3. Add an **iOS** app with bundle `in.oweg.store.preview` (and later the live Bundle ID).
4. Download:
   - `google-services.json` → `mobile/android/app/google-services.json`
   - `GoogleService-Info.plist` → `mobile/ios/App/App/GoogleService-Info.plist`
5. Apple Developer → Keys → create APNs key → upload to Firebase → Project settings → Cloud Messaging.
6. Create a service account with Firebase Cloud Messaging Admin, download JSON, set on the Medusa worker host:

```bash
FCM_PUSH_ENABLED=true
FCM_PROJECT_ID=your-firebase-project-id
FCM_SERVICE_ACCOUNT_FILE=/secure/path/firebase-adminsdk.json
# or FCM_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
```

Do not commit service-account JSON, `google-services.json` with restricted keys if policy forbids it, or APNs `.p8` files.
