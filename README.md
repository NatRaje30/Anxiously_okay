# Anxiously Okay

A private, on-device companion for anxious days. One codebase runs as:

- **iOS and Android apps** (Capacitor 8) — the web app is bundled inside the binary from `www/`. It never loads a website.
- **A browser build** (e.g. Netlify) — the same `www/` folder, with weaker browser-only storage (see below).

There are no accounts, no servers, no analytics, and nothing a person writes leaves their device.

---

## Quick start

Requirements: Node 20+, and for native builds Xcode 16+ (iOS 15+ target) and/or Android Studio (SDK 36).

```bash
npm install
npm run sync            # release build of www/ + npx cap sync
npx cap open ios        # opens Xcode — pick your team under Signing & Capabilities, then Run
npx cap open android    # opens Android Studio — Run
```

Other commands:

| Command | What it does |
|---|---|
| `npm run build:release` | Builds `www/` for release: **no developer tools are shipped**. |
| `npm run build:beta` | Ships developer tools, hidden until the version number in **Me** is tapped 7 times. |
| `npm run build:dev` | Ships developer tools with a visible 🛠 button. |
| `npm run sync:dev` | Dev build + `cap sync` with webview debugging enabled. |
| `npm test` | Unit tests for the notification planner (`computeNudges`). |
| `npm run serve` | Serves `www/` at http://localhost:8080 for browser testing. |
| `npm run assets` | Regenerates native icons and splash screens from `assets/`. |

Always run one of the `build:*` scripts before `npx cap sync` — it writes `www/js/capacitor.bundle.js` (the plugin bridge) and `www/js/build-flags.js`, and adds or removes `www/js/devtools.js`.

## Project layout

```
www/                    the app (bundled into the binary; also the Netlify publish folder)
  index.html            the app itself
  js/platform.js        one API for browser + Capacitor (storage, files, notifications, lock, haptics…)
  js/store.js           encrypted storage (AES-256-GCM)
  js/nudges.js          notification planner + rescheduleAll()
  assets/               local fonts (DM Sans, DM Serif Display) and Tabler icons — no CDNs
src/bridge.js           imports the Capacitor plugins; bundled by esbuild into www/js/capacitor.bundle.js
dev/devtools.js         developer tools (copied into www/ only for dev/beta builds)
scripts/build.mjs       build script (flavours)
test/                   unit tests (node --test)
ios/, android/          native projects
assets/                 source art for icons and splash (placeholders — see "Still needed")
docs/                   audit, privacy page, App Store and QA checklists
```

## Plugins

