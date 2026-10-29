# Manual QA checklist

Run on a **real iPhone** and a **real Android phone**, using a **beta** build for the test-tool steps (`npm run build:beta && npx cap sync`, then tap the version number in Me 7 times) and a **release** build for the final pass.

Legend: ☐ iPhone ☐ Android

## Offline and resources
- [ ] ☐ ☐ Turn on airplane mode, force-quit, open the app. Fonts (DM Sans / DM Serif Display) and icons all appear; every screen works.
- [ ] ☐ ☐ No permission prompt at first launch.

## Encrypted storage
- [ ] ☐ ☐ Write a vent, a letter, a worst-case entry, a win and an affirmation containing a unique word (e.g. `PLUMTREE`).
- [ ] ☐ iPhone: Xcode → Window → Devices → download the app container → search `Library/AnxiouslyOkay` and the whole container for `PLUMTREE`: **not found**. Files start with `AOS2` / `AOM1` and the rest is unreadable.
- [ ] ☐ Android: `adb shell run-as com.anxiouslyokay.app` (debuggable build) → `grep -r PLUMTREE files/ shared_prefs/ app_webview/` finds **nothing**.
- [ ] ☐ ☐ Preferences / shared_prefs contain no entry text (only the app-lock flag).

## Migration from the old web version
- [ ] Browser: open the old Netlify build, add entries + a photo + a voice note, then deploy this build to the same address and reload. Everything is still there; DevTools → Application → Local Storage has **no** `ao_s`; IndexedDB `anxiously-okay` holds only binary data.

## Photos, videos, voice notes
- [ ] ☐ ☐ Comfort Room → Memories → add 3 photos at once → "Added 3 memories."
- [ ] ☐ ☐ Add a video (under 50 MB) → thumbnail appears; tap it → it plays.
- [ ] ☐ ☐ Add a video over 50 MB → clear message, nothing added.
- [ ] ☐ ☐ Voices → Record (allow the microphone) → stop → "Saved …".
- [ ] ☐ ☐ **Force-quit and relaunch:** the photos, the video (plays) and the voice note (plays) are all still there.

## App lock and privacy screen
- [ ] ☐ ☐ Me → Privacy → App lock → confirm with Face ID / fingerprint → on.
- [ ] ☐ ☐ Force-quit and open: lock screen; Face ID required; Cancel keeps it locked; passcode fallback works.
- [ ] ☐ ☐ Background the app for **under** a minute → no lock. **Over** a minute → lock.
- [ ] ☐ ☐ App switcher (swipe up and hold / recents) shows only the cream privacy cover, never entries — with the lock on **and** off.
- [ ] ☐ ☐ Screenshots inside the app still work.

## Notifications
- [ ] ☐ ☐ Log a first mood → the in-app explanation appears → "Yes, remind me" → system prompt.
- [ ] ☐ ☐ Developer tools → Fire a test nudge (each type) → lock the phone → it arrives in about 10 seconds (Android may take a little longer: no exact-alarm permission).
- [ ] ☐ ☐ Lock-screen text never names a mood, a day or a pattern.
- [ ] ☐ ☐ Long-press / expand the notification → tap **🌥️ Heavy** → the app opens on Mood and the week dots show Heavy at the time you tapped (check in Developer tools → Planner preview or the week view).
- [ ] ☐ ☐ With App lock on, tap a mood button on a notification → unlock → the mood is saved after unlocking.
- [ ] ☐ ☐ Seed "3 Heavy Sundays around 5pm" → Show pending notifications → a **pattern** nudge next Sunday at about **4:25pm**.
- [ ] ☐ ☐ Open that pattern nudge from the notification → the Mood screen shows "Sunday evenings have felt heavy lately…" (only in the app).
- [ ] ☐ ☐ Pending list never has two on the same date, and none inside quiet hours (change quiet hours in Me and re-check).
- [ ] ☐ ☐ Seed "No logs for 8 days" (moves the clock) → pending shows away nudges only on days 3, 7 and 14 from now → reset time travel and reopen → they are re-planned from the new open.
- [ ] ☐ ☐ Me → Reminders: toggles, wind-down time and quiet hours each change the pending list.
- [ ] ☐ ☐ Deny notifications in system Settings → Me shows "Turn on reminders in Settings" and the app never asks again by itself.
- [ ] ☐ ☐ Change the phone's time zone → reopen → pending times move to the new local clock (wind-down still at, e.g., 10pm).
- [ ] ☐ ☐ "Clear all test data" removes only seeded moods.

## Export and delete
- [ ] ☐ ☐ Me → Privacy → Export my data → share sheet with a `.json` file; it lists photos/voices by reference only (no image or audio data inside).
- [ ] ☐ ☐ Me → Delete everything → confirm → back to the welcome screen. Then check:
  - [ ] data folder is empty (container download / `run-as`),
  - [ ] pending notifications: none (Developer tools in a beta build, or wait past a planned time),
  - [ ] the Keychain / Keystore key is gone — a fresh key is created on next use (relaunch works and starts empty).
- [ ] ☐ ☐ "Log out" leads to the same Delete everything confirmation (there are no accounts).

## Release build
- [ ] ☐ ☐ `npm run sync` (release): no 🛠 button; tapping the version number 7 times does nothing; `www/js/devtools.js` is absent.
- [ ] ☐ ☐ Safari Web Inspector / chrome://inspect cannot attach (release).
- [ ] ☐ ☐ "Not a replacement for a therapist or doctor" is visible in Me → About, and crisis lines are on Support → "Need help?".

## Unchanged behaviour (regression)
- [ ] ☐ ☐ SOS / Support breathing, crisis overlay, toolkit; all games; Wins; Letters (release animation); Worst Case Scenario (balloon); Comfort Room visuals and decorations; onboarding flow.
