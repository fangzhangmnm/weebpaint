<!-- written by Claude Fable 5 · 2026-08-28 -->

# OneDrive sync on your own deployment

> as-of v0.11.44 · 2026-08-28

The stock client id in `src/config.ts` is registered for the weebpaint.com URLs (site root and `/dev/`) and the project's own github.io mirrors. Any other origin — your own domain, or localhost — needs your own app registration. Registration is free.

Note: newly granted app-folder authorizations are currently rejected by a OneDrive-side fault; see [cloud-sync.md](cloud-sync.md). A new registration will authenticate, but drive requests may return 403 until Microsoft fixes provisioning.

1. Go to https://portal.azure.com → Microsoft Entra ID → App registrations → **New registration**.
2. Supported account types: **Personal Microsoft accounts**. (The app signs in with a `/consumers` authority; work / school accounts are not supported.)
3. Under Authentication, add a **Single-page application** redirect URI: the exact URL your copy is served from, e.g. `https://yourname.github.io/weebpaint/` or `http://localhost:8000/`.
4. Copy the **Application (client) ID**.
5. In `src/config.ts`, set `CLIENT_ID` to your id (adjust any redirect-URI values in that file to your URL), then rebuild.

The app requests only the `Files.ReadWrite.AppFolder` scope: it can read and write `Apps/WeebPaint/` in the signed-in user's OneDrive and nothing else in the drive.
