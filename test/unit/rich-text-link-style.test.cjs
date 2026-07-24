const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const stageSource = fs.readFileSync(
    path.join(__dirname, "..", "..", "src", "core", "Stage.ts"),
    "utf8"
);

test("default UBB links inherit the owning rich-text color", () => {
    assert.match(stageSource, /\.fgui-link\s*\{\s*color:\s*inherit\s*;?\s*\}/);
    assert.match(
        stageSource,
        /\.fgui-link:hover\s*\{\s*color:\s*inherit\s*;?\s*\}/
    );
});
