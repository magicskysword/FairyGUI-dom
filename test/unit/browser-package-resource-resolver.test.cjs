const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const browserDom = installBrowserDom();

const {
    BrowserPackageResourceResolver,
    PackageItemType,
    UIPackage
} = require("../../dist/fairygui.js");

const fixtureDirectory = path.join(
    __dirname,
    "..",
    "fixtures",
    "unity-5.2"
);
const manifest = require("../fixtures/unity-5.2/manifest.json");

function installBrowserDom() {
    const canvases = [];
    const revokedURLs = [];
    let blobSequence = 0;

    class FakeHTMLDivElement {
        constructor() {
            this.id = "";
            this.style = {};
        }
    }

    class FakeHTMLImageElement {
        constructor() {
            this.onload = null;
            this.onerror = null;
            this.naturalWidth = 1024;
            this.naturalHeight = 1024;
        }

        set src(value) {
            this._src = value;
            queueMicrotask(() => this.onload());
        }

        get src() {
            return this._src;
        }
    }

    class FakeHTMLCanvasElement {
        constructor() {
            this.width = 0;
            this.height = 0;
            this.operations = [];
            canvases.push(this);
        }

        getContext(kind) {
            assert.equal(kind, "2d");
            const operations = this.operations;
            return {
                save() {
                    operations.push(["save"]);
                },
                restore() {
                    operations.push(["restore"]);
                },
                translate(x, y) {
                    operations.push(["translate", x, y]);
                },
                rotate(radians) {
                    operations.push(["rotate", radians]);
                },
                drawImage(image, ...args) {
                    assert.ok(image instanceof FakeHTMLImageElement);
                    operations.push(["drawImage", ...args]);
                }
            };
        }

        toBlob(callback, type) {
            assert.equal(type, "image/png");
            callback(new Blob(["fake-png"], { type }));
        }
    }

    global.HTMLDivElement = FakeHTMLDivElement;
    global.HTMLImageElement = FakeHTMLImageElement;
    global.HTMLCanvasElement = FakeHTMLCanvasElement;
    global.customElements = {
        get() {
            return undefined;
        },
        define() {
        }
    };
    global.document = {
        createElement(tagName) {
            if (tagName === "img")
                return new FakeHTMLImageElement();
            if (tagName === "canvas")
                return new FakeHTMLCanvasElement();
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

    URL.createObjectURL = () => "blob:fixture-" + (++blobSequence);
    URL.revokeObjectURL = url => revokedURLs.push(url);

    return { canvases, revokedURLs };
}

function readFixture() {
    const fixture = manifest.fixtures.BundleUsage;
    const encoded = fs.readFileSync(
        path.join(fixtureDirectory, fixture.file),
        "utf8"
    );
    return Buffer.from(encoded.trim(), "base64");
}

test("uses the browser resolver by default and crops a Unity atlas sprite", async () => {
    const firstCanvasIndex = browserDom.canvases.length;
    const pkg = UIPackage.loadPackageFromBuffer(readFixture(), {
        source: "BundleUsage_fui.bytes",
        resourceBaseURL: "fixtures/BundleUsage"
    });

    try {
        assert.equal(pkg.resourceState, "loading");
        await pkg.waitForResources();

        const imageURL = pkg.getItemAssetURL(pkg.getItemById("fou91"));
        assert.match(imageURL, /^blob:fixture-/);

        const canvas = browserDom.canvases[firstCanvasIndex];
        assert.equal(canvas.width, 104);
        assert.equal(canvas.height, 512);
        assert.deepEqual(canvas.operations, [
            ["drawImage", 0, 0, 104, 512, 0, 0, 104, 512]
        ]);
    }
    finally {
        UIPackage.removePackage("d8m5tmok");
    }
});

test("restores a rotated atlas region into its unrotated output bounds", async () => {
    const firstCanvasIndex = browserDom.canvases.length;
    const resolver = new BrowserPackageResourceResolver();
    const atlasItem = {
        id: "atlas0",
        name: "atlas",
        type: PackageItemType.Atlas
    };
    const atlasURL = await resolver.resolve({
        kind: "file",
        packageId: "package1",
        packageName: "Package",
        item: atlasItem,
        sourceURL: "fixtures/atlas0.png"
    });
    const sprite = {
        itemId: "rotated1",
        atlas: atlasItem,
        x: 10,
        y: 20,
        width: 65,
        height: 81,
        rotated: true,
        offsetX: 2,
        offsetY: 3,
        originalWidth: 81,
        originalHeight: 65
    };
    const spriteRequest = {
        kind: "sprite",
        packageId: "package1",
        packageName: "Package",
        item: null,
        sprite,
        sourceURL: atlasURL
    };

    const spriteURL = await resolver.resolve(spriteRequest);

    assert.match(spriteURL, /^blob:fixture-/);
    const canvas = browserDom.canvases[firstCanvasIndex];
    assert.equal(canvas.width, 81);
    assert.equal(canvas.height, 65);
    assert.deepEqual(canvas.operations, [
        ["save"],
        ["translate", 2, 68],
        ["rotate", -Math.PI / 2],
        ["drawImage", 10, 20, 65, 81, 0, 0, 65, 81],
        ["restore"]
    ]);

    resolver.release(spriteRequest, spriteURL);
    assert.ok(browserDom.revokedURLs.includes(spriteURL));
});
