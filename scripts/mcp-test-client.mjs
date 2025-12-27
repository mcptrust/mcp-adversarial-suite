#!/usr/bin/env node
// MCP test client for scorecard - proper protocol handling

import { spawn } from "child_process";
import { dirname } from "path";

const TIMEOUT_MS = 10000;

function sendRequest(proc, request) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Timeout for id=${request.id}`));
        }, TIMEOUT_MS);

        let buffer = "";
        const onData = (chunk) => {
            buffer += chunk.toString();
            const lines = buffer.split("\n");
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const response = JSON.parse(line);
                    if (response.id === request.id) {
                        clearTimeout(timeout);
                        proc.stdout.off("data", onData);
                        resolve(response);
                        return;
                    }
                } catch { }
            }
        };

        proc.stdout.on("data", onData);
        proc.stdin.write(JSON.stringify(request) + "\n");
    });
}

async function testServer(serverPath, extraCall = null) {
    const proc = spawn("node", [serverPath], {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: dirname(serverPath),
    });

    let requestId = 1;

    try {
        const initResp = await sendRequest(proc, {
            jsonrpc: "2.0",
            method: "initialize",
            id: requestId++,
        });

        if (initResp.error) {
            throw new Error(`Initialize failed: ${JSON.stringify(initResp.error)}`);
        }

        proc.stdin.write(JSON.stringify({
            jsonrpc: "2.0",
            method: "notifications/initialized",
        }) + "\n");

        await new Promise(r => setTimeout(r, 50));

        const toolsResp = await sendRequest(proc, {
            jsonrpc: "2.0",
            method: "tools/list",
            id: requestId++,
        });

        const tools = toolsResp.result?.tools || [];
        const result = {
            success: true,
            serverInfo: initResp.result?.serverInfo,
            tools: tools.map(t => t.name),
            toolSchemas: tools,
        };

        if (extraCall) {
            const callResp = await sendRequest(proc, {
                jsonrpc: "2.0",
                method: "tools/call",
                params: { name: extraCall.name, arguments: extraCall.args },
                id: requestId++,
            });
            result.callResult = callResp.result || callResp.error;
        }

        proc.stdin.end();
        await new Promise(r => proc.on("close", r));
        return result;

    } catch (err) {
        proc.kill();
        return { success: false, error: err.message };
    }
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 1) {
        console.error("Usage: mcp-test-client.mjs <server-path> [--extra-call <name> <args-json>]");
        process.exit(1);
    }

    const serverPath = args[0];
    let extraCall = null;

    const extraIdx = args.indexOf("--extra-call");
    if (extraIdx !== -1 && args[extraIdx + 1] && args[extraIdx + 2]) {
        extraCall = {
            name: args[extraIdx + 1],
            args: JSON.parse(args[extraIdx + 2]),
        };
    }

    const result = await testServer(serverPath, extraCall);
    console.log(JSON.stringify(result));
    process.exit(result.success ? 0 : 1);
}

main().catch(err => {
    console.log(JSON.stringify({ success: false, error: err.message }));
    process.exit(1);
});
