const assert = require("node:assert/strict");
const { test } = require("node:test");

global.requestAnimationFrame = () => 0;
global.window = {
    devicePixelRatio: 1,
    requestAnimationFrame: global.requestAnimationFrame
};
global.HTMLDivElement = class {
    constructor() {
        this.style = {};
    }
};
global.document = {
    createElement() {
        return { style: {} };
    }
};
global.customElements = {
    get() {
        return undefined;
    },
    define() {}
};

const { UIElement } = require("../../.test-build/core/UIElement.js");
const { FlipType } = require("../../.test-build/ui/FieldTypes.js");

test("pivot setters preserve position and use percentage transform-origin", () => {
    const element = new UIElement();
    element.setPosition(37, 49);
    element.setPivot(0.25, 0.75);

    assert.equal(element.x, 37);
    assert.equal(element.y, 49);
    assert.equal(element.pivotX, 0.25);
    assert.equal(element.pivotY, 0.75);
    assert.equal(element.style.transformOrigin, "25% 75%");

    element.pivotY = 0.5;

    assert.equal(element.x, 37);
    assert.equal(element.y, 49);
    assert.equal(element.pivotX, 0.25);
    assert.equal(element.pivotY, 0.5);
    assert.equal(element.style.transformOrigin, "25% 50%");
});

test("flipped elements use a valid centered CSS transform-origin", () => {
    let scheduled;
    window.requestAnimationFrame = (callback) => {
        scheduled = callback;
        return 1;
    };

    const element = new UIElement();
    element.flip = FlipType.Horizontal;
    assert.equal(typeof scheduled, "function");
    scheduled();

    assert.equal(element.style.transformOrigin, "50% 50%");
});
