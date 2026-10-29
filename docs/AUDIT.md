# Phase 0 audit — platform APIs and remote dependencies

Audited against `www/index.html` at commit `55fb37c` (before the Capacitor work).

## Browser APIs the app touches, and what each becomes

| API / pattern | Where it was used | Becomes |
|---|---|---|
| `localStorage` (`ao_s`) | `aoPersist`, `loadS`, `logout`, `persistVoice` — all app data incl. photos/voices as data URLs | **Encrypted store** (`js/store.js`): AES‑256‑GCM ciphertext in **Filesystem** (native) or **IndexedDB** (browser). Old `ao_s` is migrated once, verified, then deleted. |
| `localStorage` (small flags) | — | **Preferences** (native) / `localStorage` (browser) via `platform.storage`, only for non-personal flags (app lock on/off, last time zone). |
| `sessionStorage` | not used | unchanged (still not used) |
| `IndexedDB` | not used | Browser fallback for the encrypted store and its non-extractable key |
| `URL.createObjectURL` / `revokeObjectURL` | video playback cache in Comfort Room | unchanged API, but now fed from decrypted media files (`AOMedia`), so videos persist |
| Photo/voice data URLs inside state | `S.crPhotos[].url`, `S.crVoices[].data` | **Filesystem** (native) / IndexedDB (browser): one encrypted file per photo, thumbnail, video and voice note; state keeps only an id |
| `Notification` + `setInterval(checkDailyNotif)` | daily reminder, "3 tough days" message | **@capacitor/local-notifications** via `platform.notify` + `js/nudges.js` (`rescheduleAll`). `checkDailyNotif` removed. Browser: best-effort `Notification` while the page is open. |
| `navigator.mediaDevices.getUserMedia` + `MediaRecorder` | Voices recording | unchanged (WKWebView / Android WebView support it); native permission strings added |
| `<input type="file">` (photos/videos) | Comfort Room Memories | **@capawesome/capacitor-file-picker** `pickMedia` on native (multi-select, images + videos); same `<label>`+`<input>` in the browser |
| `<input type="file">` (audio) | Voices upload | unchanged (works in both webviews) |
| `alert()` | 2× speech-recognition fallback | in-app warm overlay (`aoAlert`) |
| `confirm()` / `prompt()` | not used | — |
| `webkitSpeechRecognition` | vent/letters dictation | unchanged (falls back to the in-app message where unsupported) |
| `console.*` | none in app code | none added; store/notification code never logs entry text |

## Remote dependencies

| Dependency | Before | After |
|---|---|---|
| Google Fonts (DM Sans 400/500, DM Serif Display 400 + italic) | `fonts.googleapis.com` | `www/assets/fonts/*.woff2` + `www/assets/fonts.css` (from `@fontsource`, OFL‑1.1) |
| Tabler icons webfont 2.44.0 | `cdn.jsdelivr.net` | `www/assets/tabler/` (MIT) |
| Song / crisis links | user-entered links, `tel:` links | unchanged — they only open when the person taps them |

After the change `www/` makes **no network requests on load**.

## Analytics, ads, tracking

None found: no analytics, ad, crash-reporting or tracking SDKs, no beacons, no remote scripts. None were added.
