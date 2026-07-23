const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const {
    PackageDecoder,
    PackageDecodeError
} = require("../../.test-build/ui/PackageDecoder.js");

const fixturePath = path.join(
    __dirname,
    "..",
    "assets",
    "Package1",
    "package.xml"
);

function readFixture() {
    return fs.readFileSync(fixturePath);
}

function expectDecodeError(action, code) {
    assert.throws(action, (error) => {
        assert.ok(error instanceof PackageDecodeError);
        assert.equal(error.code, code);
        assert.equal(error.source, "unit-test");
        assert.ok(Number.isInteger(error.offset));
        assert.ok(error.offset >= 0);
        return true;
    });
}

test("decodes the existing FairyGUI v5 package into pure package data", () => {
    const decoded = PackageDecoder.decode(readFixture(), {
        source: "unit-test"
    });

    assert.equal(decoded.version, 5);
    assert.equal(decoded.compressed, false);
    assert.equal(decoded.id, "rbw1tv9t");
    assert.equal(decoded.name, "Package1");
    assert.deepEqual(decoded.dependencies, []);
    assert.deepEqual(decoded.branches, []);
    assert.equal(decoded.stringTable.length, 11);

    assert.deepEqual(
        decoded.items.map((item) => ({
            type: item.type,
            id: item.id,
            name: item.name,
            path: item.path,
            file: item.file,
            exported: item.exported,
            width: item.width,
            height: item.height
        })),
        [
            {
                type: 0,
                id: "o3dsl",
                name: "logo128",
                path: "/",
                file: "o3dsl.png",
                exported: false,
                width: 256,
                height: 256
            },
            {
                type: 3,
                id: "fvaib",
                name: "Main",
                path: "/",
                file: null,
                exported: true,
                width: 1136,
                height: 640
            }
        ]
    );

    assert.equal(decoded.items[0].smoothing, true);
    assert.equal(decoded.items[1].objectType, 9);
    assert.equal(decoded.items[1].rawData.length, 254);
    assert.deepEqual(decoded.sprites, []);
    assert.deepEqual(decoded.pixelHitTests, []);
});

test("honors the byte offset and length of an ArrayBuffer view", () => {
    const fixture = readFixture();
    const padded = Buffer.alloc(fixture.length + 8, 0xff);
    fixture.copy(padded, 3);
    const view = padded.subarray(3, 3 + fixture.length);

    const decoded = PackageDecoder.decode(view, { source: "unit-test" });

    assert.equal(decoded.id, "rbw1tv9t");
    assert.equal(decoded.name, "Package1");
});

test("rejects an invalid FairyGUI magic value with a structured error", () => {
    const invalid = Buffer.from(readFixture());
    invalid[0] = 0;

    expectDecodeError(
        () => PackageDecoder.decode(invalid, { source: "unit-test" }),
        "INVALID_MAGIC"
    );
});

test("rejects compressed packages explicitly until compression is supported", () => {
    const compressed = Buffer.from(readFixture());
    compressed[8] = 1;

    expectDecodeError(
        () => PackageDecoder.decode(compressed, { source: "unit-test" }),
        "UNSUPPORTED_COMPRESSION"
    );
});

test("reports truncated package data as a structured decode error", () => {
    const truncated = readFixture().subarray(0, 12);

    expectDecodeError(
        () => PackageDecoder.decode(truncated, { source: "unit-test" }),
        "TRUNCATED_DATA"
    );
});
