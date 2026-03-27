# Claude Scout

A local web UI for browsing Claude Code plugin marketplaces — official, community-added, and discovered.

**[Browse plugins without installing →](https://devycelabs.github.io/claude-scout/)**

---

## Features

- Browse all plugins from `claude-plugins-official` (Anthropic, MCP, LSP tabs)
- **Installed tab** — shows your currently installed plugins
- **Added tab** — plugins from any marketplace you've explicitly added, grouped by marketplace with tag filters
- **Discovered tab** — auto-crawled plugins from GitHub Code Search, updated twice weekly; three tiers based on star count:
  - **Established** (≥25 ★) — proven community adoption
  - **Founding** (5–24 ★) — growing projects
  - **New & Unverified** (<5 ★) — early-stage plugins
- **Tools tab** — MCP tool-focused plugins
- **Unmonitored tab** — installed plugins not tracked by any known registry
- Sort by popularity (install counts) or name
- Proportional popularity bars with real install numbers
- One-click copy of `/plugin install` commands; two-step copy for plugins whose marketplace isn't yet added
- Live reads from `~/.claude/plugins/` — no restart needed when marketplaces change; click **⟳ Sync** to refresh
- Fonts downloaded once on install and served locally — works offline

## Web Version

Browse official and discovered plugins without installing anything:

**[devycelabs.github.io/claude-scout](https://devycelabs.github.io/claude-scout/)**

Includes Official, Discovered, and Tools tabs. Install commands visible for easy copy-paste into Claude Code.

## Install via Claude Code

```
/plugin marketplace add devycelabs/claude-scout
/plugin install claude-scout
```

Then open the local UI:
```
/plugin-browser
```

## Requirements

**Node.js 18 or later** on your system PATH. No npm install or build step — the server uses only Node.js built-in modules.

## Standalone usage

```bash
node server/index.js
# open http://localhost:3747
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PLUGIN_BROWSER_PORT` | `3747` | HTTP port for the browser UI |
| `PLUGIN_BROWSER_DEV` | _(unset)_ | Set to `1` for dev mode (serves `browser/index.html` from disk on every request) |
| `CLAUDE_PLUGIN_DATA` | `~/.claude/plugins/data/claude-scout` | Override the data/cache directory |

## How it works

`server/index.js` runs as both an **MCP server** over stdio (Claude Code manages lifecycle) and an **HTTP server** on `localhost:3747`. On each request it reads live data from `~/.claude/plugins/` — no restart needed.

## Skills

| Skill | Trigger | Purpose |
|-------|---------|---------|
| `plugin-browser` | "open plugin browser", `/plugin-browser` | Opens the local browser UI |
| `plugin-browser-setup` | "set up plugin browser", `/plugin-browser:setup` | Guided post-install configuration |

## Hooks

**SessionStart** — runs `server/setup-check.js` on every session start. Checks if the server is reachable, prints one-time setup instructions if not, downloads fonts on first run, and kills any stale server process so updated code takes effect immediately.

## Structure

```
claude-scout/
├── .claude-plugin/
│   ├── plugin.json           ← plugin manifest
│   ├── marketplace.json      ← marketplace listing
│   └── mcp.json              ← MCP server config
├── browser/
│   └── index.html            ← the web UI (single file)
├── docs/
│   └── index.html            ← GH Pages hosted version
├── hooks/
│   └── hooks.json            ← SessionStart hook
├── server/
│   ├── index.js              ← combined MCP + HTTP server
│   ├── fonts.js              ← one-time font download
│   └── setup-check.js        ← SessionStart hook script
├── skills/
│   ├── plugin-browser/
│   │   └── SKILL.md
│   └── plugin-browser-setup/
│       └── SKILL.md
├── LICENSE
├── PRIVACY.md
└── README.md
```
