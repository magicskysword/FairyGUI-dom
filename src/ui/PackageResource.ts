import { PackageItem, PackageItemSprite } from "./PackageItem";

export type PackageResourceState =
    | "ready"
    | "loading"
    | "failed"
    | "disposed";

export interface PackageFileResourceRequest {
    readonly kind: "file";
    readonly packageId: string;
    readonly packageName: string;
    readonly item: PackageItem;
    readonly sourceURL: string;
}

export interface PackageSpriteResourceRequest {
    readonly kind: "sprite";
    readonly packageId: string;
    readonly packageName: string;
    readonly item: PackageItem | null;
    readonly sprite: PackageItemSprite;
    readonly sourceURL: string;
}

export type PackageResourceRequest =
    | PackageFileResourceRequest
    | PackageSpriteResourceRequest;

export interface PackageResourceResolver {
    resolve(request: PackageResourceRequest): string | Promise<string>;
    release?(request: PackageResourceRequest, resolvedURL: string): void;
}

export type PackageResourceDiagnosticCode =
    | "RESOURCE_RESOLUTION_FAILED"
    | "INVALID_RESOURCE_RESULT"
    | "ATLAS_RESOURCE_UNAVAILABLE"
    | "RESOURCE_RELEASE_FAILED";

export interface PackageResourceDiagnostic {
    readonly code: PackageResourceDiagnosticCode;
    readonly message: string;
    readonly requestKind: "file" | "sprite";
    readonly itemId: string;
    readonly itemName: string | null;
    readonly sourceURL: string;
}

export class UIPackageResourceError extends Error {
    public readonly code: "RESOURCE_LOADING_FAILED";
    public readonly packageId: string;
    public readonly packageName: string;
    public readonly diagnostics: ReadonlyArray<PackageResourceDiagnostic>;

    public constructor(
        packageId: string,
        packageName: string,
        diagnostics: ReadonlyArray<PackageResourceDiagnostic>
    ) {
        super(
            "Cannot finish loading resources for FairyGUI package \""
                + packageName
                + "\" ("
                + packageId
                + "): "
                + diagnostics.length
                + " resource error(s)."
        );
        this.name = "UIPackageResourceError";
        this.code = "RESOURCE_LOADING_FAILED";
        this.packageId = packageId;
        this.packageName = packageName;
        this.diagnostics = diagnostics;
        Object.setPrototypeOf(this, UIPackageResourceError.prototype);
    }
}

export class UIPackageDisposedError extends Error {
    public readonly code: "PACKAGE_DISPOSED";
    public readonly packageId: string;
    public readonly packageName: string;

    public constructor(packageId: string, packageName: string) {
        super(
            "FairyGUI package \""
                + packageName
                + "\" ("
                + packageId
                + ") has been disposed."
        );
        this.name = "UIPackageDisposedError";
        this.code = "PACKAGE_DISPOSED";
        this.packageId = packageId;
        this.packageName = packageName;
        Object.setPrototypeOf(this, UIPackageDisposedError.prototype);
    }
}
