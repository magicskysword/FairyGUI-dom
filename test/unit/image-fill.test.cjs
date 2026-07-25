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

const { fillImage } = require("../../.test-build/core/FillUtils.js");
const { Image } = require("../../.test-build/core/Image.js");
const {
    FillMethod,
    FillOrigin
} = require("../../.test-build/ui/FieldTypes.js");
const { GImage, GProgressBar } = require("../../dist/fairygui.js");

function assertFinitePolygon(points, width, height) {
    assert.ok(Array.isArray(points));
    assert.ok(points.length >= 6);
    assert.equal(points.length % 2, 0);
    for (let index = 0; index < points.length; index += 2) {
        assert.ok(Number.isFinite(points[index]));
        assert.ok(Number.isFinite(points[index + 1]));
        assert.ok(points[index] >= -0.000001 && points[index] <= width + 0.000001);
        assert.ok(points[index + 1] >= -0.000001 && points[index + 1] <= height + 0.000001);
    }
}

test("linear fill geometry preserves the full image bounds and crops by origin", () => {
    assert.deepEqual(
        fillImage(100, 50, FillMethod.Horizontal, FillOrigin.Left, true, 0.25),
        [0, 0, 25, 0, 25, 50, 0, 50]
    );
    assert.deepEqual(
        fillImage(100, 50, FillMethod.Horizontal, FillOrigin.Right, true, 0.25),
        [100, 0, 100, 50, 75, 50, 75, 0]
    );
    assert.deepEqual(
        fillImage(80, 40, FillMethod.Vertical, FillOrigin.Top, true, 0.25),
        [0, 0, 0, 10, 80, 10, 80, 0]
    );
    assert.deepEqual(
        fillImage(80, 40, FillMethod.Vertical, FillOrigin.Bottom, true, 0.25),
        [0, 40, 80, 40, 80, 30, 0, 30]
    );
});

test("radial geometry covers every method, origin, direction, and boundary amount", () => {
    assert.equal(fillImage(100, 80, FillMethod.Radial360, FillOrigin.Top, true, 0), null);
    assert.deepEqual(
        fillImage(100, 80, FillMethod.Radial360, FillOrigin.Top, true, 1),
        [0, 0, 100, 0, 100, 80, 0, 80]
    );
    assert.deepEqual(
        fillImage(100, 100, FillMethod.Radial90, FillOrigin.TopLeft, true, 0.5),
        [0, 0, 100, 100, 100, 0]
    );

    const cases = [
        [FillMethod.Radial90, [FillOrigin.TopLeft, FillOrigin.TopRight, FillOrigin.BottomLeft, FillOrigin.BottomRight]],
        [FillMethod.Radial180, [FillOrigin.Top, FillOrigin.Bottom, FillOrigin.Left, FillOrigin.Right]],
        [FillMethod.Radial360, [FillOrigin.Top, FillOrigin.Bottom, FillOrigin.Left, FillOrigin.Right]]
    ];
    for (const [method, origins] of cases) {
        for (const origin of origins) {
            const clockwise = fillImage(120, 80, method, origin, true, 0.37);
            const counterClockwise = fillImage(120, 80, method, origin, false, 0.37);
            assertFinitePolygon(clockwise, 120, 80);
            assertFinitePolygon(counterClockwise, 120, 80);
            assert.notDeepEqual(clockwise, counterClockwise);
        }
    }
});

test("Image fill state recomputes clip-path without changing element size", () => {
    const image = new Image();
    image.setSize(180, 180);
    image.fillMethod = FillMethod.Radial360;
    image.fillOrigin = FillOrigin.Top;
    image.fillClockwise = true;
    image.fillAmount = 0.6;

    assert.equal(image.fillMethod, FillMethod.Radial360);
    assert.equal(image.fillOrigin, FillOrigin.Top);
    assert.equal(image.fillClockwise, true);
    assert.equal(image.fillAmount, 0.6);
    assert.equal(image.style.width, "180px");
    assert.equal(image.style.height, "180px");
    assert.match(image.style.clipPath, /^polygon\(/);

    const squareClipPath = image.style.clipPath;
    image.setSize(360, 180);
    assert.equal(image.style.width, "360px");
    assert.equal(image.style.height, "180px");
    assert.notEqual(image.style.clipPath, squareClipPath);

    image.fillAmount = 0;
    assert.equal(image.style.clipPath, "polygon(0px 0px, 0px 0px, 0px 0px)");
    image.fillAmount = 1;
    assert.equal(image.style.clipPath, "none");
    image.fillMethod = FillMethod.None;
    assert.equal(image.style.clipPath, "none");
});

test("radial progress updates fillAmount and keeps the bar width", () => {
    const imageElement = new Image();
    imageElement.setSize(180, 180);
    const bar = Object.create(GImage.prototype);
    bar._element = imageElement;
    let width = 180;
    Object.defineProperty(bar, "width", {
        configurable: true,
        get() {
            return width;
        },
        set(value) {
            width = value;
        }
    });
    bar.fillMethod = FillMethod.Radial360;

    const progress = Object.create(GProgressBar.prototype);
    progress._min = 0;
    progress._max = 100;
    progress._width = 180;
    progress._height = 180;
    progress._barMaxWidthDelta = 0;
    progress._barMaxHeightDelta = 0;
    progress._barObjectH = bar;
    progress._barObjectV = null;
    progress._titleObject = null;
    progress._aniObject = null;
    progress._reverse = false;

    progress.update(60);

    assert.equal(width, 180);
    assert.equal(bar.fillAmount, 0.6);
    assert.match(imageElement.style.clipPath, /^polygon\(/);
});
