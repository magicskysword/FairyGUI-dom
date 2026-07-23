const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const repositoryRoot = path.join(__dirname, "..", "..");
const scanner = path.join(
    repositoryRoot,
    "test",
    "corpus",
    "scan-package-corpus.cjs"
);
const fixtureDirectory = path.join(
    repositoryRoot,
    "test",
    "fixtures",
    "openfairygui-0.1.1"
);

test("scans a configurable release directory and emits structured JSON", () => {
    const child = spawnSync(
        process.execPath,
        [
            scanner,
            "--release-dir",
            fixtureDirectory,
            "--expected-count",
            "1"
        ],
        {
            cwd: repositoryRoot,
            encoding: "utf8"
        }
    );

    assert.equal(child.status, 0, child.stderr);
    const result = JSON.parse(child.stdout);
    assert.equal(result.ok, true);
    assert.equal(result.packageCount, 1);
    assert.equal(result.itemCount, 3);
    assert.equal(result.spriteCount, 1);
    assert.equal(result.pixelHitTestCount, 0);
    assert.deepEqual(result.versions, { "7": 1 });
    assert.deepEqual(
        result.packages.map(pkg => pkg.name),
        ["BundleUsage"]
    );
});

test("rejects a mismatched expected package count with one stable code", () => {
    const child = spawnSync(
        process.execPath,
        [
            scanner,
            "--release-dir",
            fixtureDirectory,
            "--expected-count",
            "2"
        ],
        {
            cwd: repositoryRoot,
            encoding: "utf8"
        }
    );

    assert.equal(child.status, 1);
    const result = JSON.parse(child.stderr);
    assert.equal(result.ok, false);
    assert.equal(result.code, "CORPUS_SCAN_FAILED");
    assert.match(result.message, /Expected 2 package\(s\), found 1/);
});
