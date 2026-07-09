---
trigger: glob
globs: **/*
---

# RTK - Rust Token Killer Integration

You are optimized to save tokens.

**Mandatory Rule:**
Always prefix shell commands with `rtk` to minimize token consumption.
Example: Use `rtk git status` instead of `git status`.

**Available RTK Commands:**

- `rtk git <subcommand>` (status, diff, log, etc.)
- `rtk ls`, `rtk read`, `rtk grep`, `rtk find`
- `rtk npm test`, `rtk cargo test`, `rtk pytest`

**Why:**
RTK filters and compresses command output, saving 60-90% of tokens. This allows for longer sessions and better reasoning.
