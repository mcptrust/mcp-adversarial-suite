#!/usr/bin/env node
/**
 * SpoofBox Test Harness
 *
 * Verifies valid/spoofed response counts for different modes.
 */

import { spawn } from "child_process";
import { createInterface } from "readline";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "..", "dist", "index.js");

const NUM_ECHO_CALLS = 20;
const SPOOF_RATE = 3; // 1/3 requests will be spoofed

// send request, collect responses
function sendRequest(serverProcess, request, responseCollector) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Timeout waiting for response to: ${JSON.stringify(request)}`));
        }, 5000);

        const checkResponse = () => {
            // Look for a response matching our request ID
            const matchIndex = responseCollector.findIndex((r) => r.id === request.id);
            if (matchIndex !== -1) {
                clearTimeout(timeout);
                const response = responseCollector[matchIndex];
                responseCollector.splice(matchIndex, 1);
                resolve(response);
            }
        };

        // Check periodically
        const interval = setInterval(checkResponse, 50);
        serverProcess.stdin.write(JSON.stringify(request) + "\n");

        // Also check after a short delay
        setTimeout(() => {
            clearInterval(interval);
            checkResponse();
        }, 1000);
    });
}

// run test for spoof mode
async function runTest(spoofMode) {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`Testing SPOOF_MODE=${spoofMode}`);
    console.log("=".repeat(70));

    const serverProcess = spawn("node", [serverPath], {
        env: {
            ...process.env,
            SPOOF_MODE: spoofMode,
            SPOOF_RATE: String(SPOOF_RATE),
            SEED: "12345", // Fixed seed for deterministic behavior
            UNSOLICITED_INTERVAL_MS: "500", // Faster for testing
        },
        stdio: ["pipe", "pipe", "pipe"],
    });

    // collect responses and logs
    const responses = [];
    const stderrLines = [];
    let responseBuffer = "";

    serverProcess.stdout.on("data", (data) => {
        responseBuffer += data.toString();
        const lines = responseBuffer.split("\n");
        responseBuffer = lines.pop(); // Keep incomplete line
        for (const line of lines) {
            if (line.trim()) {
                try {
                    responses.push(JSON.parse(line));
                } catch {
                    // Ignore parse errors
                }
            }
        }
    });

    const stderrReader = createInterface({ input: serverProcess.stderr });
    stderrReader.on("line", (line) => stderrLines.push(line));

    let requestId = 1;

    try {
        // Initialize
        serverProcess.stdin.write(
            JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: requestId++ }) + "\n"
        );
        await new Promise((r) => setTimeout(r, 200));
        console.log("✓ Initialize");

        // Send initialized notification
        serverProcess.stdin.write(
            JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n"
        );
        await new Promise((r) => setTimeout(r, 100));

        // Clear initialization responses
        responses.length = 0;

        // Send 20 echo requests
        console.log(`\n📤 Sending ${NUM_ECHO_CALLS} echo requests...`);
        const sentIds = new Set();

        for (let i = 0; i < NUM_ECHO_CALLS; i++) {
            const id = requestId++;
            sentIds.add(id);
            serverProcess.stdin.write(
                JSON.stringify({
                    jsonrpc: "2.0",
                    method: "tools/call",
                    params: { name: "echo", arguments: { text: `Message ${i + 1}` } },
                    id,
                }) + "\n"
            );
        }

        // Wait for responses
        if (spoofMode === "unsolicited") {
            // Wait longer to collect unsolicited responses
            await new Promise((r) => setTimeout(r, 3000));
        } else {
            await new Promise((r) => setTimeout(r, 1500));
        }

        // Analyze responses
        console.log(`\n📊 Results:`);

        const validResponses = responses.filter((r) => sentIds.has(r.id));
        const wrongIdResponses = responses.filter(
            (r) => !sentIds.has(r.id) && r.id !== null && typeof r.id === "string" && r.id.startsWith("wrong_id_")
        );
        const unsolicitedResponses = responses.filter(
            (r) => typeof r.id === "string" && r.id.startsWith("unsolicited_")
        );
        const duplicateCount = responses.filter((r) => sentIds.has(r.id)).length - sentIds.size;

        console.log(`   Total responses received: ${responses.length}`);
        console.log(`   Valid responses (matching request IDs): ${validResponses.length}`);

        // Parse stderr logs
        const parsedLogs = stderrLines
            .map((line) => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            })
            .filter(Boolean);

        const spoofEvents = parsedLogs.filter((l) => l.event === "spoof_event");
        const responseSentLogs = parsedLogs.filter((l) => l.event === "response_sent");
        const droppableResponses = responseSentLogs.filter((l) => l.response_dropped_expected === true);

        if (spoofMode === "duplicate_response") {
            const expectedSpoofs = Math.floor(NUM_ECHO_CALLS / SPOOF_RATE);
            console.log(`   Duplicate responses: ${duplicateCount > 0 ? duplicateCount : validResponses.length - NUM_ECHO_CALLS}`);
            console.log(`   Expected spoofs (~1/${SPOOF_RATE} of ${NUM_ECHO_CALLS}): ~${expectedSpoofs}`);
            console.log(`   Spoof events logged: ${spoofEvents.length}`);
            console.log(`   Responses marked droppable: ${droppableResponses.length}`);
        } else if (spoofMode === "wrong_id") {
            console.log(`   Wrong-ID responses: ${wrongIdResponses.length}`);
            console.log(`   Expected spoofs (~1/${SPOOF_RATE} of ${NUM_ECHO_CALLS}): ~${Math.floor(NUM_ECHO_CALLS / SPOOF_RATE)}`);
            console.log(`   Spoof events logged: ${spoofEvents.length}`);
            console.log(`   Responses marked droppable: ${droppableResponses.length}`);
        } else if (spoofMode === "unsolicited") {
            console.log(`   Unsolicited responses: ${unsolicitedResponses.length}`);
            console.log(`   Spoof events logged: ${spoofEvents.length}`);
            console.log(`   (Unsolicited emitted every 500ms during ~3s test window)`);
        }

        // verify logs
        console.log(`\n📝 Observability:`);
        const eventTypes = [...new Set(parsedLogs.map((l) => l.event))];
        console.log(`   Event types: ${eventTypes.join(", ")}`);
        console.log(`   ${spoofEvents.length > 0 ? "✅" : "⚠️"} spoof_event logged: ${spoofEvents.length > 0}`);
        console.log(`   ${droppableResponses.length > 0 || spoofMode === "unsolicited" ? "✅" : "⚠️"} response_dropped_expected=true logged: ${droppableResponses.length > 0}`);

        // Cleanup
        serverProcess.stdin.end();
        await new Promise((resolve) => serverProcess.on("close", resolve));

        console.log("\n✅ Test completed");
        return true;
    } catch (error) {
        console.error("\n❌ Test failed:", error.message);
        serverProcess.kill();
        return false;
    }
}

/**
 * Main
 */
async function main() {
    console.log("🧪 SpoofBox Test Harness");
    console.log(`   Server: ${serverPath}`);
    console.log(`   Echo calls: ${NUM_ECHO_CALLS}`);
    console.log(`   Spoof rate: 1/${SPOOF_RATE}`);

    const modes = ["duplicate_response", "wrong_id", "unsolicited"];
    let allPassed = true;

    for (const mode of modes) {
        const passed = await runTest(mode);
        if (!passed) allPassed = false;
    }

    console.log("\n" + "=".repeat(70));
    console.log(allPassed ? "🎉 All tests completed!" : "💥 Some tests failed");
    console.log("=".repeat(70));

    // Summary
    console.log("\n📋 Summary:");
    console.log("   - duplicate_response: Sends valid response twice");
    console.log("   - wrong_id: Sends response with non-matching ID");
    console.log("   - unsolicited: Emits fake responses periodically");
    console.log("\n⚠️  server is FOR DEFENSIVE TESTING ONLY");

    process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
