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

test("npm trusted publishing is tokenless and version-gated", () => {
    const workflow = fs.readFileSync(
        path.join(root, ".github", "workflows", "publish.yml"),
        "utf8"
    );

    assert.match(workflow, /tags:\s*\r?\n\s*-\s*["']npm-v\*["']/);
    assert.match(workflow, /id-token:\s*write/);
    assert.match(workflow, /contents:\s*read/);
    assert.match(workflow, /actions\/checkout@v6/);
    assert.match(workflow, /actions\/setup-node@v6/);
    assert.match(workflow, /node-version:\s*["']24["']/);
    assert.match(workflow, /package-manager-cache:\s*false/);
    assert.match(workflow, /package\.json/);
    assert.match(workflow, /pnpm test/);
    assert.match(workflow, /npm publish \. --access public/);
    assert.doesNotMatch(workflow, /NODE_AUTH_TOKEN|NPM_TOKEN|--provenance/);
});
