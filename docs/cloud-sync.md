<!-- written by Claude Fable 5 · 2026-08-28 -->

# Cloud sync

> as-of v0.11.44 · 2026-08-28

WeebPaint syncs artworks through the signed-in user's own OneDrive. There is no WeebPaint server.

## Current status (2026-08-28): new sign-ins are blocked by a OneDrive-side fault

Newly granted authorizations fail: every OneDrive request returns 403 `serviceReadOnly`. Authorizations granted months ago keep working, which is why the app looks fine on devices that signed in earlier.

What was tested (2026-08-23/24, same machine, personal Microsoft accounts):

- Same account, same code, six minutes apart: an app authorized months ago got 200 with full read/write; a freshly authorized app got 403 on every endpoint (app folder, drive root, `/me/drive`).
- The failure sequence on a fresh grant is `404 itemNotFound` → `503 itemDisabledDueToPendingProvisioning` → permanent 403 — which looks like a one-time per-app provisioning step that the `Files.ReadWrite.AppFolder` consent path currently skips.
- A clean app-folder-only authorization made on 2026-08-24 failed the same way, so re-authorizing does not help; another grant was still failing 26 hours after it was made, so waiting does not heal a broken grant.
- Granting the broader `Files.ReadWrite` scope once provisions the folder, and the fix persists after that scope is revoked. WeebPaint does not use this workaround: it would mean asking every new user for full-drive access, and this app is app-folder-only by design.

We reported it: [Microsoft Q&A 5983388](https://learn.microsoft.com/en-us/answers/questions/5983388/personal-onedrive-newly-consented-apps-get-403-acc). As of 2026-08-28 the thread has two independent reproductions (2026-08-26 and 2026-08-27, one calling it a recent regression) and no Microsoft response. Related reports: [Microsoft Q&A 5982450](https://learn.microsoft.com/en-us/answers/questions/5982450/onedrive-account-returning-accessdenied-servicerea), where a Microsoft moderator attributes the 403s to a Graph service-side problem, and [rclone#9794](https://github.com/rclone/rclone/issues/9794).

Consequence: signing in works, but a new user's drive access does not. Until this clears, use the app without signing in — local storage, PWA offline mode, and .ora export / import are unaffected. This page will be updated when the situation changes.

## What sync does

- Sign in with a personal Microsoft account. Work / school accounts are not supported.
- Scope: `Files.ReadWrite.AppFolder` only. The app can read and write `Apps/WeebPaint/` in your OneDrive and nothing else. It never asks for full-drive access.
- Pull: cloud changes are fetched automatically — on window focus, on reconnect, and periodically while the gallery is open.
- Push: local changes upload when you save (`Ctrl+S` or the save button) and when you leave an artwork.
- Conflicts: uploads are conditional (`If-Match`), so a change made on another device is never silently overwritten. If both sides changed, a panel asks which side to keep, and the replaced version is kept as a backup.

## Encryption

- Optional and per artwork: set a password on an artwork in the gallery.
- An encrypted artwork is stored as an encrypted container both locally and in the cloud; plaintext is not written to persistent storage.
- The password is held in memory only — closing the tab forgets it; it is never uploaded or saved. A forgotten password cannot be recovered.
- Artworks without a password are stored unencrypted in your own OneDrive.

## Sync on your own deployment

The stock client id only works on weebpaint.com. See [onedrive-client-id.md](onedrive-client-id.md).
