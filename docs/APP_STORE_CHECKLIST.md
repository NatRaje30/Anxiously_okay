# App Store submission checklist — Anxiously Okay

Bundle ID `com.anxiouslyokay.app` · version `1.0.0` · minimum iOS 15

## Before you start

- [ ] Final app icon and splash art in `assets/`, then `npm run assets` (current files are placeholders).
- [ ] Final privacy-screen image: `ios/App/App/Assets.xcassets/PrivacyScreen.imageset/privacy-screen.png` (1290×2796, cream, app name only).
- [ ] `npm run sync` (release build — no developer tools), then **Product → Archive** in Xcode.
- [ ] Signing team set; version and build number bumped.
- [ ] Every item in `docs/QA_CHECKLIST.md` passed on a real iPhone.
- [ ] Decide on iPad: the template allows iPad. Either supply iPad screenshots, or set *Targeted Device Family* to iPhone only in Xcode.

## App Privacy ("nutrition label")

Answer: **Data Not Collected.**

This is accurate for this build because nothing is transmitted off the device: there are no accounts, no servers, no analytics, ads, crash reporting or third-party SDKs that send data. Entries, photos, videos and voice notes are stored only on the device, encrypted. (Apple counts data as "collected" only when it leaves the device.) Re-check this if you ever add a server, analytics, crash reporting or cloud backup.

- [ ] Privacy Policy URL: host `docs/privacy.html` (after review) and enter its URL.

## Export compliance

`ITSAppUsesNonExemptEncryption = false` is set in Info.plist. The app only uses standard encryption (AES-256-GCM via the system Web Crypto implementation, and the iOS Keychain) to protect the person's own data on their own device. Confirm this exemption applies to you before submitting.

## Age rating

Answer the questionnaire honestly. Relevant points:

- No user-generated content is shared with others; no chat, no web browsing inside the app.
- The app discusses anxiety and shows crisis-line numbers; it is not medical treatment ("Medical or treatment information": answer as you judge — the app gives general wellbeing support, not medical advice).
- No mature or suggestive themes, violence, gambling, contests or purchases.

The privacy policy states the app is not directed at children under 13.

## Required URLs and text

- [ ] **Support URL** (required) — a page or email address where people can reach you.
- [ ] **Marketing URL** (optional).
- [ ] **Description** should repeat that the app is "not a replacement for professional care" and point to the crisis resources on the Support screen.
- [ ] **Keywords, subtitle, category:** Health & Fitness (or Lifestyle).

## Screenshots

- [ ] **iPhone 6.9"** — 1320×2868 or 1290×2796 portrait (required; App Store Connect scales these down for smaller iPhones).
- [ ] **iPad 13"** — 2064×2752 or 2048×2732 portrait, **only if iPad stays enabled**.
- Suggested set: Mood check-in · Support (breathing + "You're safe. I've got you.") · Comfort Room · My Corner · Me → Reminders and Privacy.
- Use seeded example data (dev build → Developer tools), never real entries.

## Notes for App Review

> Anxiously Okay is a native, offline-first wellbeing companion. It is not a website wrapper: the app is bundled in the binary and works fully in airplane mode.
>
> Native features you can try:
> • **Local notifications:** after logging a first mood, the app asks (with an explanation first) whether to send one gentle check-in a day. Notifications are planned on the device for the next 14 days. Each one has Heavy / Steady / Radiant buttons that log a mood straight from the notification. Settings: Me → Reminders.
> • **Face ID / Touch ID app lock:** Me → Privacy → App lock. The app then asks for Face ID (passcode fallback) on launch and after a minute in the background. The app switcher always shows a privacy cover instead of entries.
> • **Encrypted on-device storage:** everything is encrypted with AES-256-GCM. The key is kept in the Keychain (this device only). Data is excluded from iCloud backups.
> • **Photos, videos and voice notes** in the Comfort Room (My Corner → Comfort Room) use the system photo picker and the microphone.
> • **Export and delete:** Me → Privacy → Export my data (share sheet), and Me → Delete everything.
>
> No account or login is needed. The app contains no analytics or tracking, and makes no network requests.
> Crisis resources are on the Support tab ("Need help?").

## Google Play (Android) — quick list

- [ ] Upload key created and stored safely (never in the repo). Release AAB built from Android Studio.
- [ ] **Data safety form:** *No data collected* and *No data shared*. Data is encrypted. Users can request deletion in-app (Me → Delete everything).
- [ ] Target API level 36 (already set in `android/variables.gradle`).
- [ ] Notifications permission (Android 13+) is requested in context, not at launch.
- [ ] Privacy policy URL, content rating questionnaire, and Health apps declaration if prompted.
- [ ] Screenshots: phone (at least 2), 1080×1920 or larger; 7" and 10" tablet if you list tablets.
