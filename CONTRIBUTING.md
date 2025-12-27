# Contributing to MCP Adversarial Suite

Thanks for your interest in contributing! This project simulates adversarial MCP behaviors for **defensive benchmarking only**.

## Ground Rules

### No Real Exploitability

All contributions must maintain the **safe-by-design** principle:

| ❌ Never | ✅ Always |
|----------|----------|
| Import `fs` for real file access | Use in-memory `VirtualFS` dictionaries |
| Import `child_process` for execution | Return stub responses like `{ note: "disabled" }` |
| Import `http`/`https`/`net` for network | Return `"blocked_by_design"` for trap resources |
| Access real system resources | Seed virtual data via `SCENARIO_SEED_JSON` |

**If your change introduces real filesystem, network, or OS access, it will be rejected.**

## Adding a New Server

### 1. Create the Server Directory

```bash
mkdir -p servers/your-server/{src,test}
```

### 2. Required Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Main server implementation |
| `README.md` | Usage, env vars, threat model |
| `package.json` | npm package config |
| `tsconfig.json` | TypeScript config (extend `../../tsconfig.base.json`) |
| `test/smoke.mjs` | Smoke test (see below) |

### 3. Safety Constraints

Your server implementation **must**:

- Use stdio JSON-RPC (stdin/stdout, JSONL logs to stderr)
- Use an in-memory virtual filesystem, not real `fs`
- Never execute real commands (stub all "dangerous" tools)
- Be deterministic when seeded with `SEED` or `SCENARIO_SEED_JSON`
- Log events as structured JSONL to stderr

### 4. Required Smoke Test Pattern

Every server needs `test/smoke.mjs`:

```javascript
#!/usr/bin/env node
import { spawn } from "child_process";
import { createInterface } from "readline";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "..", "dist", "index.js");

// Spawn server, send JSON-RPC requests, verify responses
// See existing smoke tests for full examples
```

Test should verify:
- Server initializes correctly
- Tools/resources are advertised as expected
- Adversarial behavior triggers as configured
- JSONL logs contain expected events
- All dangerous operations return safe stubs

Run with: `node servers/your-server/test/smoke.mjs`

## Scenario Files

Scenarios are declarative test definitions in `scenarios/`.

### Schema

```yaml
name: scenario_name
description: |
  Multi-line description of what this scenario tests.

server:
  name: server-name
  command: node
  args: ["servers/server-name/dist/index.js"]
  env:
    ENV_VAR: "value"

test_sequence:
  - step: step_name
    method: tools/list
    expect:
      success: true
      tool_count: 2

expected_outcome:
  direct_mode: FAIL   # Attack should succeed without proxy
  proxy_mode: PASS    # Proxy should block the attack

detection_criteria:
  - type: criteria_type
    description: "What to look for"
```

### Naming Convention

- Prefix with number: `07_your_scenario.yaml`
- Use lowercase with underscores

## Pull Request Checklist

- [ ] No real filesystem/network/execution
- [ ] Smoke test included and passing
- [ ] README documents threat model and env vars
- [ ] JSONL logging follows existing patterns
- [ ] TypeScript compiles without errors
- [ ] Deterministic when seeded

## Code Style

- TypeScript for servers
- ESM for test scripts (`.mjs`)
- Structured JSONL logging (timestamp, event, request_id_seen, internal_id)
- Environment variables for configuration

## Questions?

Open an issue for discussion before large changes.