`@capacitor/local-notifications`, `preferences`, `filesystem`, `haptics`, `app`, `status-bar`, `splash-screen`, `share`, `camera` (installed as requested; the picker below is used because Camera can't pick videos), `@capawesome/capacitor-file-picker` (multi-select photos **and** videos), `@aparajita/capacitor-secure-storage` (Keychain / Keystore), `@aparajita/capacitor-biometric-auth` (Face ID / Touch ID / fingerprint with passcode fallback).

---

## Privacy and storage design

### What is encrypted

Everything a person writes or adds — mood history, vents, letters, worst-case entries, wins, affirmations, notes to self, songs, Comfort Room photos, video thumbnails, videos, voice notes, drawings, profile fields and reminder settings — is stored only as AES-256-GCM ciphertext.

| File (native: `Library/AnxiouslyOkay/` on iOS, app files dir on Android) | Contents |
|---|---|
| `state.enc` | `AOS2` + 12-byte random IV + ciphertext of `{schemaVersion, savedAt, data}` |
| `media/<id>` | `AOM1` + repeated `[length][12-byte IV][ciphertext]`, 1 MB per chunk (photos at max 1200 px, video thumbnails, full videos ≤ 50 MB, voice notes) |

Only small, non-personal flags go to Preferences (app lock on/off). Writes are atomic (write to a temp file, then rename).

### The approach chosen, and why

**Native: a random 256-bit data key in the Keychain / Keystore, with AES-256-GCM in the app.**
On first launch the app generates a key with `crypto.getRandomValues`, stores it with `@aparajita/capacitor-secure-storage` (iOS Keychain with *this-device-only* access and iCloud sync off; Android encrypted storage backed by the Keystore), and imports it into Web Crypto as a **non-extractable** key. Data is encrypted with AES-256-GCM before it is written with Filesystem.

Why not put the data itself in secure storage: the Keychain/Keystore are designed for small secrets, not megabytes of entries, photos and videos. Keeping one key there and the encrypted data in files gives the same protection, works with large media, and lets "Delete everything" destroy the data instantly by deleting the key. No key is ever hard-coded, logged or exported.

If encrypted data exists but its key is gone (e.g. the Keychain was reset), the app says so and offers to start fresh. It never silently writes new data over it.

### Browser build (weaker)

In a browser, the key is a **non-extractable** Web Crypto key kept in IndexedDB, and the ciphertext is also kept in IndexedDB. Script can't read the key's bytes, but anyone with access to the unlocked computer and browser profile can still open the app and see the entries, and browser storage can be cleared by the browser. **Browser storage is weaker than the native apps**; the native apps are the recommended way to use Anxiously Okay. If the browser blocks IndexedDB (some private modes and previews), nothing is kept and the app says so.

### Migration from the old plain-text storage

Earlier web versions kept everything in plain text in `localStorage` (`ao_s`). On first launch of this version the app reads it, moves photos and voice notes into encrypted files, writes the encrypted state, **reads everything back and verifies it**, and only then deletes the plain copy. If verification fails the plain copy is kept and the migration is retried on the next launch. `schemaVersion` is now `2`.

### Backups

- **iOS:** `Library/AnxiouslyOkay` is marked *excluded from backup* in `AppDelegate.swift`, so entries are not in iCloud or Finder backups. The Keychain item is *this device only*, so it does not move to another device either.
- **Android:** `allowBackup="false"` and `data_extraction_rules.xml` exclude everything from cloud backup and device-to-device transfer.

This means a lost or reset phone loses its entries. The app says this plainly in **Me**. An *encrypted backup* option could be added later; it is not part of this build.

### App lock and privacy screen

- **App lock** (Me → Privacy) is off by default. When on, Face ID / Touch ID / fingerprint (with the device passcode as fallback) is required on launch and after the app has been in the background for more than 1 minute. Notification taps that arrive while locked are queued and written after unlock. The lock is a gate in front of the app; the data is encrypted at rest whether or not it is on.
- **Privacy screen:** iOS covers the window with a cream "Anxiously Okay" image whenever the app leaves the foreground (`SceneDelegate.swift`), so the app switcher never shows entries. Android 13+ turns off the recents thumbnail; older Android versions show a cream cover (`MainActivity.java`). Screenshots inside the app stay allowed.

### Logging

App code never logs entry text. Release builds set Capacitor's `loggingBehavior` to `none` and turn webview debugging off.

---

## Reminders (local notifications)

All planning happens on the device in `www/js/nudges.js`. `rescheduleAll()` runs on app open, on resume, after any mood log, after settings change, when the app goes to the background, and when the time zone changes. It cancels everything it scheduled earlier and plans the next 14 days (never more than 60 pending; iOS allows 64).

Rules — **at most one notification per day, none in quiet hours** (default: 30 minutes after wind-down until 8am):

| Type | When |
|---|---|
| Pattern | Stormy or Heavy logged at a similar weekday and hour (±1 h) on at least 3 of the last 5 occurrences of that weekday → 35 minutes before that time, on that weekday, for the next two weeks. |
| Day after a rough day | A soft morning check-in (1 hour after quiet hours end) the day after a Stormy log. |
| Daily check-in | At the wind-down time ("When does your day usually wind down?", default 10pm). After ~10 timed logs, if most cluster around one time (±1 h), that time is used instead. Skipped today once today is logged. |
| Away | Day 3, day 7 and day 14 after the last time the app was opened, then nothing. |

**How "one per day" is resolved.** The spec lists daily check-in above "day after a rough day" and "away". Taken literally, those two would never fire while daily check-ins are on. So: the daily check-in is planned for the next **3 days after each open**; if the app isn't opened it backs off to the away schedule (days 3, 7, 14). On any single day the priority is **pattern → day after a rough day → daily check-in → away**. The day-after check-in rides on the "Evening check-in" toggle.

**Ignored three times → stops.** A scheduled nudge whose time has passed without the person tapping it (or one of its buttons) counts as ignored; three in a row stops that type. Turning the type off and on in Me resets it.

**Lock-screen copy** never names a mood, a weekday or a pattern, and rotates between three variants per type. The personal wording ("Sunday evenings have felt heavy lately…") only appears inside the app after opening a pattern nudge.

**Log from the notification:** 🌥️ Heavy, ⛅ Steady and 🌞 Radiant buttons write the mood with the time the button was tapped. The buttons open the app (iOS `foreground: true`) so the write always goes through the encrypted store, and through the lock if it is on.

**Permission** is never asked on first launch. Onboarding asks only for the wind-down time. After the first mood log, a short explanation is shown before the system prompt. If it is declined, Me shows a quiet "Turn on reminders in Settings" line, and the app never asks again by itself.

**Android timing:** the app does not request `SCHEDULE_EXACT_ALARM` (Google Play restricts it to alarm and calendar apps), so Android may deliver a reminder a few minutes late. That is fine for gentle check-ins.

## Developer tools

In dev builds (🛠 button) and beta builds (tap the version number in Me 7 times): fire a test nudge of any type in 10 seconds, seed history ("3 Heavy Sundays around 5pm", "No logs for 8 days", "Logs every morning at 8am for 2 weeks", "Stormy yesterday"), time-travel by days and hours, list pending notifications, preview the planner, and clear only the seeded entries. Release builds don't contain the file at all.

## Tests

`npm test` covers `computeNudges()`: pattern detected / not detected / ±1 h tolerance, quiet hours, the one-per-day cap and priority, day-after, usual-time detection, away nudges stopping after day 14 and being re-planned on reopen (with test nudges left alone), a DST change (America/New_York, 1 Nov 2026), a time zone change, the ignored-3-times rule, vague copy, variant rotation and the 60-pending cap.

---

## Still needed from the owner

- **Artwork:** `assets/icon-only.png`, `icon-foreground.png`, `icon-background.png`, `splash.png`, `splash-dark.png` and `ios/App/App/Assets.xcassets/PrivacyScreen.imageset/privacy-screen.png` are generated placeholders (`scripts/make-placeholder-art.py`). Replace them, then run `npm run assets`.
- **Apple Developer account and team** (signing in Xcode), **App Store Connect app record**, **Google Play Console** account and an upload key (never commit it).
- **A support URL and a hosted privacy policy URL** — `docs/privacy.html` is ready to host once reviewed.
- **Review of `PRIVACY.md` / `docs/privacy.html`** by someone qualified before submission.
- **Export compliance:** `ITSAppUsesNonExemptEncryption` is set to `false` on the basis that the app only uses standard encryption to protect the person's own data on their device. Confirm this applies to you.
- **First native build and device QA:** this repository was prepared without Xcode or the Android SDK, so the native projects have not been compiled yet. Do the first build and work through `docs/QA_CHECKLIST.md` on a real iPhone and a real Android phone.
