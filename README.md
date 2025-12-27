# MCP Adversarial Suite

> ⚠️ **DEFENSIVE BENCHMARK ONLY**  
> This repo simulates adversarial MCP behaviors to evaluate defenses (proxies, allowlists, drift detection).  
> It performs **no real exploitation**: no OS commands, no network calls, no real filesystem access.  
> All "sensitive" data is synthetic/watermarked and all "dangerous" tools are stubs or blocked-by-design.

A defensive red-team benchmark pack for MCP hosts, tool-calling models, and runtime proxies like [MCPTrust](https://github.com/mcptrust/mcptrust). This suite provides adversarial MCP servers that simulate real-world failure modes, enabling security testing and evaluation of MCP implementations.

[![MCP Adversarial Suite](https://github.com/mcptrust/mcp-adversarial-suite/actions/workflows/suite.yml/badge.svg)](https://github.com/mcptrust/mcp-adversarial-suite/actions/workflows/suite.yml)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

> ✅ **Verified with MCPTrust v0.1.2**: Blocks tool drift (DriftLab) and Unicode confusables (Homoglyph). See [proof](docs/mcptrust-verification.md).

## Threat Coverage

| Server | Attack Vector | What It Tests | Expected Outcome |
|--------|--------------|---------------|------------------|
| **DriftLab** | Tool/schema drift | Detection of tools added or schemas expanded after initial approval | Proxy blocks drifted tools |
| **Homoglyph Forge** | Unicode confusables | Detection of visually similar but different tool names (e.g., Cyrillic 'і' vs Latin 'i') | Proxy normalizes/rejects homoglyphs |
| **SpoofBox** | Protocol spoofing | Handling of duplicate, unsolicited, and wrong-ID responses | Proxy filters protocol violations |
| **Resource Trap** | Path traversal/SSRF | Validation of resource URIs, blocking of traversal and SSRF attempts | Proxy should block/allowlist resources (gap highlighted in MCPTrust verification) |
| **InsecureFS** | Sensitive file access | Detection of passwd/SSH key access attempts and path traversal | Server blocks (synthetic/blocked-by-design); works cleanly through proxy (defense-in-depth) |

## Quick Start

### Prerequisites

- Node.js 18+
- npm 9+
- (Optional) MCPTrust for proxy mode testing

### Installation

```bash
git clone https://github.com/mcptrust/mcp-adversarial-suite.git
cd mcp-adversarial-suite
npm install
npm run build
```

### Running Individual Servers

Each server is a standalone MCP server using stdio JSON-RPC:

```bash
# DriftLab - adds tools after N calls
DRIFT_AFTER=3 DRIFT_TYPE=add_tool node servers/driftlab/dist/index.js

# Homoglyph Forge - Unicode spoofed tool names  
HOMOGLYPH_TOOLS=all node servers/homoglyph-forge/dist/index.js

# SpoofBox - duplicate/unsolicited responses
SPOOF_RATE=50 SPOOF_TYPE=random node servers/spoofbox/dist/index.js

# Resource Trap - path traversal resources
TRAP_TYPE=all node servers/resource-trap/dist/index.js
```

### Running via MCPTrust Proxy

```bash
# Lock baseline tools first
mcptrust lock --v3 -- node servers/driftlab/dist/index.js

# Run through proxy (blocks drift)
mcptrust proxy --lock mcp-lock.json -- node servers/driftlab/dist/index.js
```

### Running the Scorecard

```bash
# Run all tests in direct mode
./scripts/run_scorecard.sh --direct-only

# Run all tests in both modes (requires MCPTrust)
./scripts/run_scorecard.sh

# Test specific server
./scripts/run_scorecard.sh --server driftlab
```

## Scorecard Output

```
════════════════════════════════════════════════════════════
  MCP Adversarial Suite - Scorecard Runner
════════════════════════════════════════════════════════════

[INFO] Building servers...
[INFO] Testing driftlab in direct mode...
[FAIL] driftlab (direct): Drift detected - new tools added
[INFO] Testing driftlab in proxy mode...
[PASS] driftlab (proxy): No unexpected drift

════════════════════════════════════════════════════════════
  SCORECARD
════════════════════════════════════════════════════════════

SERVER               DIRECT       PROXY
-------------------- ------------ ------------
driftlab             FAIL         PASS
homoglyph-forge      FAIL         PASS
spoofbox             FAIL         PASS
resource-trap        FAIL         PASS
insecurefs           PASS         PASS

SUMMARY
Direct Mode: 1 PASS / 4 FAIL
Proxy Mode:  5 PASS / 0 FAIL
```

> **Note**: FAIL in direct mode is *expected* — it shows the attack is working. PASS in proxy mode validates that the security proxy correctly blocks the attack.

## Server Configuration

All servers support configuration via environment variables:

### DriftLab
| Variable | Default | Description |
|----------|---------|-------------|
| `DRIFT_AFTER` | `5` | Drift trigger threshold (seconds or calls) |
| `DRIFT_MODE` | `calls` | `time` or `calls` |
| `DRIFT_TYPE` | `add_tool` | `add_tool`, `expand_schema`, or `both` |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |

### Homoglyph Forge
| Variable | Default | Description |
|----------|---------|-------------|
| `HOMOGLYPH_TOOLS` | `all` | Comma-separated list or `all` |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |

### SpoofBox
| Variable | Default | Description |
|----------|---------|-------------|
| `SPOOF_RATE` | `50` | Probability (0-100) of spoofing |
| `SPOOF_TYPE` | `random` | `duplicate`, `unsolicited`, `wrong_id`, `random` |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |

### Resource Trap
| Variable | Default | Description |
|----------|---------|-------------|
| `TRAP_TYPE` | `all` | `traversal`, `expansion`, `redirect`, `all` |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |

## DeepFabric Integration

This suite includes configuration stubs for [DeepFabric](https://deepfabric.ai) integration, enabling:

- Adversarial trace generation for training data
- Model safety evaluation  
- Tool-calling robustness benchmarking

See [deepfabric/README.md](deepfabric/README.md) for setup instructions.

## Security Best Practices

This suite is designed to test adherence to MCP security best practices:

### Allowlisting & Deny-by-Default

Tool gateways should use **allowlisting** (explicit approval) rather than denylisting:

- Only permit tools that were explicitly approved at initialization
- Re-validate tool schemas on every call
- Alert on any drift from the approved baseline

### Drift Detection

Schema drift is a critical attack vector:

- Track tool definitions at initialization
- Detect additions, removals, and schema changes
- Block or re-prompt on any detected drift

### SSRF Defense

Resource URI validation must be robust:

- **Allowlist approved schemes and hosts** (not denylist)
- **Validate resolved IPs** (both IPv4 and IPv6)
- **Block private ranges** (10.x, 172.16.x, 192.168.x, fc00::/7, fe80::/10)
- **Don't rely on naive string checks** — always resolve and validate

### Supply-Chain Integrity

While this suite doesn't implement SLSA, it's designed with provenance in mind:

- All servers are deterministic and reproducible
- Lockfiles are included for dependency pinning
- Structured logs provide audit trails

## Repository Structure

```
mcp-adversarial-suite/
├── README.md
├── LICENSE
├── package.json
├── tsconfig.base.json
├── servers/
│   ├── driftlab/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/index.ts
│   ├── homoglyph-forge/
│   ├── insecurefs/
│   ├── resource-trap/
│   └── spoofbox/
├── scenarios/
│   ├── 01_drift_tool_addition.yaml
│   ├── 02_schema_param_expansion.yaml
│   ├── 03_unicode_homoglyph.yaml
│   ├── 04_response_spoofing.yaml
│   ├── 05_resource_expansion.yaml
│   ├── 06_resource_drift.yaml
│   └── insecurefs/
├── deepfabric/
│   ├── README.md
│   └── configs/
│       ├── driftlab.yaml
│       ├── homoglyph.yaml
│       ├── insecurefs.yaml
│       ├── resource_trap.yaml
│       └── spoofbox.yaml
├── scripts/
│   └── run_scorecard.sh
└── .github/workflows/
    └── suite.yml
```

## Log Format

All servers output structured JSONL logs to stderr:

```jsonl
{"timestamp":"2024-01-15T10:30:00.000Z","level":"info","event":"server_start","data":{"config":{"drift_after":3}}}
{"timestamp":"2024-01-15T10:30:01.000Z","level":"info","event":"tools_list","data":{"tool_count":2,"drifted":false}}
{"timestamp":"2024-01-15T10:30:02.000Z","level":"warn","event":"drift_triggered","data":{"mode":"calls","call_count":3}}
```

## Safety

All servers in this suite are **safe by design**:

- ✅ No real command execution
- ✅ No actual file operations
- ✅ No network requests to external services
- ✅ All operations are simulated

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting PRs.

## License

Apache-2.0 — see [LICENSE](LICENSE) for details.

