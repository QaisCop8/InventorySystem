# NoonERP System — Android app

This is a native Android app (Capacitor 6) that opens the live NoonERP System server. It includes login, all screens and the POS cashier.

The system runs on its server: API routes, a database and multi-tenant data. So the app does not bundle the system. It loads it from `server.url`. The main repo still has a single codebase, and updates to the server reach the app right away with no new APK.

## Building the APK (GitHub Actions)
1. Push changes under `android-app/` to GitHub. Or open **Actions → Build Android APK → Run workflow**, where you can enter a different server URL.
2. When the run finishes, download **Artifacts → NoonERP-System-android-N**. It contains `NoonERP-System-debug.apk`.
3. Copy the APK to the phone and install it. Allow "install from unknown sources" if Android asks.

### Server URL
Settings are applied in this order:
1. The `server_url` input when running the workflow manually.
2. The repository variable `ANDROID_SERVER_URL`, set under Settings → Secrets and variables → Actions → Variables.
3. The `server.url` value in `capacitor.config.json`.

The URL must use https.

### Signed release APK (optional, for Google Play or permanent distribution)
Create the keystore once:
```
keytool -genkey -v -keystore noonerp.jks -alias noonerp -keyalg RSA -keysize 2048 -validity 10000
```
Then add these secrets under Settings → Secrets and variables → Actions:
- `ANDROID_KEYSTORE_BASE64`: the output of `base64 -w0 noonerp.jks`
- `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`

The run will then also produce `NoonERP-System-release.apk`. Keep the keystore safe: every update must be signed with the same key.

## Download button on the home screen
The welcome dashboard shows a "تطبيق أندرويد" button when an APK is available. The button uses the fixed link `/api/mobile-app/download`, which points to one of:
1. `ANDROID_APK_URL` on the server. Every build is also published to the GitHub release `android-latest`, so you can use
   `https://github.com/QaisCop8/InventorySystem/releases/download/android-latest/NoonERP-System.apk`.
   This only works if the repository is public.
2. Otherwise, the file `public/downloads/NoonERP-System.apk` on the server. Copy the APK there yourself.

If neither exists, the button does not appear.

## Building locally (needs JDK 17 + Android SDK)
```
cd android-app
npm install
npm run android:add
cd android && ./gradlew assembleDebug
```

## Notes
- **Links:** links to the system server open inside the app. Any other link (WhatsApp, maps…) opens outside the app.
- **Camera:** the camera permission is declared so the barcode can be scanned from the page.
- **No connection:** the app shows a "تعذر الوصول إلى الخادم" page with a retry button. The POS cashier keeps working offline after it has been opened at least once.
