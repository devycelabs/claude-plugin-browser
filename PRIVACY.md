# Privacy Policy

**Plugin Browser** — by [Devyce Labs](https://github.com/devycelabs)

---

## Summary

This tool collects **no personal data**. It makes limited external requests for community plugins, update checks, and a one-time font download — none of which transmit personal information.

---

## What this tool does

- Reads plugin metadata from your local `~/.claude/plugins/` directory
- Reads install counts and installed plugin lists from your local Claude Code cache
- Serves this data over HTTP on `127.0.0.1` (localhost only — not exposed to your network)
- Fetches the community plugin registry from GitHub (`devycelabs/claude-plugins-community`)
- Checks installed plugin update status via the GitHub API (per-plugin commit history)

## What this tool does NOT do

- Collect, store, or transmit any personal information
- Track usage, clicks, or behaviour
- Set cookies or use any form of analytics
- Access any files outside of `~/.claude/plugins/` and its own plugin data directory

## External network requests

| Request | When | What's sent |
|---------|------|-------------|
| GitHub API — community registry | On page load (cached 24h) | None — public repo read |
| GitHub API — update check | On page load (cached 1h) | None — public repo read |
| Google Fonts — font download | First `SessionStart` only | None — public CDN read |

No authentication tokens, user identifiers, or personal data are sent in any of these requests.

## One-time network request (font download)

On first setup (`SessionStart` hook), the tool downloads font files (Syne, JetBrains Mono, Outfit) from **Google Fonts** (`fonts.googleapis.com` / `fonts.gstatic.com`) and caches them locally. After that, fonts are served from your machine — no further CDN requests are made.

If you prefer to skip this, you can delete the fonts cache directory (`~/.claude/plugins/data/plugin-browser/fonts/`) and the browser will fall back to system fonts.

## Deep Sync

The optional **Update** button invokes the `claude` CLI (`claude plugin marketplace update`) locally on your machine. No data is sent by this plugin — the CLI handles its own network communication with the Claude Code marketplace under Anthropic's own terms.

## Open source

This project is fully open source (MIT). You can inspect every line of code at:
[github.com/devycelabs/claude-plugin-browser](https://github.com/devycelabs/claude-plugin-browser)

---

*Last updated: March 2026*
