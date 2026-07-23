const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

installDomStubs();

const {
    UIPackage,
    UIPackageLoadError
} = require("../../dist/fairygui.js");

const fixturePath = path.join(
    __dirname,
    "..",
    "assets",
    "Package1",
    "package.xml"
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

function readFixture() {
    return fs.readFileSync(fixturePath);
}

function renamePackage(buffer, nextName) {
    const renamed = Buffer.from(buffer);
    const idLength = renamed.readUInt16BE(9);
    const nameLengthOffset = 11 + idLength;
    const nameLength = renamed.readUInt16BE(nameLengthOffset);
    assert.equal(Buffer.byteLength(nextName), nameLength);
    renamed.write(nextName, nameLengthOffset + 2, nameLength, "utf8");
    return renamed;
}

function changePackageId(buffer, nextId) {
    const changed = Buffer.from(buffer);
    const idLength = changed.readUInt16BE(9);
    assert.equal(Buffer.byteLength(nextId), idLength);
    changed.write(nextId, 11, idLength, "utf8");
    return changed;
}

test("loads and registers a UIPackage directly from an ArrayBuffer view", () => {
    const pkg = UIPackage.loadPackageFromBuffer(readFixture(), {
        source: "unit-test",
        resourceBaseURL: "assets/Package1"
    });

    try {
        assert.equal(pkg.id, "rbw1tv9t");
        assert.equal(pkg.name, "Package1");
        assert.equal(pkg.path, "assets/Package1/");
        assert.equal(UIPackage.getById("rbw1tv9t"), pkg);
        assert.equal(UIPackage.getByName("Package1"), pkg);

        const image = pkg.getItemById("o3dsl");
        assert.equal(image.name, "logo128");
        assert.equal(image.file, "assets/Package1/o3dsl.png");
        assert.equal(image.width, 256);
        assert.equal(image.height, 256);

        const component = pkg.getItemById("fvaib");
        assert.equal(component.name, "Main");
        assert.equal(component.file, null);
        assert.equal(component.rawData.length, 254);
        assert.equal(component.rawData.version, 5);
        assert.equal(component.rawData.stringTable.length, 11);
    }
    finally {
        UIPackage.removePackage("rbw1tv9t");
    }
});

test("returns the existing package for an identical repeated load", () => {
    const data = readFixture();
    const first = UIPackage.loadPackageFromBuffer(data, {
        source: "first-load",
        resourceBaseURL: "assets/Package1/"
    });

    try {
        const second = UIPackage.loadPackageFromBuffer(data, {
            source: "second-load",
            resourceBaseURL: "assets/Package1"
        });
        assert.equal(second, first);
    }
    finally {
        UIPackage.removePackage("rbw1tv9t");
    }
});

test("rejects a package ID collision with a structured load error", () => {
    UIPackage.loadPackageFromBuffer(readFixture(), {
        source: "first-load",
        resourceBaseURL: "assets/Package1"
    });

    try {
        assert.throws(
            () => UIPackage.loadPackageFromBuffer(
                renamePackage(readFixture(), "Package2"),
                {
                    source: "conflicting-load",
                    resourceBaseURL: "assets/Package2"
                }
            ),
            (error) => {
                assert.ok(error instanceof UIPackageLoadError);
                assert.equal(error.code, "PACKAGE_ID_CONFLICT");
                assert.equal(error.source, "conflicting-load");
                assert.equal(error.packageId, "rbw1tv9t");
                assert.equal(error.packageName, "Package2");
                assert.match(error.message, /Package1/);
                assert.match(error.message, /Package2/);
                return true;
            }
        );
    }
    finally {
        UIPackage.removePackage("rbw1tv9t");
    }
});

test("rejects a package name collision with a structured load error", () => {
    UIPackage.loadPackageFromBuffer(readFixture(), {
        source: "first-load",
        resourceBaseURL: "assets/Package1"
    });

    try {
        assert.throws(
            () => UIPackage.loadPackageFromBuffer(
                changePackageId(readFixture(), "abcdefgh"),
                {
                    source: "conflicting-load",
                    resourceBaseURL: "assets/Package2"
                }
            ),
            (error) => {
                assert.ok(error instanceof UIPackageLoadError);
                assert.equal(error.code, "PACKAGE_NAME_CONFLICT");
                assert.equal(error.packageId, "abcdefgh");
                assert.equal(error.packageName, "Package1");
                return true;
            }
        );
    }
    finally {
        UIPackage.removePackage("rbw1tv9t");
    }
});

test("rejects reloading the same package with a different resource base URL", () => {
    UIPackage.loadPackageFromBuffer(readFixture(), {
        source: "first-load",
        resourceBaseURL: "assets/Package1"
    });

    try {
        assert.throws(
            () => UIPackage.loadPackageFromBuffer(readFixture(), {
                source: "conflicting-load",
                resourceBaseURL: "other/Package1"
            }),
            (error) => {
                assert.ok(error instanceof UIPackageLoadError);
                assert.equal(error.code, "PACKAGE_PATH_CONFLICT");
                assert.equal(error.packageId, "rbw1tv9t");
                assert.equal(error.packageName, "Package1");
                return true;
            }
        );
    }
    finally {
        UIPackage.removePackage("rbw1tv9t");
    }
});
