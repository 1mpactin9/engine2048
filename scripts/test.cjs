const { execSync } = require("node:child_process");
const fs = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const tmpFile = join(tmpdir(), `vitest-results-${Date.now()}.json`);

const exitCode = execSync(
  "npx vitest run --reporter=json --outputFile=" + tmpFile,
  { stdio: "ignore" },
);

const data = JSON.parse(fs.readFileSync(tmpFile, "utf8"));
const passed = data.numPassedTests;
const failed = data.numFailedTests;
const skipped = data.numPendingTests + data.numTodoTests;
const endTime = Math.max(...data.testResults.map(r => r.endTime ?? 0));
const durationMs = endTime - data.startTime;
const dur = (durationMs / 1000).toFixed(2);
const state = failed === 0 ? "ok" : "FAILED";

console.error(`test result: ${state}. ${passed} passed; ${failed} failed; ${skipped} skipped; finished in ${dur}s`);

fs.unlinkSync(tmpFile);
process.exitCode = exitCode;
