const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const fixtureDirectory = path.join(
    __dirname,
    "..",
    "fixtures",
    "unity-5.2"
);
const manifest = require("../fixtures/unity-5.2/manifest.json");

test("tracks every copied Unity fixture asset with length and checksum", () => {
    for (const fixture of Object.values(manifest.fixtures)) {
        verifyFile(fixture.file, fixture.byteLength, fixture.sha256, true);
        for (const asset of fixture.assets || []) {
            verifyFile(
                asset.file,
                asset.byteLength,
                asset.sha256,
                false
            );
        }
    }
});

function verifyFile(file, byteLength, sha256, base64Encoded) {
    const source = fs.readFileSync(path.join(fixtureDirectory, file));
    const bytes = base64Encoded
        ? Buffer.from(source.toString("utf8").trim(), "base64")
        : source;
    assert.equal(bytes.length, byteLength, file);
    assert.equal(
        crypto.createHash("sha256").update(bytes).digest("hex"),
        sha256,
        file
    );
}
