const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

installDomStubs();

const {
    createUnityPackageResourceURLResolver,
    UIPackage,
    UIPackageDisposedError,
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

test("maps Unity-prefixed resource file names before browser resolution", async () => {
    const requests = [];
    const pkg = UIPackage.loadPackageFromBuffer(readFixture(), {
        source: "BundleUsage_fui.bytes",
        resourceBaseURL: "release",
        resourceURLResolver: createUnityPackageResourceURLResolver(),
        resourceResolver: {
            resolve(request) {
                requests.push(request);
                return request.kind === "file"
                    ? request.sourceURL
                    : "memory://sprite/" + request.sprite.itemId;
            }
        }
    });

    try {
        await pkg.waitForResources();
        assert.equal(
            requests[0].sourceURL,
            "release/BundleUsage_atlas0.png"
        );
        assert.equal(
            pkg.getItemAssetURL(pkg.getItemById("atlas0")),
            "release/BundleUsage_atlas0.png"
        );
    }
    finally {
        UIPackage.removePackage("d8m5tmok");
    }
});

test("rejects an empty custom resource URL before package registration", () => {
    assert.throws(
        () => UIPackage.loadPackageFromBuffer(readFixture(), {
            source: "BundleUsage_fui.bytes",
            resourceBaseURL: "release",
            resourceURLResolver() {
                return "";
            },
            resourceResolver: null
        }),
        error => {
            assert.equal(error.name, "UIPackageLoadError");
            assert.equal(error.code, "INVALID_RESOURCE_URL");
            assert.equal(error.packageId, "d8m5tmok");
            return true;
        }
    );
    assert.equal(UIPackage.getById("d8m5tmok"), undefined);
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

test("releases resolved resources and rejects resource access after disposal", async () => {
    const released = [];
    const resolver = {
        resolve(request) {
            return request.kind === "file"
                ? "memory://file/" + request.item.id
                : "memory://sprite/" + request.sprite.itemId;
        },
        release(request, resolvedURL) {
            released.push({
                kind: request.kind,
                itemId: request.kind === "file"
                    ? request.item.id
                    : request.sprite.itemId,
                resolvedURL
            });
        }
    };
    const pkg = UIPackage.loadPackageFromBuffer(readFixture(), {
        source: "BundleUsage_fui.bytes",
        resourceBaseURL: "fixtures/BundleUsage",
        resourceResolver: resolver
    });
    await pkg.waitForResources();
    const image = pkg.getItemById("fou91");

    UIPackage.removePackage("d8m5tmok");
    pkg.dispose();

    assert.equal(pkg.resourceState, "disposed");
    assert.equal(UIPackage.getById("d8m5tmok"), undefined);
    assert.deepEqual(released, [
        {
            kind: "sprite",
            itemId: "fou91",
            resolvedURL: "memory://sprite/fou91"
        },
        {
            kind: "file",
            itemId: "atlas0",
            resolvedURL: "memory://file/atlas0"
        }
    ]);
    await assert.rejects(
        pkg.waitForResources(),
        error => error instanceof UIPackageDisposedError
            && error.code === "PACKAGE_DISPOSED"
    );
    assert.throws(
        () => pkg.getItemAssetURL(image),
        UIPackageDisposedError
    );
});

test("atomically replaces a loaded package only after reload resources succeed", async () => {
    const oldReleased = [];
    const oldPackage = UIPackage.loadPackageFromBuffer(readFixture(), {
        source: "old/BundleUsage_fui.bytes",
        resourceBaseURL: "fixtures/BundleUsage",
        resourceResolver: {
            resolve(request) {
                return request.kind === "file"
                    ? "memory://old-file/" + request.item.id
                    : "memory://old-sprite/" + request.sprite.itemId;
            },
            release(request, resolvedURL) {
                oldReleased.push(resolvedURL);
            }
        }
    });
    await oldPackage.waitForResources();

    const reloadPromise = UIPackage.reloadPackageFromBuffer(
        "d8m5tmok",
        readFixture(),
        {
            source: "new/BundleUsage_fui.bytes",
            resourceBaseURL: "fixtures/BundleUsage",
            resourceResolver: {
                resolve(request) {
                    return request.kind === "file"
                        ? "memory://new-file/" + request.item.id
                        : "memory://new-sprite/" + request.sprite.itemId;
                }
            }
        }
    );

    assert.equal(UIPackage.getById("d8m5tmok"), oldPackage);
    const newPackage = await reloadPromise;

    try {
        assert.notEqual(newPackage, oldPackage);
        assert.equal(UIPackage.getById("d8m5tmok"), newPackage);
        assert.equal(UIPackage.getByName("BundleUsage"), newPackage);
        assert.equal(oldPackage.resourceState, "disposed");
        assert.deepEqual(oldReleased, [
            "memory://old-sprite/fou91",
            "memory://old-file/atlas0"
        ]);
        assert.equal(
            newPackage.getItemAssetURL(newPackage.getItemById("fou91")),
            "memory://new-sprite/fou91"
        );
    }
    finally {
        UIPackage.removePackage("d8m5tmok");
    }
});

test("keeps the old package registered when reload resources fail", async () => {
    const oldPackage = UIPackage.loadPackageFromBuffer(readFixture(), {
        source: "old/BundleUsage_fui.bytes",
        resourceBaseURL: "fixtures/BundleUsage",
        resourceResolver: {
            resolve(request) {
                return request.sourceURL;
            }
        }
    });
    await oldPackage.waitForResources();

    try {
        await assert.rejects(
            UIPackage.reloadPackageFromBuffer(
                "BundleUsage",
                readFixture(),
                {
                    source: "broken/BundleUsage_fui.bytes",
                    resourceBaseURL: "fixtures/BundleUsage",
                    resourceResolver: {
                        resolve() {
                            throw new Error("reload fixture is broken");
                        }
                    }
                }
            ),
            UIPackageResourceError
        );

        assert.equal(UIPackage.getById("d8m5tmok"), oldPackage);
        assert.equal(oldPackage.resourceState, "ready");
    }
    finally {
        UIPackage.removePackage("d8m5tmok");
    }
});
