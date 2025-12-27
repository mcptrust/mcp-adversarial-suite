#!/usr/bin/env node
/**
 * SpoofBox - MCP Adversarial Server
 *
 * ⚠️  WARNING: FOR DEFENSIVE TESTING ONLY ⚠️
 * INTENTIONALLY violates MCP protocol to test proxies.
 *
 * Spoof Behaviors:
 *   duplicate_response: Send response twice
 *   wrong_id:           Respond with random ID
 *   unsolicited:        Fake responses periodically
 *
 * SAFE: no real exec/network.
 */

import * as readline from "readline";



function createSeededRandom(seed: number): () => number {
    let state = seed;
    return () => {
        state |= 0;
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}



interface JsonRpcRequest {
    jsonrpc: "2.0";
    method: string;
    params?: Record<string, unknown>;
    id?: string | number | null;
}

interface JsonRpcResponse {
    jsonrpc: "2.0";
    result?: unknown;
    error?: {
        code: number;
        message: string;
        data?: unknown;
    };
    id: string | number | null;
}

interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: {
        type: "object";
        properties: Record<string, unknown>;
        required?: string[];
    };
}

type SpoofMode = "duplicate_response" | "wrong_id" | "unsolicited" | null;



const config = {
    spoofMode: (process.env.SPOOF_MODE || null) as SpoofMode,
    spoofRate: parseInt(process.env.SPOOF_RATE || "3", 10),
    unsolicitedIntervalMs: parseInt(process.env.UNSOLICITED_INTERVAL_MS || "2000", 10),
    seed: parseInt(process.env.SEED || "42", 10),
};


const random = createSeededRandom(config.seed);



let requestCount = 0;
let responseCount = 0;
let spoofCount = 0;
let unsolicitedTimer: NodeJS.Timeout | null = null;



function log(event: string, data?: Record<string, unknown>): void {
    const logEntry = {
        timestamp: new Date().toISOString(),
        event,
        ...data,
    };
    process.stderr.write(JSON.stringify(logEntry) + "\n");
}



function sendResponse(response: JsonRpcResponse, isSpoof: boolean = false): void {
    const responseJson = JSON.stringify(response);
    process.stdout.write(responseJson + "\n");
    responseCount++;

    log("response_sent", {
        id: response.id,
        has_error: !!response.error,
        response_dropped_expected: isSpoof,
        is_spoof: isSpoof,
    });
}



function shouldSpoof(): boolean {
    if (!config.spoofMode || config.spoofMode === "unsolicited") {
        return false;
    }
    requestCount++;
    // deterministic: every Nth request triggers spoof
    return requestCount % config.spoofRate === 0;
}

function generateWrongId(): string {

    return `wrong_id_${Math.floor(random() * 1000000)}`;
}

function generateUnsolicitedId(): string {
    return `unsolicited_${Math.floor(random() * 1000000)}`;
}

function handleSpoofedResponse(response: JsonRpcResponse): void {
    switch (config.spoofMode) {
        case "duplicate_response":
            log("spoof_event", {
                type: "duplicate_response",
                original_id: response.id,
                spoof_count: ++spoofCount,
            });

            sendResponse(response, false);

            sendResponse(response, true);
            break;

        case "wrong_id":
            const wrongId = generateWrongId();
            log("spoof_event", {
                type: "wrong_id",
                original_id: response.id,
                wrong_id: wrongId,
                spoof_count: ++spoofCount,
            });

            sendResponse({ ...response, id: wrongId }, true);
            break;

        default:
            sendResponse(response, false);
    }
}

function emitUnsolicitedResponse(): void {
    const unsolicitedId = generateUnsolicitedId();
    log("spoof_event", {
        type: "unsolicited",
        fake_id: unsolicitedId,
        spoof_count: ++spoofCount,
    });

    const unsolicitedResponse: JsonRpcResponse = {
        jsonrpc: "2.0",
        result: {
            content: [{ type: "text", text: "[UNSOLICITED] This response was not requested." }],
        },
        id: unsolicitedId,
    };
    sendResponse(unsolicitedResponse, true);
}

