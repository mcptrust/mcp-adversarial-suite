# SpoofBox

> ⚠️ **WARNING: FOR DEFENSIVE TESTING ONLY** ⚠️
>
> This server **intentionally violates MCP protocol expectations** to test
> defensive proxies. It is designed to be "bad" on purpose. **DO NOT** use
> this server in production or with real applications.

**Adversarial MCP server that simulates protocol spoofing attacks.**

SpoofBox exposes a simple `echo` tool but intentionally produces malformed responses to test how defensive proxies handle protocol violations.

## Quick Start

```bash
# Build
npm run build

# Run (normal mode - no spoofing)
npm run start

# Run with spoofing enabled
SPOOF_MODE=duplicate_response SPOOF_RATE=3 npm run start

# Development mode
npm run dev
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SPOOF_MODE` | (none) | Spoof behavior: `duplicate_response`, `wrong_id`, or `unsolicited` |
| `SPOOF_RATE` | `3` | 1/N rate for spoofing (every Nth request is spoofed) |
| `UNSOLICITED_INTERVAL_MS` | `2000` | Interval (ms) for unsolicited responses |
| `SEED` | `42` | Random seed for deterministic behavior |

## Spoof Behaviors

### `SPOOF_MODE=duplicate_response`

For every 1/N `tools/call` requests, the server sends the **same valid response twice**.

A defensive proxy should detect and drop the duplicate.

### `SPOOF_MODE=wrong_id`

For every 1/N `tools/call` requests, the server responds with an **ID that doesn't match any pending request**.

A defensive proxy should drop responses with unrecognized IDs.

### `SPOOF_MODE=unsolicited`

Every `UNSOLICITED_INTERVAL_MS` milliseconds, the server emits a **fake response with a random ID** even when no request was made.

A defensive proxy should drop all unsolicited responses.

## Tool

| Tool | Input | Output |
|------|-------|--------|
| `echo` | `{ text: string }` | `{ text: string }` |

## Observability

All events are logged as JSONL to stderr:

```json
{"timestamp":"2025-12-25T19:20:00.000Z","event":"spoof_event","type":"duplicate_response","original_id":"abc-123","spoof_count":1}
{"timestamp":"2025-12-25T19:20:00.001Z","event":"response_sent","id":"abc-123","has_error":false,"response_dropped_expected":false,"is_spoof":false}
{"timestamp":"2025-12-25T19:20:00.002Z","event":"response_sent","id":"abc-123","has_error":false,"response_dropped_expected":true,"is_spoof":true}
```

### Log Events

| Event | Description |
|-------|-------------|
| `server_start` | Server initialized with config |
| `spoof_event` | A spoof behavior was triggered |
| `response_sent` | JSON-RPC response sent to stdout |
| `tool_called` | Tool invocation received |
| `tool_advertised` | Tools list returned |
| `server_shutdown` | Server shutting down with stats |

### Key Log Fields

- `response_dropped_expected: true` - Indicates the response **should be dropped** by a defensive proxy
- `is_spoof: true` - Indicates this is a spoofed response
- `spoof_count` - Running count of spoof events

## Test Harness

Run the included harness to test all spoof modes:

```bash
# Build first
npm run build

# Run harness (sends 20 echo calls per mode)
node test/harness.mjs
```

The harness will:
1. Test each spoof mode (`duplicate_response`, `wrong_id`, `unsolicited`)
2. Send 20 echo tool calls
3. Report: valid responses, spoofed responses, logged events
4. Verify observability (stderr JSONL)

## Manual Testing

```bash
# Test with no spoofing
echo '{"jsonrpc":"2.0","method":"initialize","id":1}' | npm run start

# Test duplicate_response mode
echo '{"jsonrpc":"2.0","method":"initialize","id":1}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"echo","arguments":{"text":"hello"}},"id":2}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"echo","arguments":{"text":"world"}},"id":3}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"echo","arguments":{"text":"test"}},"id":4}' | SPOOF_MODE=duplicate_response SPOOF_RATE=2 npm run start
```

## Protocol

Standard MCP over stdio (JSON-RPC 2.0, newline-delimited).

## Safety

This server is **safe**:
- ✅ No real command execution
- ✅ No network calls
- ✅ No file system access
- ✅ No destructive operations
- ✅ Deterministic with SEED

It only produces malformed JSON-RPC responses to test proxy resilience.
