const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

installDomStubs();

const {
    createUnityPackageResourceURLResolver,
    PackageDecoder,
    UIPackage
} = require("../../dist/fairygui.js");

const fixtureDirectory = path.join(
    __dirname,
    "..",
    "fixtures",
    "openfairygui-0.1.1"
);
const manifest = require(
    "../fixtures/openfairygui-0.1.1/manifest.json"
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

function readFixture(file) {
    return fs.readFileSync(path.join(fixtureDirectory, file));
}

test("tracks OpenFairyGUI publish outputs with exact provenance", () => {
    assert.equal(
        manifest.producer.commit,
        "d56053c378d1e68bed2db28d118c63945a771073"
    );
    assert.equal(
        manifest.source.commit,
        "8cc8f214cca79685532eef13372d0a4f74acdf08"
    );

    for (const entry of manifest.files) {
        const bytes = readFixture(entry.file);
        assert.equal(bytes.length, entry.byteLength, entry.file);
        assert.equal(
            crypto.createHash("sha256").update(bytes).digest("hex"),
            entry.sha256,
            entry.file
        );
    }
});

test("loads an OpenFairyGUI Unity publish with prefixed atlas URLs", async () => {
    const bytes = readFixture("BundleUsage_fui.bytes");
    const decoded = PackageDecoder.decode(bytes, {
        source: "OpenFairyGUI/BundleUsage_fui.bytes"
    });
    assert.equal(decoded.version, 7);
    assert.equal(decoded.name, "BundleUsage");

    const requests = [];
    const pkg = UIPackage.loadPackageFromBuffer(bytes, {
        source: "OpenFairyGUI/BundleUsage_fui.bytes",
        resourceBaseURL: "fixtures/openfairygui-0.1.1",
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
        assert.equal(pkg.resourceState, "ready");
        assert.deepEqual(pkg.getResourceDiagnostics(), []);
        assert.equal(pkg.getItemByName("Main").width, 1136);
        assert.equal(pkg.getItemByName("Main").height, 640);
        assert.equal(
            requests[0].sourceURL,
            "fixtures/openfairygui-0.1.1/BundleUsage_atlas0.png"
        );
        assert.equal(
            pkg.getItemAssetURL(pkg.getItemByName("sword")),
            "memory://sprite/fou91"
        );
    }
    finally {
        UIPackage.removePackage("d8m5tmok");
    }
});
