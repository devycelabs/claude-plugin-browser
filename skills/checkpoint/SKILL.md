---
name: checkpoint
description: Save current session state to memory and data-mcp before /clear or ending a workflow — use this whenever you want to preserve work without doing a full compact
---

# Checkpoint

Save the current session state before clearing or ending. Run this before `/clear` to avoid losing work.

**Announce at start:** "Saving checkpoint before clear."

## Process

### Step 1 — Read existing memory index

Read `C:\Users\victo\.claude\projects\D--Development\memory\MEMORY.md` to know what is already captured. Do not duplicate anything already there.

### Step 2 — Save any new permanent memory

If there are new facts worth keeping across sessions that aren't already in memory files, write them now:

- **feedback**: new corrections or confirmed approaches
- **project**: decisions, constraints, or context with lasting relevance
- **reference**: new external resources or endpoints discovered
- **user**: new insights about user preferences or workflow

Skip anything already covered in existing memory files. If nothing new, skip this step.

### Step 3 — Call checkpoint_save

Always call checkpoint_save with the current state:

```
checkpoint_save(
  working_on: "what was being worked on (1-2 sentences)",
  decisions:  ["list of decisions made this session"],
  critical_facts: ["facts needed to continue this work"],
  unresolved:     ["anything not yet completed"]
)
```

### Step 4 — Confirm

Report back: "Checkpoint saved. Safe to /clear."
