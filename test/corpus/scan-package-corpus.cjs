const fs = require("node:fs");
const path = require("node:path");

installDomStubs();

const {
    PackageDecoder,
    UIPackage
} = require("../../dist/fairygui.js");

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

function readArguments(argv) {
    const result = {
        releaseDir: null,
        expectedCount: null
    };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--release-dir")
            result.releaseDir = argv[++i] || null;
        else if (argv[i] === "--expected-count")
            result.expectedCount = Number(argv[++i]);
        else
            throw new Error("Unknown argument: " + argv[i]);
    }
    if (!result.releaseDir) {
        throw new Error(
            "Missing --release-dir <path>."
        );
    }
    if (
        result.expectedCount !== null
        && (
            !Number.isSafeInteger(result.expectedCount)
            || result.expectedCount < 0
        )
    ) {
        throw new Error("--expected-count must be a non-negative integer.");
    }
    return result;
}

function scanPackageCorpus(options) {
    const releaseDir = path.resolve(options.releaseDir);
    if (!fs.statSync(releaseDir).isDirectory())
        throw new Error("Release path is not a directory: " + releaseDir);

    const files = fs.readdirSync(releaseDir)
        .filter(file => file.endsWith("_fui.bytes"))
        .sort((left, right) => left.localeCompare(right));
    if (files.length === 0)
        throw new Error("No *_fui.bytes packages found in " + releaseDir);
    if (
        options.expectedCount !== null
        && files.length !== options.expectedCount
    ) {
        throw new Error(
            "Expected "
                + options.expectedCount
                + " package(s), found "
                + files.length
                + "."
        );
    }

    const result = {
        ok: true,
        releaseDir,
        packageCount: files.length,
        itemCount: 0,
        spriteCount: 0,
        pixelHitTestCount: 0,
        versions: {},
        packages: []
    };

    for (const file of files) {
        const source = path.join(releaseDir, file);
        const bytes = fs.readFileSync(source);
        const decoded = PackageDecoder.decode(bytes, { source });
        const pkg = UIPackage.loadPackageFromBuffer(bytes, {
            source,
            resourceBaseURL: path.join(
                releaseDir,
                decoded.name
            ),
            resourceResolver: null
        });

        try {
            for (const sprite of decoded.sprites) {
                if (!pkg.getSpriteByItemId(sprite.itemId)) {
                    throw new Error(
                        file
                            + " did not assemble sprite "
                            + sprite.itemId
                            + "."
                    );
                }
            }
            for (const hitTest of decoded.pixelHitTests) {
                const item = pkg.getItemById(hitTest.itemId);
                if (!item || !item.pixelHitTestData) {
                    throw new Error(
                        file
                            + " did not assemble pixel hit test "
                            + hitTest.itemId
                            + "."
                    );
                }
            }

            result.itemCount += decoded.items.length;
            result.spriteCount += decoded.sprites.length;
            result.pixelHitTestCount += decoded.pixelHitTests.length;
            result.versions[decoded.version] =
                (result.versions[decoded.version] || 0) + 1;
            result.packages.push({
                file,
                id: decoded.id,
                name: decoded.name,
                version: decoded.version,
                items: decoded.items.length,
                sprites: decoded.sprites.length,
                pixelHitTests: decoded.pixelHitTests.length
            });
        }
        finally {
            UIPackage.removePackage(pkg.id);
        }
    }

    return result;
}

try {
    const options = readArguments(process.argv.slice(2));
    const result = scanPackageCorpus(options);
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}
catch (error) {
    process.stderr.write(JSON.stringify({
        ok: false,
        code: "CORPUS_SCAN_FAILED",
        message: error instanceof Error ? error.message : String(error)
    }, null, 2) + "\n");
    process.exitCode = 1;
}
