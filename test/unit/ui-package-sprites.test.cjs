const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

installDomStubs();

const { UIPackage } = require("../../dist/fairygui.js");

const fixtureDirectory = path.join(
    __dirname,
    "..",
    "fixtures",
    "unity-5.2"
);
const manifest = require("../fixtures/unity-5.2/manifest.json");

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
    const bytes = Buffer.from(encoded.trim(), "base64");
    assert.equal(bytes.length, fixture.byteLength);
    assert.equal(
        crypto.createHash("sha256").update(bytes).digest("hex"),
        fixture.sha256
    );
    return bytes;
}

test("assembles Unity atlas sprite metadata onto package image items", () => {
    const fixture = manifest.fixtures.BundleUsage;
    const pkg = UIPackage.loadPackageFromBuffer(readFixture("BundleUsage"), {
        source: fixture.path,
        resourceBaseURL: "fixtures/BundleUsage"
    });

    try {
        assert.equal(pkg.id, "d8m5tmok");
        assert.equal(pkg.name, "BundleUsage");

        const image = pkg.getItemById("fou91");
        const atlas = pkg.getItemById("atlas0");
        const sprite = pkg.getSpriteByItemId("fou91");

        assert.equal(image.name, "sword");
        assert.equal(image.file, null);
        assert.equal(atlas.file, "fixtures/BundleUsage/atlas0.png");
        assert.ok(sprite);
        assert.equal(image.sprite, sprite);
        assert.equal(sprite.itemId, "fou91");
        assert.equal(sprite.atlas, atlas);
        assert.deepEqual(
            {
                x: sprite.x,
                y: sprite.y,
                width: sprite.width,
                height: sprite.height,
                rotated: sprite.rotated,
                offsetX: sprite.offsetX,
                offsetY: sprite.offsetY,
                originalWidth: sprite.originalWidth,
                originalHeight: sprite.originalHeight
            },
            {
                x: 0,
                y: 0,
                width: 104,
                height: 512,
                rotated: false,
                offsetX: 0,
                offsetY: 0,
                originalWidth: 104,
                originalHeight: 512
            }
        );
    }
    finally {
        UIPackage.removePackage("d8m5tmok");
    }
});

test("keeps Unity movie-clip frame sprites that have no top-level package item", () => {
    const fixture = manifest.fixtures.Model;
    const pkg = UIPackage.loadPackageFromBuffer(readFixture("Model"), {
        source: fixture.path,
        resourceBaseURL: "fixtures/Model"
    });

    try {
        const atlas = pkg.getItemById("atlas0");
        const internalSprite = pkg.getSpriteByItemId("rpol2_7");

        assert.equal(pkg.getItemById("rpol2_7"), undefined);
        assert.ok(internalSprite);
        assert.equal(internalSprite.itemId, "rpol2_7");
        assert.equal(internalSprite.atlas, atlas);
        assert.equal(internalSprite.rotated, true);
        assert.equal(internalSprite.width, 65);
        assert.equal(internalSprite.height, 81);
        assert.equal(internalSprite.originalWidth, 81);
        assert.equal(internalSprite.originalHeight, 65);
    }
    finally {
        UIPackage.removePackage("qef31w6w");
    }
});
