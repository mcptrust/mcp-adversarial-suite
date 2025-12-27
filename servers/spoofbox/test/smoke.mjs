#!/usr/bin/env node
/**
 * SpoofBox Smoke Test
 *
 * Verifies basic operation without spoofing. For full spoof modes, run harness.mjs.
 */

import { spawn } from "child_process";
import { createInterface } from "readline";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "..", "dist", "index.js");

// send json-rpc request
function sendRequest(serverProcess, request) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Timeout: ${JSON.stringify(request)}`));
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
                // ignore incomplete lines
            }
        };

        serverProcess.stdout.on("data", onData);
        serverProcess.stdin.write(JSON.stringify(request) + "\n");
    });
}

async function runTest() {
    console.log("🧪 SpoofBox Smoke Test");
    console.log(`   Server: ${serverPath}`);
    console.log("   (Full spoof tests: node test/harness.mjs)");
    console.log("=".repeat(60));

    const serverProcess = spawn("node", [serverPath], {
        env: { ...process.env, SEED: "42" }, // no SPOOF_MODE = normal
        stdio: ["pipe", "pipe", "pipe"],
    });

    const stderrLines = [];
    const stderrReader = createInterface({ input: serverProcess.stderr });
    stderrReader.on("line", (line) => stderrLines.push(line));

    let requestId = 1;
    let allPassed = true;

    const test = (name, passed) => {
        console.log(`${passed ? "✅" : "❌"} ${name}`);
        if (!passed) allPassed = false;
    };

    try {
        // init
        const initResponse = await sendRequest(serverProcess, {
            jsonrpc: "2.0",
            method: "initialize",
            id: requestId++,
        });
        test("Initialize", initResponse.result?.serverInfo?.name === "spoofbox");

        serverProcess.stdin.write(
            JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n"
        );

        // tools
        const toolsResponse = await sendRequest(serverProcess, {
            jsonrpc: "2.0",
            method: "tools/list",
            id: requestId++,
        });
        const toolNames = toolsResponse.result.tools.map((t) => t.name);
        test("Tools listed: " + toolNames.join(", "), toolNames.includes("echo"));

        // echo
        const echoResponse = await sendRequest(serverProcess, {
            jsonrpc: "2.0",
            method: "tools/call",
            params: { name: "echo", arguments: { text: "hello" } },
            id: requestId++,
        });
        const echoResult = JSON.parse(echoResponse.result.content[0].text);
        test("Echo tool works", echoResult.text === "hello");

        // logs
        console.log("\n📊 Observability:");
        const parsedLogs = stderrLines.map((line) => {
            try { return JSON.parse(line); } catch { return null; }
        }).filter(Boolean);

        const eventTypes = [...new Set(parsedLogs.map((l) => l.event))];
        console.log(`   Events: ${eventTypes.join(", ")}`);

        const noSpoofs = !parsedLogs.some((l) => l.event === "spoof_event");
        test("No spoof events (normal mode)", noSpoofs);

        test("Has server_start", parsedLogs.some((l) => l.event === "server_start"));
        test("Has tool_called", parsedLogs.some((l) => l.event === "tool_called"));

        // cleanup
        serverProcess.stdin.end();
        await new Promise((resolve) => serverProcess.on("close", resolve));

        console.log("\n" + "=".repeat(60));
        console.log(allPassed ? "🎉 All tests passed!" : "💥 Some tests failed");
        console.log("=".repeat(60));

        return allPassed;
    } catch (error) {
        console.error("❌ Test failed:", error.message);
        serverProcess.kill();
        return false;
    }
}

runTest()
    .then((passed) => process.exit(passed ? 0 : 1))
    .catch((err) => {
        console.error("Fatal:", err);
        process.exit(1);
    });
