# plugin-browser

A local web UI for browsing Claude Code plugin marketplaces — official, added, and discovered.

## Features

- Browse all plugins from `claude-plugins-official`
- Filter by type: Anthropic · MCP · LSP · Installed · Updates · Added · Unmonitored · Discovered
- **Added tab** — shows plugins from all marketplaces you've explicitly added, grouped by marketplace with tag filters
- **Discovered tab** — auto-crawled plugins from GitHub Code Search, split into Established (5+ stars) and New/Unverified tiers, with keyword sub-filters
- **Updates tab** — installed plugins with newer commits available
- **Unmonitored tab** — installed plugins not tracked by any known registry
- Sort by popularity (install counts) or name
- Relative popularity bars with real install numbers
- One-click copy of `/plugin install` commands; two-step copy (marketplace add + install) for plugins whose marketplace isn't yet added
- Official plugins synced from local `~/.claude/plugins/` cache — no network needed for core data
- Fonts downloaded once on install and served locally

## Install via Claude Code

```
/plugin marketplace add devycelabs/claude-plugin-browser
/plugin install plugin-browser
```

Then use:
```
/plugin-browser
```

## Standalone usage (no plugin installation)

```bash
node server/index.js
# open http://localhost:3747
```

Or open `browser/index.html` directly — works offline with embedded fallback data.

## How it works

The plugin ships a combined server (`server/index.js`) that:
- Runs as an **MCP server** over stdio (Claude Code manages its lifecycle)
- Simultaneously serves the **browser UI** over HTTP on `localhost:3747`

On each request, the server reads live data from `~/.claude/plugins/` — no restart needed when marketplaces are added or plugins are installed. Click **⟳ Sync** in the browser to refresh.

When the MCP server isn't present, the skill prompts you to start the node server manually, or you can open the HTML file directly as a fallback.

## Skills

| Skill | Trigger | Purpose |
|-------|---------|---------|
| `plugin-browser` | "open plugin browser", `/plugin-browser` | Opens the browser UI |
| `plugin-browser-setup` | "set up plugin browser", `/plugin-browser:setup` | Guided post-install configuration |

## Hooks

**SessionStart** — runs `server/setup-check.js` on every session start. Checks if the server is reachable; prints one-time setup instructions if not. Downloads fonts on first run. Kills any stale server process so updated code always takes effect.

## Structure

```
plugin-browser/
├── .claude-plugin/
│   ├── plugin.json           ← plugin manifest
│   ├── marketplace.json      ← marketplace listing
│   └── mcp.json              ← MCP server config
├── browser/
│   └── index.html            ← the web UI
├── hooks/
│   └── hooks.json            ← SessionStart hook
├── server/
│   ├── index.js              ← combined MCP + HTTP server
│   ├── fonts.js              ← one-time font download
│   └── setup-check.js        ← SessionStart hook script
├── skills/
│   ├── plugin-browser/
│   │   └── SKILL.md          ← /plugin-browser skill
│   └── plugin-browser-setup/
│       └── SKILL.md          ← /plugin-browser:setup skill
├── LICENSE
├── PRIVACY.md
└── README.md
```
