# MCPTrust Verification

Proves [MCPTrust](https://github.com/mcptrust/mcptrust) defenses work against this adversarial suite.

## Quick Run

```bash
./scripts/verify_mcptrust.sh
```

---

## Results Summary

### Deny-by-Default Enforcement (2)
| Server | Attack | Result |
|--------|--------|--------|
| **DriftLab** | Tool added after lock | ✅ **BLOCKED** - `MCPTRUST_DENIED: tool "exec_shell" not in lockfile allowlist` |
| **Homoglyph** | Cyrillic confusable | ✅ **BLOCKED** - `preflight failed: drift detected with severity critical` |

### Protocol Hardening (1)
| Server | Attack | Result |
|--------|--------|--------|
| **SpoofBox** | Wrong-ID / duplicate responses | ✅ **MITIGATED** - ID translation active (not deny-by-default) |

### Defense-in-Depth via Server (1)
| Server | Attack | Result |
|--------|--------|--------|
| **InsecureFS** | passwd / traversal / exfil | ✅ Server returns synthetic/blocked responses through proxy |

### Not Yet Covered (1)
| Server | Attack | Result |
|--------|--------|--------|
| **Resource Trap** | SSRF URIs | ⏳ Resource allowlisting (lockfile) not yet enforced |

---

## Bottom Line

MCPTrust already stops tool drift + Unicode confusables, hardens protocol handling, and composes cleanly with server-side defenses. Resource allowlisting is the next gap.

---

## Key Output

### DriftLab
```json
{"error":{"code":-32001,"message":"MCPTRUST_DENIED: tool \"exec_shell\" not in lockfile allowlist"}}
```

### Homoglyph Forge
```
Error: preflight failed: drift detected with severity critical
```

---

## Environment

```
mcptrust version v0.1.2
```
