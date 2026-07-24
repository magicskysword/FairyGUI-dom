const assert = require("node:assert/strict");
const { test } = require("node:test");

installDomStubs();

const {
    PackageItem,
    UIConfig
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

test("high-resolution resources fall back to the highest available scale", () => {
    const base = new PackageItem();
    const highResolution = new PackageItem();
    const items = new Map([["image2x", highResolution]]);
    base.owner = {
        _branchIndex: -1,
        getItemById(id) {
            return items.get(id);
        }
    };
    base.highResolution = ["image2x"];

    const previousScaleLevel = UIConfig.scaleLevel;
    try {
        UIConfig.scaleLevel = 3;
        assert.equal(base.getHighResolution(), highResolution);
    }
    finally {
        UIConfig.scaleLevel = previousScaleLevel;
    }
});
