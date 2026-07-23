const assert = require("node:assert/strict");
const { test } = require("node:test");

global.requestAnimationFrame = () => 0;
global.window = {
    devicePixelRatio: 1,
    requestAnimationFrame: global.requestAnimationFrame
};
global.HTMLDivElement = class {};
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

const { GGroup } = require("../../.test-build/ui/GGroup.js");
const { GList } = require("../../.test-build/ui/GList.js");
const { GroupLayoutType } = require("../../.test-build/ui/FieldTypes.js");
const { UIPackage } = require("../../.test-build/ui/UIPackage.js");

function createGroupHarness(layout, excludeInvisibles, children) {
    const group = Object.create(GGroup.prototype);
    group._layout = layout;
    group._excludeInvisibles = excludeInvisibles;
    group._boundsChanged = true;
    group._updating = 0;
    group._parent = {
        numChildren: children.length,
        getChildAt(index) {
            return children[index];
        }
    };
    group.setPosition = (x, y) => {
        group._x = x;
        group._y = y;
    };
    group.setSize = (width, height) => {
        group._rawWidth = width;
        group._rawHeight = height;
        group._width = width;
        group._height = height;
    };
    group.resizeChildren = () => {};
    return group;
}

test("group bounds retain invisible members when no layout is active", () => {
    const group = createGroupHarness(GroupLayoutType.None, true, []);
    const invisibleMember = {
        group,
        internalVisible3: false,
        xMin: 10,
        yMin: 20,
        width: 30,
        height: 40
    };
    group._parent.numChildren = 1;
    group._parent.getChildAt = () => invisibleMember;

    group.updateBounds();

    assert.deepEqual(
        { x: group.x, y: group.y, width: group.width, height: group.height },
        { x: 10, y: 20, width: 30, height: 40 }
    );
});

test("group bounds exclude invisible members for horizontal and vertical layouts", () => {
    for (const layout of [GroupLayoutType.Horizontal, GroupLayoutType.Vertical]) {
        const group = createGroupHarness(layout, true, []);
        const invisibleMember = {
            group,
            internalVisible3: false,
            xMin: 10,
            yMin: 20,
            width: 30,
            height: 40
        };
        group._parent.numChildren = 1;
        group._parent.getChildAt = () => invisibleMember;
        group._autoSizeDisabled = false;
        group.handleLayout = () => {};

        group.ensureBoundsCorrect();

        assert.deepEqual(
            { width: group.width, height: group.height },
            { width: 0, height: 0 }
        );
    }
});

test("list defaultItem is normalized like current FairyGUI-unity", () => {
    const original = UIPackage.normalizeURL;
    UIPackage.normalizeURL = (value) => `normalized:${value}`;
    try {
        const list = Object.create(GList.prototype);
        list.defaultItem = "Package/Item";
        assert.equal(list.defaultItem, "normalized:Package/Item");
    }
    finally {
        UIPackage.normalizeURL = original;
    }
});
