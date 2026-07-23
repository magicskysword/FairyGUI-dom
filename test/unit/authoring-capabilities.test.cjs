const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
    FAIRYGUI_DOM_CAPABILITIES,
    getFairyGUIDomCapability
} = require("../../.test-build/AuthoringCapabilities.js");
const {
    GroupLayoutType,
    ListLayoutType,
    RelationType
} = require("../../.test-build/ui/FieldTypes.js");

test("authoring capability registry declares a stable and unique contract", () => {
    const ids = FAIRYGUI_DOM_CAPABILITIES.map((capability) => capability.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(Object.isFrozen(FAIRYGUI_DOM_CAPABILITIES));

    assert.deepEqual(
        getFairyGUIDomCapability("layout.relations"),
        {
            id: "layout.relations",
            state: "implemented",
            access: "read-write",
            fidelity: "structural-preview"
        }
    );
    assert.deepEqual(
        getFairyGUIDomCapability("node.tree"),
        {
            id: "node.tree",
            state: "planned",
            access: "read-only",
            fidelity: "structural-preview"
        }
    );
    assert.equal(getFairyGUIDomCapability("unknown"), undefined);
});

test("implemented layout registry covers all 25 relations and five static list layouts", () => {
    const relationValues = Object.values(RelationType)
        .filter((value) => typeof value === "number");
    const listLayoutValues = Object.values(ListLayoutType)
        .filter((value) => typeof value === "number");
    const groupLayoutValues = Object.values(GroupLayoutType)
        .filter((value) => typeof value === "number");

    assert.equal(relationValues.length, 25);
    assert.deepEqual(relationValues, Array.from({ length: 25 }, (_, index) => index));
    assert.deepEqual(listLayoutValues, [0, 1, 2, 3, 4]);
    assert.deepEqual(groupLayoutValues, [0, 1, 2]);
});

test("advanced authoring domains remain explicit read-only planned capabilities", () => {
    const plannedIds = [
        "node.tree",
        "list.virtual",
        "layout.controller-gear",
        "animation.transition",
        "node.loader3d",
        "resource.skeleton",
        "extension.custom"
    ];

    for (const id of plannedIds) {
        const capability = getFairyGUIDomCapability(id);
        assert.ok(capability, id);
        assert.equal(capability.state, "planned", id);
        assert.equal(capability.access, "read-only", id);
    }
});

