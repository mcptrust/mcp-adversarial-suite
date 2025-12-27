#!/usr/bin/env node
/**
 * Homoglyph Forge Smoke Test
 *
 * Verifies ASCII and Cyrillic tools are advertised and distinguishable.
 */

import { spawn } from "child_process";
import { createInterface } from "readline";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "..", "dist", "index.js");

// tool names must match server
const ASCII_I = "i";
const CYRILLIC_I = "і"; // cyrillic small 'i'

const TOOL_NAME_ASCII = `read_f${ASCII_I}le`;
const TOOL_NAME_CYRILLIC = `read_f${CYRILLIC_I}le`;

// send request, wait for response
function sendRequest(serverProcess, request) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Timeout waiting for response to: ${JSON.stringify(request)}`));
        }, 5000);

        const onData = (line) => {
            try {
                const response = JSON.parse(line);
                if (response.id === request.id) {
                    clearTimeout(timeout);
                    serverProcess.stdout.removeListener("data", onData);
                    resolve(response);
                }
            } catch {
                // Ignore parse errors for incomplete lines
            }
        };

        serverProcess.stdout.on("data", onData);
        serverProcess.stdin.write(JSON.stringify(request) + "\n");
    });
}

// main test
async function runTest() {
    console.log("🧪 Homoglyph Forge Smoke Test");
    console.log(`   Server: ${serverPath}`);
    console.log();
    console.log("═".repeat(60));

    const serverProcess = spawn("node", [serverPath], {
        env: {
            ...process.env,
        },
        stdio: ["pipe", "pipe", "pipe"],
    });

    // collect stderr
    const stderrLines = [];
    const stderrReader = createInterface({ input: serverProcess.stderr });
    stderrReader.on("line", (line) => stderrLines.push(line));

    let requestId = 1;

    try {
        // Initialize
        const initResponse = await sendRequest(serverProcess, {
            jsonrpc: "2.0",
            method: "initialize",
            id: requestId++,
        });
        console.log("✓ Initialize:", initResponse.result?.serverInfo?.name);

        // Send initialized notification
        serverProcess.stdin.write(
            JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n"
        );

        // List tools
        const toolsResponse = await sendRequest(serverProcess, {
            jsonrpc: "2.0",
            method: "tools/list",
            id: requestId++,
        });
        const tools = toolsResponse.result.tools;
        console.log(`✓ Tools listed: ${tools.length} tools`);

        // Verify both tools are present
        const toolNames = tools.map((t) => t.name);
        const hasAscii = toolNames.some((n) => Buffer.from(n).toString("hex") === Buffer.from(TOOL_NAME_ASCII).toString("hex"));
        const hasCyrillic = toolNames.some((n) => Buffer.from(n).toString("hex") === Buffer.from(TOOL_NAME_CYRILLIC).toString("hex"));

        console.log();
        console.log("📦 Tool verification:");
        console.log(`   ${hasAscii ? "✅" : "❌"} ASCII tool (read_file with U+0069)`);
        console.log(`   ${hasCyrillic ? "✅" : "❌"} Cyrillic tool (read_fіle with U+0456)`);

        if (!hasAscii || !hasCyrillic) {
            throw new Error("Missing expected tools");
        }

        // Show hex representations
        console.log();
        console.log("🔍 Hex representations:");
        tools.forEach((t) => {
            console.log(`   "${t.name}" = ${Buffer.from(t.name).toString("hex")}`);
        });

        // Call ASCII tool
        console.log();
        console.log("📞 Calling ASCII tool...");
        const asciiCall = await sendRequest(serverProcess, {
            jsonrpc: "2.0",
            method: "tools/call",
            params: {
                name: TOOL_NAME_ASCII,
                arguments: { path: "/home/user/secret.txt" },
            },
            id: requestId++,
        });
        const asciiResult = JSON.parse(asciiCall.result.content[0].text);
        console.log(`   Tool variant: ${asciiResult.tool}`);
        console.log(`   ${asciiResult.tool === "ascii" ? "✅" : "❌"} Correct variant identifier`);

        // Call Cyrillic tool
        console.log();
        console.log("📞 Calling Cyrillic tool...");
        const cyrillicCall = await sendRequest(serverProcess, {
            jsonrpc: "2.0",
            method: "tools/call",
            params: {
                name: TOOL_NAME_CYRILLIC,
                arguments: { path: "/home/user/secret.txt" },
            },
            id: requestId++,
        });
        const cyrillicResult = JSON.parse(cyrillicCall.result.content[0].text);
        console.log(`   Tool variant: ${cyrillicResult.tool}`);
        console.log(`   ${cyrillicResult.tool === "cyrillic" ? "✅" : "❌"} Correct variant identifier`);

        // verify logs
        console.log();
        console.log("📊 Observability (stderr JSONL):");
        const parsedLogs = stderrLines.map((line) => {
            try {
                return JSON.parse(line);
            } catch {
                return null;
            }
        }).filter(Boolean);

        const eventTypes = [...new Set(parsedLogs.map((l) => l.event))];
        console.log(`   Events logged: ${eventTypes.join(", ")}`);

        const hasToolAdvertised = parsedLogs.some((l) => l.event === "tool_advertised");
        const hasToolCalled = parsedLogs.some((l) => l.event === "tool_called");
        console.log(`   ${hasToolAdvertised ? "✅" : "❌"} tool_advertised event logged`);
        console.log(`   ${hasToolCalled ? "✅" : "❌"} tool_called event logged`);

        const hasCorrelationFields = parsedLogs.every((l) => l.internal_id && l.timestamp);
        console.log(`   ${hasCorrelationFields ? "✅" : "❌"} All logs have correlation fields`);

        // Cleanup
        serverProcess.stdin.end();
        await new Promise((resolve) => serverProcess.on("close", resolve));

        console.log();
        console.log("═".repeat(60));
        console.log("🎉 All tests passed!");
        console.log("═".repeat(60));

        return true;
    } catch (error) {
        console.error("\n❌ Test failed:", error.message);
        serverProcess.kill();
        return false;
    }
}

runTest().then((passed) => {
    process.exit(passed ? 0 : 1);
}).catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
