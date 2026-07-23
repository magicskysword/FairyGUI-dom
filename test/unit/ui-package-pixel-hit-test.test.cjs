const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

installDomStubs();

const { UIPackage } = require("../../dist/fairygui.js");
const manifest = require("../fixtures/unity-5.2/manifest.json");
const fixtureDirectory = path.join(
    __dirname,
    "..",
    "fixtures",
    "unity-5.2"
);

function installDomStubs() {
    class FakeHTMLDivElement {
        constructor() {
            this.id = "";
            this.style = {};
        }
    }

    global.HTMLDivElement = FakeHTMLDivElement;
    global.customElements = {
        get() {
            return undefined;
        },
        define() {
        }
    };
    global.document = {
        createElement() {
            return new FakeHTMLDivElement();
        },
        body: {
            appendChild() {
            }
        }
    };
    global.window = {
        devicePixelRatio: 1,
        requestAnimationFrame() {
            return 1;
        },
        cancelAnimationFrame() {
        },
        screen: {
            width: 1920,
            height: 1080
        }
    };
    global.requestAnimationFrame = global.window.requestAnimationFrame;
    global.cancelAnimationFrame = global.window.cancelAnimationFrame;
}

function readFixture(name) {
    const fixture = manifest.fixtures[name];
    const encoded = fs.readFileSync(
        path.join(fixtureDirectory, fixture.file),
        "utf8"
    );
    const bytes = Buffer.from(encoded.replace(/\s+/g, ""), "base64");
    assert.equal(bytes.length, fixture.byteLength);
    assert.equal(
        crypto.createHash("sha256").update(bytes).digest("hex"),
        fixture.sha256
    );
    return bytes;
}

test("attaches Unity pixel hit-test data to image package items", () => {
    const fixture = manifest.fixtures.HitTest;
    const pkg = UIPackage.loadPackageFromBuffer(readFixture("HitTest"), {
        source: fixture.path,
        resourceBaseURL: "fixtures/HitTest"
    });

    try {
        const expected = [
            ["g40j8", 95, 855, [0, 0, 128, 7]],
            ["g40j9", 65, 683, [0, 0, 0, 0]],
            ["g40ja", 60, 630, [0, 0, 0, 0]]
        ];

        for (const [itemId, pixelWidth, byteLength, firstBytes] of expected) {
            const item = pkg.getItemById(itemId);
            const hitTest = item.pixelHitTestData;

            assert.ok(hitTest);
            assert.equal(hitTest.pixelWidth, pixelWidth);
            assert.equal(hitTest.scaleDenominator, 2);
            assert.equal(hitTest.scale, 0.5);
            assert.equal(hitTest.pixels.length, byteLength);
            assert.deepEqual(
                Array.from(hitTest.pixels.subarray(0, 4)),
                firstBytes
            );
        }
    }
    finally {
        UIPackage.removePackage("ezq9a8mh");
    }
});
