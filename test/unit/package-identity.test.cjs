const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..", "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

test("fork package exposes the published magicskysword identity", () => {
    assert.equal(manifest.name, "@magicskysword/fairygui-dom");
    assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
    assert.equal(
        manifest.repository.url,
        "git+https://github.com/magicskysword/FairyGUI-dom.git"
    );
});

test("published dependencies use portable registry semver references", () => {
    for (const [name, version] of Object.entries(manifest.dependencies || {})) {
        assert.doesNotMatch(version, /^(?:file|link|workspace):/, name);
        assert.doesNotMatch(version, /[\\/]/, name);
    }
});

