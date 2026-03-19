# plugin-browser

A local web UI for browsing the official Claude Code plugin marketplace.

## Features
- Browse all 43+ plugins from `claude-plugins-official`
- Filter by type: Anthropic · MCP · LSP · Installed
- Sort by popularity (install counts) or name
- Relative popularity bars with real install numbers
- One-click copy of `/plugin install` commands
- Live sync from `~/.claude/plugins/` — no network required

## Install via Claude Code

```
/plugin marketplace add your-username/plugin-browser
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

## Structure

```
plugin-browser/
├── .claude-plugin/
│   ├── plugin.json       ← plugin manifest
│   └── mcp.json          ← MCP server config
├── browser/
│   └── index.html        ← the web UI
├── server/
│   └── index.js          ← combined MCP + HTTP server
├── skills/
│   └── plugin-browser/
│       └── SKILL.md      ← /plugin-browser skill
└── README.md
```
