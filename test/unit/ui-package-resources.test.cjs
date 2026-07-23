const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

installDomStubs();

const {
    UIPackage,
    UIPackageResourceError
} = require("../../dist/fairygui.js");

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

function readFixture() {
    const fixture = manifest.fixtures.BundleUsage;
    const encoded = fs.readFileSync(
        path.join(fixtureDirectory, fixture.file),
        "utf8"
    );
    return Buffer.from(encoded.trim(), "base64");
}

test("resolves package files and atlas sprites through one injectable resolver", async () => {
    const requests = [];
    const resolver = {
        resolve(request) {
            requests.push(request);
            if (request.kind === "file")
                return "memory://file/" + request.item.id;
            return "memory://sprite/" + request.sprite.itemId;
        }
    };
    const pkg = UIPackage.loadPackageFromBuffer(readFixture(), {
        source: "BundleUsage_fui.bytes",
        resourceBaseURL: "fixtures/BundleUsage",
        resourceResolver: resolver
    });

    try {
        assert.equal(pkg.resourceState, "loading");
        assert.deepEqual(pkg.getResourceDiagnostics(), []);

        await pkg.waitForResources();

        const atlas = pkg.getItemById("atlas0");
        const image = pkg.getItemById("fou91");
        assert.equal(pkg.resourceState, "ready");
        assert.equal(
            pkg.getItemAssetURL(atlas),
            "memory://file/atlas0"
        );
        assert.equal(
            pkg.getItemAssetURL(image),
            "memory://sprite/fou91"
        );
        assert.equal(
            pkg.getSpriteAssetURL("fou91"),
            "memory://sprite/fou91"
        );
        assert.deepEqual(pkg.getResourceDiagnostics(), []);
        assert.deepEqual(
            requests.map(request => ({
                kind: request.kind,
                itemId: request.kind === "file"
                    ? request.item.id
                    : request.sprite.itemId,
                sourceURL: request.sourceURL
            })),
            [
                {
                    kind: "file",
                    itemId: "atlas0",
                    sourceURL: "fixtures/BundleUsage/atlas0.png"
                },
                {
                    kind: "sprite",
                    itemId: "fou91",
                    sourceURL: "memory://file/atlas0"
                }
            ]
        );
    }
    finally {
        UIPackage.removePackage("d8m5tmok");
    }
});

test("reports deterministic diagnostics when an atlas cannot be resolved", async () => {
    const pkg = UIPackage.loadPackageFromBuffer(readFixture(), {
        source: "broken/BundleUsage_fui.bytes",
        resourceBaseURL: "broken/BundleUsage",
        resourceResolver: {
            resolve(request) {
                if (request.kind === "file")
                    throw new Error("fixture atlas is missing");
                return "unexpected://sprite";
            }
        }
    });

    try {
        await assert.rejects(
            pkg.waitForResources(),
            error => {
                assert.ok(error instanceof UIPackageResourceError);
                assert.equal(error.code, "RESOURCE_LOADING_FAILED");
                assert.equal(error.packageId, "d8m5tmok");
                assert.equal(error.packageName, "BundleUsage");
                assert.equal(error.diagnostics.length, 2);
                assert.deepEqual(
                    error.diagnostics.map(diagnostic => ({
                        code: diagnostic.code,
                        requestKind: diagnostic.requestKind,
                        itemId: diagnostic.itemId,
                        sourceURL: diagnostic.sourceURL
                    })),
                    [
                        {
                            code: "RESOURCE_RESOLUTION_FAILED",
                            requestKind: "file",
                            itemId: "atlas0",
                            sourceURL: "broken/BundleUsage/atlas0.png"
                        },
                        {
                            code: "ATLAS_RESOURCE_UNAVAILABLE",
                            requestKind: "sprite",
                            itemId: "fou91",
                            sourceURL: "broken/BundleUsage/atlas0.png"
                        }
                    ]
                );
                return true;
            }
        );

        assert.equal(pkg.resourceState, "failed");
        assert.equal(pkg.getResourceDiagnostics().length, 2);
        await assert.rejects(pkg.waitForResources(), UIPackageResourceError);
    }
    finally {
        UIPackage.removePackage("d8m5tmok");
    }
});
