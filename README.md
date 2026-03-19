# plugin-browser

A local web UI for browsing the official Claude Code plugin marketplace.

## Features
- Browse all plugins from `claude-plugins-official`
- Filter by type: Anthropic · MCP · LSP · Installed
- Sort by popularity (install counts) or name
- Relative popularity bars with real install numbers
- One-click copy of `/plugin install` commands
- Official plugins synced from local `~/.claude/plugins/` cache
- Community plugins fetched live from [claude-plugins-community](https://github.com/devycelabs/claude-plugins-community)
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

When the MCP server isn't present, the skill prompts you to start the node server manually, or you can open the HTML file directly as a fallback.

## Skills

| Skill | Trigger | Purpose |
|-------|---------|---------|
| `plugin-browser` | "open plugin browser", `/plugin-browser` | Opens the browser UI |
| `plugin-browser-setup` | "set up plugin browser", `/plugin-browser:setup` | Guided post-install configuration |

## Hooks

**SessionStart** — runs `server/setup-check.js` on every session start. Checks if the server is reachable; prints one-time setup instructions if not. Downloads fonts on first run.

## Structure

```
plugin-browser/
├── .claude-plugin/
│   ├── plugin.json           ← plugin manifest
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
├── marketplace.json          ← for claude plugin marketplace add
└── README.md
```
