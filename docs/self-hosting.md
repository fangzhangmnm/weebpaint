<!-- written by Claude Fable 5 · 2026-08-28 -->

# Self-hosting

> as-of v0.11.44 · 2026-08-28

WeebPaint is a static site with no backend. Hosting a copy means serving the repository files.

## Build

Prerequisites: git and Node.js.

```bash
git clone https://github.com/fangzhangmnm/weebpaint.git
cd weebpaint
npm install
bash scripts/build.sh
```

`npm install` installs two local packages from `vendor-pkgs/*.tgz` plus dev tooling (TypeScript, Playwright). `scripts/build.sh` downloads a standalone esbuild binary into `tools/esbuild/` on first run, type-checks, bundles `src/` into `dist/`, and points `index.html` at the new bundle. Third-party runtime libraries are vendored in `vendor/`; nothing is loaded from a CDN at runtime.

## Run locally

Serve the repository root with any static file server, for example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/`. The repository root is the complete site: `index.html`, `dist/`, `vendor/`, the icons, and a few json files.

OneDrive sign-in on a local build needs your own app registration — see [onedrive-client-id.md](onedrive-client-id.md). Everything except sync works without signing in.

## Deploy

Copy the repository root to any static host: GitHub Pages, Cloudflare Pages, your own nginx, etc.

This repository's GitHub Actions workflow (`.github/workflows/deploy.yml`) publishes branch `prod` to the site root and branch `main` to `/dev/` on GitHub Pages.

## Single-file build

`bash scripts/build-standalone.sh` produces `dist/weebpaint-standalone.html`, a self-contained file that runs from a double-click with no server. Opened from `file://`, it cannot sign in to OneDrive — Azure does not accept `file://` redirect URIs — so the single-file build is local-only.

## Branches

- `main` — development; deployed to `/dev/`. A working area: sometimes deliberately broken mid-change, and it shares local data and the OneDrive folder with the release channel. Not a user-facing nightly channel.
- `prod` — stable; deployed to the site root.
