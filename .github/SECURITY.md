# Security Policy

## Purpose

This repository is a **defensive benchmark suite** for testing MCP security proxies and tool-calling model safety. It simulates adversarial behaviors to help developers evaluate their defenses.

## Safety Guarantees

All servers in this suite are **safe by design**:

- ✅ No real command execution — all shell commands are simulated
- ✅ No actual filesystem access — uses in-memory virtual filesystems
- ✅ No network requests — SSRF targets are synthetic, never contacted
- ✅ No real credentials — all "sensitive" data is watermarked synthetic content
- ✅ Deterministic behavior — seeded randomness for reproducibility

## Reporting Security Issues

If you discover a security issue, please use **responsible disclosure**.

1. **For issues in this benchmark suite (preferred)**: Report privately via GitHub Security Advisories:
   - Go to the repo → **Security** → **Report a vulnerability**
   - If that option isn't available, contact the maintainers privately (GitHub DM/email) and we will respond as soon as possible.

2. **For issues in MCPTrust itself**: Report via [MCPTrust's security policy](https://github.com/mcptrust/mcptrust/security/policy).

3. **Bug bounty**: We do not currently offer a bug bounty program.

## Scope

### In Scope
- Bugs that could cause the benchmark servers to perform real actions (file I/O, network, exec)
- Issues where synthetic/watermarked data could be confused for real sensitive data
- CI/CD configuration issues that could affect downstream consumers

### Out of Scope
- The adversarial behaviors themselves (that's the point of this repo)
- Issues in dependencies (report upstream) **unless** exploitable through this repo's code or configuration
- Issues in MCPTrust (report to MCPTrust directly)

## Supported Versions

| Version | Supported |
|---------|-----------|
| `main` | ✅ (actively maintained) |
| Latest tagged release | ✅ |
| Older releases | ❌ (best-effort) |

## Contact

- **Maintainers**: [@mcptrust](https://github.com/mcptrust)
- **Private reports**: GitHub Security Advisories (preferred)
- **Non-security issues**: [GitHub Issues](https://github.com/mcptrust/mcp-adversarial-suite/issues)