function startUnsolicitedTimer(): void {
    if (config.spoofMode === "unsolicited") {
        unsolicitedTimer = setInterval(() => {
            emitUnsolicitedResponse();
        }, config.unsolicitedIntervalMs);
    }
}

function stopUnsolicitedTimer(): void {
    if (unsolicitedTimer) {
        clearInterval(unsolicitedTimer);
        unsolicitedTimer = null;
    }
}

function getTools(): ToolDefinition[] {
    return [
        {
            name: "echo",
            description: "Echo back the input text",
            inputSchema: {
                type: "object",
                properties: {
                    text: { type: "string", description: "Text to echo back" },
                },
                required: ["text"],
            },
        },
    ];
}



function handleInitialize(id: string | number | null): JsonRpcResponse {
    return {
        jsonrpc: "2.0",
        result: {
            protocolVersion: "2024-11-05",
            capabilities: {
                tools: {},
            },
            serverInfo: {
                name: "spoofbox",
                version: "1.0.0",
            },
        },
        id,
    };
}

function handleToolsList(id: string | number | null): JsonRpcResponse {
    const tools = getTools();
    log("tool_advertised", { tools: tools.map((t) => t.name) });

    return {
        jsonrpc: "2.0",
        result: { tools },
        id,
    };
}

function handleToolsCall(params: Record<string, unknown>, id: string | number | null): JsonRpcResponse {
    const toolName = params.name as string;
    const toolArgs = (params.arguments || {}) as Record<string, unknown>;

    log("tool_called", { tool: toolName, args: toolArgs });

    if (toolName !== "echo") {
        return {
            jsonrpc: "2.0",
            error: {
                code: -32601,
                message: `Unknown tool: ${toolName}`,
            },
            id,
        };
    }

    const text = (toolArgs.text as string) || "";
    return {
        jsonrpc: "2.0",
        result: {
            content: [{ type: "text", text: JSON.stringify({ text }) }],
        },
        id,
    };
}

function handleRequest(request: JsonRpcRequest): void {
    const requestId = request.id ?? null;

    let response: JsonRpcResponse | null = null;

    switch (request.method) {
        case "initialize":
            response = handleInitialize(requestId);
            break;

        case "notifications/initialized":


            startUnsolicitedTimer();
            return;

        case "tools/list":
            response = handleToolsList(requestId);
            break;

        case "tools/call":
            response = handleToolsCall(request.params || {}, requestId);
            break;

        default:
            response = {
                jsonrpc: "2.0",
                error: {
                    code: -32601,
                    message: `Method not found: ${request.method}`,
                },
                id: requestId,
            };
    }

    if (response) {
        // Only spoof tool calls ("initialize" and protocol messages should be correct)
        if (request.method === "tools/call" && shouldSpoof()) {
            handleSpoofedResponse(response);
        } else {
            sendResponse(response, false);
        }
    }
}



async function main(): Promise<void> {
    log("server_start", {
        spoof_mode: config.spoofMode,
        spoof_rate: config.spoofRate,
        unsolicited_interval_ms: config.unsolicitedIntervalMs,
        seed: config.seed,
        warning: "⚠️ FOR DEFENSIVE TESTING ONLY - This server intentionally violates protocol expectations",
    });

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false,
    });

    rl.on("line", (line: string) => {
        if (!line.trim()) return;

        try {
            const request = JSON.parse(line) as JsonRpcRequest;
            handleRequest(request);
        } catch (err) {
            log("parse_error", { error: String(err) });
            const errorResponse: JsonRpcResponse = {
                jsonrpc: "2.0",
                error: {
                    code: -32700,
                    message: "Parse error",
                },
                id: null,
            };
            sendResponse(errorResponse, false);
        }
    });

    rl.on("close", () => {
        stopUnsolicitedTimer();
        log("server_shutdown", {
            total_responses: responseCount,
            total_spoofs: spoofCount,
        });
        process.exit(0);
    });
}

main().catch((err) => {
    log("fatal", { error: String(err) });
    process.exit(1);
});
