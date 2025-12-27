#!/usr/bin/env node
/**
 * DriftLab Smoke Test
 *
 * Verifies drift (tool addition / schema expansion) after threshold.
 */

import { spawn } from "child_process";
import { createInterface } from "readline";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "..", "dist", "index.js");

// Configuration
const DRIFT_AFTER = 2;
const TEST_MODES = ["add_tool", "expand_schema"];

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

        // Read line by line from stdout
        serverProcess.stdout.on("data", onData);
        serverProcess.stdin.write(JSON.stringify(request) + "\n");
    });
}

// run single test scenario
async function runTest(driftMode) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Testing DRIFT_MODE=${driftMode}`);
    console.log("=".repeat(60));

    const serverProcess = spawn("node", [serverPath], {
        env: {
            ...process.env,
            DRIFT_MODE: driftMode,
            DRIFT_AFTER: String(DRIFT_AFTER),
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
        console.log("\n✓ Initialize:", initResponse.result?.serverInfo?.name);

        // Send initialized notification (no response expected)
        serverProcess.stdin.write(
            JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n"
        );

        // Get baseline tools
        const baselineTools = await sendRequest(serverProcess, {
            jsonrpc: "2.0",
            method: "tools/list",
            id: requestId++,
        });
        const baselineToolNames = baselineTools.result.tools.map((t) => t.name);
        console.log("\n📦 Baseline tools:", baselineToolNames.join(", "));

        // Make tool calls to trigger drift
        console.log(`\n🔄 Making ${DRIFT_AFTER} tool calls to trigger drift...`);
        for (let i = 0; i < DRIFT_AFTER; i++) {
            const callResponse = await sendRequest(serverProcess, {
                jsonrpc: "2.0",
                method: "tools/call",
                params: {
                    name: "list_directory",
                    arguments: { path: "/" },
                },
                id: requestId++,
            });
            const result = JSON.parse(callResponse.result.content[0].text);
            console.log(`  Call ${i + 1}: list_directory("/") → ${result.entries.length} entries`);
        }

        // Get drifted tools
        const driftedTools = await sendRequest(serverProcess, {
            jsonrpc: "2.0",
            method: "tools/list",
            id: requestId++,
        });
        const driftedToolList = driftedTools.result.tools;
        const driftedToolNames = driftedToolList.map((t) => t.name);
        console.log("\n🚨 Drifted tools:", driftedToolNames.join(", "));

        // Verify drift behavior
        if (driftMode === "add_tool") {
            const hasExecShell = driftedToolNames.includes("exec_shell");
            console.log(`\n${hasExecShell ? "✅" : "❌"} exec_shell tool ${hasExecShell ? "added" : "NOT added"}`);

            if (hasExecShell) {
                // Test the exec_shell stub
                const execResponse = await sendRequest(serverProcess, {
                    jsonrpc: "2.0",
                    method: "tools/call",
                    params: {
                        name: "exec_shell",
                        arguments: { command: "rm -rf /" },
                    },
                    id: requestId++,
                });
                const execResult = JSON.parse(execResponse.result.content[0].text);
                console.log(`   exec_shell("rm -rf /") → ${JSON.stringify(execResult)}`);
                console.log(`   ${execResult.note === "disabled" ? "✅" : "❌"} Stub returns { note: "disabled" }`);
            }
        } else if (driftMode === "expand_schema") {
            const listDirTool = driftedToolList.find((t) => t.name === "list_directory");
            const hasRecursive = listDirTool?.inputSchema?.properties?.recursive !== undefined;
            console.log(
                `\n${hasRecursive ? "✅" : "❌"} list_directory has recursive param: ${hasRecursive}`
            );

            if (hasRecursive) {
                // Test recursive listing
                const recursiveResponse = await sendRequest(serverProcess, {
                    jsonrpc: "2.0",
                    method: "tools/call",
                    params: {
                        name: "list_directory",
                        arguments: { path: "/", recursive: true },
                    },
                    id: requestId++,
                });
                const recursiveResult = JSON.parse(recursiveResponse.result.content[0].text);
                console.log(`   list_directory("/", recursive=true) → ${recursiveResult.entries.length} entries`);
            }
        }

        // verify logs
        console.log("\n📊 Observability (stderr JSONL):");
        const parsedLogs = stderrLines.map((line) => {
            try {
                return JSON.parse(line);
            } catch {
                return null;
            }
        }).filter(Boolean);

        const eventTypes = [...new Set(parsedLogs.map((l) => l.event))];
        console.log(`   Events logged: ${eventTypes.join(", ")}`);

        const hasDriftActivated = parsedLogs.some((l) => l.event === "drift_activated");
        console.log(`   ${hasDriftActivated ? "✅" : "❌"} drift_activated event logged`);

        const hasCorrelationFields = parsedLogs.every((l) => l.internal_id && l.timestamp);
        console.log(`   ${hasCorrelationFields ? "✅" : "❌"} All logs have correlation fields`);

        // Cleanup
        serverProcess.stdin.end();
        await new Promise((resolve) => serverProcess.on("close", resolve));

        console.log("\n✅ Test passed");
        return true;
    } catch (error) {
        console.error("\n❌ Test failed:", error.message);
        serverProcess.kill();
        return false;
    }
}

async function main() {
    console.log("🧪 DriftLab Smoke Test");
    console.log(`   Server: ${serverPath}`);
    console.log(`   DRIFT_AFTER: ${DRIFT_AFTER}`);

    let allPassed = true;
    for (const mode of TEST_MODES) {
        const passed = await runTest(mode);
        if (!passed) allPassed = false;
    }

    console.log("\n" + "=".repeat(60));
    console.log(allPassed ? "🎉 All tests passed!" : "💥 Some tests failed");
    console.log("=".repeat(60));

    process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
