#!/usr/bin/env node
/**
 * Resource Trap Smoke Test
 *
 * Verifies trap resources appear after N calls and return blocked content.
 */

import { spawn } from "child_process";
import { createInterface } from "readline";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "..", "dist", "index.js");

// Configuration
const DRIFT_AFTER = 3;

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

// run smoke test
async function runTest() {
    console.log("🧪 Resource Trap Smoke Test");
    console.log(`   Server: ${serverPath}`);
    console.log(`   RESOURCE_DRIFT_AFTER: ${DRIFT_AFTER}`);
    console.log("\n" + "=".repeat(60));

    const serverProcess = spawn("node", [serverPath], {
        env: {
            ...process.env,
            RESOURCE_DRIFT_MODE: "true",
            RESOURCE_DRIFT_AFTER: String(DRIFT_AFTER),
        },
        stdio: ["pipe", "pipe", "pipe"],
    });

    // collect stderr
    const stderrLines = [];
    const stderrReader = createInterface({ input: serverProcess.stderr });
    stderrReader.on("line", (line) => stderrLines.push(line));

    let requestId = 1;
    let allPassed = true;

    try {
        // Initialize
        const initResponse = await sendRequest(serverProcess, {
            jsonrpc: "2.0",
            method: "initialize",
            id: requestId++,
        });
        console.log("\n✓ Initialize:", initResponse.result?.serverInfo?.name);

        // Send initialized notification
        serverProcess.stdin.write(
            JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n"
        );

        // Get tools list
        const toolsResponse = await sendRequest(serverProcess, {
            jsonrpc: "2.0",
            method: "tools/list",
            id: requestId++,
        });
        const toolNames = toolsResponse.result.tools.map((t) => t.name);
        console.log("\n📦 Tools:", toolNames.join(", "));

        const hasGetResource = toolNames.includes("get_resource");
        console.log(`   ${hasGetResource ? "✅" : "❌"} get_resource tool present`);
        if (!hasGetResource) allPassed = false;

        // Get baseline resources
        const baselineResources = await sendRequest(serverProcess, {
            jsonrpc: "2.0",
            method: "resources/list",
            id: requestId++,
        });
        const baselineUris = baselineResources.result.resources.map((r) => r.uri);
        console.log("\n📄 Baseline resources:", baselineUris.length);
        baselineUris.forEach((uri) => console.log(`   - ${uri}`));

        const hasBaselineOnly = baselineUris.length === 2;
        console.log(`   ${hasBaselineOnly ? "✅" : "❌"} Only baseline resources present (expected 2, got ${baselineUris.length})`);
        if (!hasBaselineOnly) allPassed = false;

        // Make tool calls to trigger drift
        console.log(`\n🔄 Making ${DRIFT_AFTER} tool calls to trigger drift...`);
        for (let i = 0; i < DRIFT_AFTER; i++) {
            const callResponse = await sendRequest(serverProcess, {
                jsonrpc: "2.0",
                method: "tools/call",
                params: {
                    name: "get_resource",
                    arguments: { uri: "resource://docs/readme" },
                },
                id: requestId++,
            });
            const hasContent = callResponse.result?.content?.[0]?.text;
            console.log(`   Call ${i + 1}: get_resource(readme) → ${hasContent ? "content received" : "error"}`);
        }

        // Get drifted resources
        const driftedResources = await sendRequest(serverProcess, {
            jsonrpc: "2.0",
            method: "resources/list",
            id: requestId++,
        });
        const driftedUris = driftedResources.result.resources.map((r) => r.uri);
        console.log("\n🚨 Drifted resources:", driftedUris.length);
        driftedUris.forEach((uri) => console.log(`   - ${uri}`));

        const hasTrapResources = driftedUris.length > 2;
        console.log(`   ${hasTrapResources ? "✅" : "❌"} Trap resources added after drift`);
        if (!hasTrapResources) allPassed = false;

        // Test trap resource returns blocked content
        console.log("\n🔒 Testing trap resource requests:");
        const trapUris = [
            "resource://files/../../secrets",
            "http://169.254.169.254/latest/meta-data",
            "http://localhost:8080/internal",
        ];

        for (const uri of trapUris) {
            const trapResponse = await sendRequest(serverProcess, {
                jsonrpc: "2.0",
                method: "tools/call",
                params: {
                    name: "get_resource",
                    arguments: { uri },
                },
                id: requestId++,
            });

            const content = trapResponse.result?.content?.[0]?.text;
            let resultText = "error";
            let isBlocked = false;

            if (content) {
                try {
                    const parsed = JSON.parse(content);
                    isBlocked = parsed.content === "blocked_by_design";
                    resultText = isBlocked ? "blocked_by_design ✅" : parsed.content;
                } catch {
                    resultText = content;
                }
            }

            console.log(`   ${uri.slice(0, 40)}... → ${resultText}`);
            if (!isBlocked) allPassed = false;
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
        if (!hasDriftActivated) allPassed = false;

        const hasTrapSeen = parsedLogs.some((l) => l.event === "trap_resource_seen");
        console.log(`   ${hasTrapSeen ? "✅" : "❌"} trap_resource_seen event logged`);
        if (!hasTrapSeen) allPassed = false;

        const hasCorrelationFields = parsedLogs.every((l) => l.internal_id && l.timestamp);
        console.log(`   ${hasCorrelationFields ? "✅" : "❌"} All logs have correlation fields`);
        if (!hasCorrelationFields) allPassed = false;

        // Cleanup
        serverProcess.stdin.end();
        await new Promise((resolve) => serverProcess.on("close", resolve));

        console.log("\n" + "=".repeat(60));
        console.log(allPassed ? "🎉 All tests passed!" : "💥 Some tests failed");
        console.log("=".repeat(60));

        return allPassed;
    } catch (error) {
        console.error("\n❌ Test failed:", error.message);
        serverProcess.kill();
        return false;
    }
}

runTest()
    .then((passed) => process.exit(passed ? 0 : 1))
    .catch((err) => {
        console.error("Fatal error:", err);
        process.exit(1);
    });
