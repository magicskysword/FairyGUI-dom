export type FairyGUIDomCapabilityState = "implemented" | "planned";
export type FairyGUIDomCapabilityAccess = "read-write" | "read-only";
export type FairyGUIDomFidelity = "structural-preview";

export interface FairyGUIDomCapability {
    readonly id: string;
    readonly state: FairyGUIDomCapabilityState;
    readonly access: FairyGUIDomCapabilityAccess;
    readonly fidelity: FairyGUIDomFidelity;
}

function capability(
    id: string,
    state: FairyGUIDomCapabilityState,
    access: FairyGUIDomCapabilityAccess
): FairyGUIDomCapability {
    return Object.freeze({
        id,
        state,
        access,
        fidelity: "structural-preview" as FairyGUIDomFidelity
    });
}

/**
 * Authoring capabilities shared with FairyGUI-MCP-Headless.
 *
 * This registry describes the V1 editable surface rather than every runtime
 * feature already present in FairyGUI-dom.
 */
export const FAIRYGUI_DOM_CAPABILITIES: readonly FairyGUIDomCapability[] = Object.freeze([
    capability("node.image", "implemented", "read-write"),
    capability("node.text", "implemented", "read-write"),
    capability("node.rich-text", "implemented", "read-write"),
    capability("node.input-text", "implemented", "read-write"),
    capability("node.loader", "implemented", "read-write"),
    capability("node.graph", "implemented", "read-write"),
    capability("node.movie-clip", "implemented", "read-write"),
    capability("node.group", "implemented", "read-write"),
    capability("node.list-static", "implemented", "read-write"),
    capability("node.instance", "implemented", "read-write"),
    capability("node.component-root", "implemented", "read-write"),
    capability("layout.absolute", "implemented", "read-write"),
    capability("layout.relations", "implemented", "read-write"),
    capability("layout.component-overflow", "implemented", "read-write"),
    capability("layout.list-static", "implemented", "read-write"),
    capability("layout.group", "implemented", "read-write"),
    capability("node.tree", "planned", "read-only"),
    capability("list.virtual", "planned", "read-only"),
    capability("layout.controller-gear", "planned", "read-only"),
    capability("animation.transition", "planned", "read-only"),
    capability("node.loader3d", "planned", "read-only"),
    capability("resource.skeleton", "planned", "read-only"),
    capability("extension.custom", "planned", "read-only")
]);

const CAPABILITIES_BY_ID = new Map(
    FAIRYGUI_DOM_CAPABILITIES.map((entry) => [entry.id, entry] as const)
);

export function getFairyGUIDomCapability(id: string): FairyGUIDomCapability | undefined {
    return CAPABILITIES_BY_ID.get(id);
}

