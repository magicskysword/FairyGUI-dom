import { PackageItemType } from "./FieldTypes";
import { constructingDepth, GObject } from "./GObject";
import { PackageItem, PackageItemSprite } from "./PackageItem";
import { ByteBuffer } from "../utils/ByteBuffer";
import { HttpRequest } from "../utils/HttpRequest";
import { Event } from "../event/Event";
import { Margin } from "../math/Margin";
import { Constructor } from "../utils/ToolSet";
import {
    DecodedPackage,
    PackageBinaryData,
    PackageDecodeOptions,
    PackageDecoder
} from "./PackageDecoder";
import {
    PackageFileResourceRequest,
    PackageResourceDiagnostic,
    PackageResourceResolver,
    PackageResourceState,
    PackageSpriteResourceRequest,
    UIPackageResourceError
} from "./PackageResource";

type PackageDependency = { id: string, name: string };

export interface UIPackageLoadOptions extends PackageDecodeOptions {
    resourceBaseURL?: string;
    resourceResolver?: PackageResourceResolver;
}

export type UIPackageLoadErrorCode =
    | "PACKAGE_ID_CONFLICT"
    | "PACKAGE_NAME_CONFLICT"
    | "PACKAGE_PATH_CONFLICT"
    | "INVALID_SPRITE_REFERENCE"
    | "DUPLICATE_SPRITE"
    | "INVALID_PIXEL_HIT_TEST_REFERENCE"
    | "INVALID_PIXEL_HIT_TEST_DATA";

export class UIPackageLoadError extends Error {
    public readonly code: UIPackageLoadErrorCode;
    public readonly source: string;
    public readonly packageId: string;
    public readonly packageName: string;

    public constructor(
        code: UIPackageLoadErrorCode,
        message: string,
        source: string,
        packageId: string,
        packageName: string
    ) {
        super(message);
        this.name = "UIPackageLoadError";
        this.code = code;
        this.source = source;
        this.packageId = packageId;
        this.packageName = packageName;
        Object.setPrototypeOf(this, UIPackageLoadError.prototype);
    }
}

export class UIPackage {
    private _id: string;
    private _name: string;
    private _path: string;
    private _items: Array<PackageItem>;
    private _itemsById: { [index: string]: PackageItem };
    private _itemsByName: { [index: string]: PackageItem };
    private _dependencies: Array<PackageDependency>;
    private _branches: Array<string>;
    private _sprites: { [index: string]: PackageItemSprite };
    private _resourceResolver: PackageResourceResolver | null;
    private _resourceState: PackageResourceState;
    private _resourcePromise: Promise<void>;
    private _resourceDiagnostics: Array<PackageResourceDiagnostic>;
    private _resolvedItemAssetURLs: { [index: string]: string };
    private _resolvedSpriteAssetURLs: { [index: string]: string };

    /** @internal */
    public _branchIndex: number;

    public constructor() {
        this._items = [];
        this._itemsById = {};
        this._itemsByName = {};
        this._dependencies = [];
        this._branches = [];
        this._sprites = {};
        this._resourceResolver = null;
        this._resourceState = "ready";
        this._resourcePromise = Promise.resolve();
        this._resourceDiagnostics = [];
        this._resolvedItemAssetURLs = {};
        this._resolvedSpriteAssetURLs = {};
        this._branchIndex = -1;
    }

    public static get branch(): string | null {
        return _branch;
    }

    public static set branch(value: string | null) {
        _branch = value;
        for (var pkgId in _instById) {
            var pkg: UIPackage = _instById[pkgId];
            if (pkg._branches) {
                pkg._branchIndex = pkg._branches.indexOf(value);
            }
        }
    }

    public static getVar(key: string): string | null {
        return _vars[key];
    }

    public static setVar(key: string, value: string | null) {
        _vars[key] = value;
    }

    public static getById(id: string): UIPackage {
        return _instById[id];
    }

    public static getByName(name: string): UIPackage {
        return _instByName[name];
    }

    public static loadPackage(url: string): Promise<UIPackage> {
        if (!url.endsWith("/"))
            url += "/";
        return new Promise<UIPackage>((resolve, reject) => {
            let pkg: UIPackage = _instById[url];
            if (pkg) {
                resolve(pkg);
                return;
            }

            let request = new HttpRequest();
            request.send(url + "package.xml", null, "get", "arraybuffer");
            request.on("complete", (evt: Event) => {
                try {
                    const pkg = UIPackage.loadPackageFromBuffer(evt.data, {
                        source: url + "package.xml",
                        resourceBaseURL: url
                    });
                    pkg.waitForResources().then(
                        () => resolve(pkg),
                        error => reject(error)
                    );
                }
                catch (error) {
                    reject(error);
                }
            });
            request.on("error", (evt: Event) => {
                reject(new Error(
                    "Cannot load FairyGUI package \""
                        + url
                        + "\": "
                        + String(evt.data)
                ));
            });
        });
    }

    public static loadPackageFromBuffer(
        data: PackageBinaryData,
        options: UIPackageLoadOptions = {}
    ): UIPackage {
        const source = options.source || "<memory>";
        const resourceBaseURL = normalizeResourceBaseURL(
            options.resourceBaseURL
        );
        const decoded = PackageDecoder.decode(data, { source });
        const existingById = _instById[decoded.id];

        if (existingById) {
            if (existingById.name !== decoded.name) {
                throw packageLoadError(
                    "PACKAGE_ID_CONFLICT",
                    source,
                    decoded,
                    "Package ID \""
                        + decoded.id
                        + "\" is already registered by package \""
                        + existingById.name
                        + "\", so it cannot be reused by package \""
                        + decoded.name
                        + "\"."
                );
            }
            if (existingById.path !== resourceBaseURL) {
                throw packageLoadError(
                    "PACKAGE_PATH_CONFLICT",
                    source,
                    decoded,
                    "Package \""
                        + decoded.name
                        + "\" is already registered with resource base URL \""
                        + existingById.path
                        + "\", not \""
                        + resourceBaseURL
                        + "\"."
                );
            }
            return existingById;
        }

        const existingByName = _instByName[decoded.name];
        if (existingByName) {
            throw packageLoadError(
                "PACKAGE_NAME_CONFLICT",
                source,
                decoded,
                "Package name \""
                    + decoded.name
                    + "\" is already registered with ID \""
                    + existingByName.id
                    + "\", not \""
                    + decoded.id
                    + "\"."
            );
        }

        if (resourceBaseURL) {
            const existingByPath = _instById[resourceBaseURL];
            if (existingByPath) {
                throw packageLoadError(
                    "PACKAGE_PATH_CONFLICT",
                    source,
                    decoded,
                    "Resource base URL \""
                        + resourceBaseURL
                        + "\" is already registered by package \""
                        + existingByPath.name
                        + "\"."
                );
            }
        }

        const pkg = new UIPackage();
        pkg.loadDecodedPackage(decoded, resourceBaseURL, source);
        _instById[pkg.id] = pkg;
        _instByName[pkg.name] = pkg;
        if (pkg.path)
            _instById[pkg.path] = pkg;
        pkg.startResourceLoading(options.resourceResolver || null);
        return pkg;
    }

    public static removePackage(packageIdOrName: string): void {
        var pkg: UIPackage = _instById[packageIdOrName];
        if (!pkg)
            pkg = _instByName[packageIdOrName];
        if (!pkg)
            throw "No package found: " + packageIdOrName;
        pkg.dispose();
        delete _instById[pkg.id];
        delete _instByName[pkg.name];
        if (pkg._path)
            delete _instById[pkg._path];
    }

    public static createObject<T extends GObject>(pkgName: string, resName: string, userClass?: Constructor<T>): T {
        var pkg: UIPackage = UIPackage.getByName(pkgName);
        if (pkg)
            return <T>pkg.createObject(resName, userClass);
        else
            return null;
    }

    public static createObjectFromURL<T extends GObject>(url: string, userClass?: Constructor<T>): T {
        var pi: PackageItem = UIPackage.getItemByURL(url);
        if (pi)
            return <T>pi.owner.internalCreateObject(pi, userClass);
        else
            return null;
    }

    public static getItemURL(pkgName: string, resName: string): string {
        var pkg: UIPackage = UIPackage.getByName(pkgName);
        if (!pkg)
            return null;

        var pi: PackageItem = pkg._itemsByName[resName];
        if (!pi)
            return null;

        return "ui://" + pkg.id + pi.id;
    }

    public static getItemByURL(url: string): PackageItem {
        var pos1: number = url.indexOf("//");
        if (pos1 == -1)
            return null;

        var pos2: number = url.indexOf("/", pos1 + 2);
        if (pos2 == -1) {
            if (url.length > 13) {
                var pkgId: string = url.substr(5, 8);
                var pkg: UIPackage = UIPackage.getById(pkgId);
                if (pkg != null) {
                    var srcId: string = url.substr(13);
                    return pkg.getItemById(srcId);
                }
            }
        }
        else {
            var pkgName: string = url.substr(pos1 + 2, pos2 - pos1 - 2);
            pkg = UIPackage.getByName(pkgName);
            if (pkg != null) {
                var srcName: string = url.substr(pos2 + 1);
                return pkg.getItemByName(srcName);
            }
        }

        return null;
    }

    public static normalizeURL(url: string): string {
        if (url == null)
            return null;

        var pos1: number = url.indexOf("//");
        if (pos1 == -1)
            return null;

        var pos2: number = url.indexOf("/", pos1 + 2);
        if (pos2 == -1)
            return url;

        var pkgName: string = url.substr(pos1 + 2, pos2 - pos1 - 2);
        var srcName: string = url.substr(pos2 + 1);
        return UIPackage.getItemURL(pkgName, srcName);
    }

    private loadDecodedPackage(
        decoded: DecodedPackage,
        resourceBaseURL: string,
        source: string
    ): void {
        this._path = resourceBaseURL;
        this._id = decoded.id;
        this._name = decoded.name;
        this._dependencies = decoded.dependencies.map(dependency => ({
            id: dependency.id,
            name: dependency.name
        }));
        this._branches = decoded.branches.slice();
        if (_branch)
            this._branchIndex = this._branches.indexOf(_branch);

        const branchIncluded = this._branches.length > 0;
        const stringTable = decoded.stringTable.slice();

        for (const decodedItem of decoded.items) {
            const pi = new PackageItem();
            pi.owner = this;
            pi.type = decodedItem.type;
            pi.id = decodedItem.id;
            pi.name = decodedItem.name;
            pi.file = decodedItem.file == null
                ? null
                : resourceBaseURL + decodedItem.file;
            pi.width = decodedItem.width;
            pi.height = decodedItem.height;
            pi.objectType = decodedItem.objectType;
            pi.scaleByTile = decodedItem.scaleByTile;
            pi.tileGridIndice = decodedItem.tileGridIndice;
            pi.smoothing = decodedItem.smoothing;

            if (decodedItem.scale9Grid) {
                pi.scale9Grid = new Margin();
                pi.scale9Grid.left = decodedItem.scale9Grid.x;
                pi.scale9Grid.top = decodedItem.scale9Grid.y;
                pi.scale9Grid.right = pi.width
                    - decodedItem.scale9Grid.x
                    - decodedItem.scale9Grid.width;
                pi.scale9Grid.bottom = pi.height
                    - decodedItem.scale9Grid.y
                    - decodedItem.scale9Grid.height;
            }

            if (decodedItem.rawData) {
                pi.rawData = new ByteBuffer(
                    decodedItem.rawData.buffer as ArrayBuffer,
                    decodedItem.rawData.byteOffset,
                    decodedItem.rawData.byteLength
                );
                pi.rawData.version = decoded.version;
                pi.rawData.stringTable = stringTable;
            }

            if (decodedItem.branches.length > 0) {
                if (branchIncluded)
                    pi.branches = decodedItem.branches.slice();
                else
                    this._itemsById[decodedItem.branches[0]] = pi;
            }
            if (decodedItem.highResolution.length > 0)
                pi.highResolution = decodedItem.highResolution.slice();

            if (pi.type === PackageItemType.Component)
                UIObjectFactory.resolveExtension(pi);

            this._items.push(pi);
            this._itemsById[pi.id] = pi;
            if (pi.name != null)
                this._itemsByName[pi.name] = pi;
        }

        for (const decodedSprite of decoded.sprites) {
            if (this._sprites[decodedSprite.itemId]) {
                throw packageLoadError(
                    "DUPLICATE_SPRITE",
                    source,
                    decoded,
                    "Image item \""
                        + decodedSprite.itemId
                        + "\" has more than one sprite mapping."
                );
            }

            const imageItem = this._itemsById[decodedSprite.itemId];
            const atlasItem = this._itemsById[decodedSprite.atlasId];
            if (!atlasItem || atlasItem.type !== PackageItemType.Atlas) {
                throw packageLoadError(
                    "INVALID_SPRITE_REFERENCE",
                    source,
                    decoded,
                    "Sprite \""
                        + decodedSprite.itemId
                        + "\" references missing or invalid atlas item \""
                        + decodedSprite.atlasId
                        + "\"."
                );
            }

            const sprite: PackageItemSprite = {
                itemId: decodedSprite.itemId,
                atlas: atlasItem,
                x: decodedSprite.x,
                y: decodedSprite.y,
                width: decodedSprite.width,
                height: decodedSprite.height,
                rotated: decodedSprite.rotated,
                offsetX: decodedSprite.offset.x,
                offsetY: decodedSprite.offset.y,
                originalWidth: decodedSprite.originalSize.width,
                originalHeight: decodedSprite.originalSize.height
            };
            this._sprites[sprite.itemId] = sprite;
            if (imageItem && imageItem.type === PackageItemType.Image)
                imageItem.sprite = sprite;
        }

        for (const decodedHitTest of decoded.pixelHitTests) {
            const imageItem = this._itemsById[decodedHitTest.itemId];
            if (!imageItem || imageItem.type !== PackageItemType.Image) {
                throw packageLoadError(
                    "INVALID_PIXEL_HIT_TEST_REFERENCE",
                    source,
                    decoded,
                    "Pixel hit-test data references missing or non-image item \""
                        + decodedHitTest.itemId
                        + "\"."
                );
            }
            if (
                imageItem.pixelHitTestData
                || decodedHitTest.pixelWidth <= 0
                || decodedHitTest.scaleDenominator <= 0
            ) {
                throw packageLoadError(
                    "INVALID_PIXEL_HIT_TEST_DATA",
                    source,
                    decoded,
                    "Pixel hit-test data for image \""
                        + decodedHitTest.itemId
                        + "\" is duplicated or contains non-positive dimensions."
                );
            }

            imageItem.pixelHitTestData = {
                pixelWidth: decodedHitTest.pixelWidth,
                scaleDenominator: decodedHitTest.scaleDenominator,
                scale: 1 / decodedHitTest.scaleDenominator,
                pixels: decodedHitTest.pixels.slice()
            };
        }
    }

    private startResourceLoading(
        resolver: PackageResourceResolver | null
    ): void {
        this._resourceResolver = resolver;
        if (!resolver) {
            this._resourceState = "ready";
            this._resourcePromise = Promise.resolve();
            return;
        }

        this._resourceState = "loading";
        this._resourceDiagnostics = [];
        this._resourcePromise = Promise.resolve()
            .then(() => this.resolveFileResources(resolver))
            .then(() => this.resolveSpriteResources(resolver))
            .then(() => {
                if (this._resourceDiagnostics.length > 0) {
                    this._resourceState = "failed";
                    throw new UIPackageResourceError(
                        this._id,
                        this._name,
                        this._resourceDiagnostics.slice()
                    );
                }
                this._resourceState = "ready";
            });

        // Keep the background task observable through waitForResources without
        // producing an unhandled rejection before callers attach their waiter.
        this._resourcePromise.catch(() => undefined);
    }

    private resolveFileResources(
        resolver: PackageResourceResolver
    ): Promise<void> {
        const tasks = this._items
            .filter(item => !!item.file)
            .map(item => {
                const request: PackageFileResourceRequest = {
                    kind: "file",
                    packageId: this._id,
                    packageName: this._name,
                    item,
                    sourceURL: item.file
                };
                return this.resolveResourceRequest(
                    resolver,
                    request,
                    item.id
                );
            });

        return Promise.all(tasks).then(() => undefined);
    }

    private resolveSpriteResources(
        resolver: PackageResourceResolver
    ): Promise<void> {
        const tasks: Array<Promise<void>> = [];
        for (const itemId in this._sprites) {
            const sprite = this._sprites[itemId];
            const sourceURL = this._resolvedItemAssetURLs[sprite.atlas.id];
            const item = this._itemsById[itemId] || null;
            if (!sourceURL) {
                this._resourceDiagnostics.push({
                    code: "ATLAS_RESOURCE_UNAVAILABLE",
                    message: "Cannot resolve sprite \""
                        + itemId
                        + "\" because atlas \""
                        + sprite.atlas.id
                        + "\" is unavailable.",
                    requestKind: "sprite",
                    itemId,
                    itemName: item ? item.name : null,
                    sourceURL: sprite.atlas.file
                });
                continue;
            }

            const request: PackageSpriteResourceRequest = {
                kind: "sprite",
                packageId: this._id,
                packageName: this._name,
                item,
                sprite,
                sourceURL
            };
            tasks.push(this.resolveResourceRequest(
                resolver,
                request,
                itemId
            ));
        }

        return Promise.all(tasks).then(() => undefined);
    }

    private resolveResourceRequest(
        resolver: PackageResourceResolver,
        request: PackageFileResourceRequest | PackageSpriteResourceRequest,
        assetId: string
    ): Promise<void> {
        return Promise.resolve()
            .then(() => resolver.resolve(request))
            .then(resolvedURL => {
                if (typeof resolvedURL !== "string" || !resolvedURL) {
                    this._resourceDiagnostics.push({
                        code: "INVALID_RESOURCE_RESULT",
                        message: "Resource resolver returned an empty or non-string URL for \""
                            + assetId
                            + "\".",
                        requestKind: request.kind,
                        itemId: assetId,
                        itemName: request.kind === "file"
                            ? request.item.name
                            : request.item
                                ? request.item.name
                                : null,
                        sourceURL: request.sourceURL
                    });
                    return;
                }

                if (request.kind === "file")
                    this._resolvedItemAssetURLs[assetId] = resolvedURL;
                else
                    this._resolvedSpriteAssetURLs[assetId] = resolvedURL;
            })
            .catch(error => {
                const detail = error instanceof Error
                    ? error.message
                    : String(error);
                this._resourceDiagnostics.push({
                    code: "RESOURCE_RESOLUTION_FAILED",
                    message: "Cannot resolve "
                        + request.kind
                        + " resource \""
                        + assetId
                        + "\": "
                        + detail,
                    requestKind: request.kind,
                    itemId: assetId,
                    itemName: request.kind === "file"
                        ? request.item.name
                        : request.item
                            ? request.item.name
                            : null,
                    sourceURL: request.sourceURL
                });
            });
    }

    public dispose(): void {

    }

    public get id(): string {
        return this._id;
    }

    public get name(): string {
        return this._name;
    }

    public get path(): string {
        return this._path;
    }

    public get resourceState(): PackageResourceState {
        return this._resourceState;
    }

    public get dependencies(): Array<PackageDependency> {
        return this._dependencies;
    }

    public createObject(resName: string, userClass?: new () => GObject): GObject {
        var pi: PackageItem = this._itemsByName[resName];
        if (pi)
            return this.internalCreateObject(pi, userClass);
        else
            return null;
    }

    public internalCreateObject(item: PackageItem, userClass?: new () => GObject): GObject {
        var g: GObject = UIObjectFactory.newObject(item, userClass);

        if (g == null)
            return null;

        constructingDepth.n++;
        g.constructFromResource();
        constructingDepth.n--;
        return g;
    }

    public getItemById(itemId: string): PackageItem {
        return this._itemsById[itemId];
    }

    public getItemByName(resName: string): PackageItem {
        return this._itemsByName[resName];
    }

    public getSpriteByItemId(itemId: string): PackageItemSprite | null {
        return this._sprites[itemId] || null;
    }

    public waitForResources(): Promise<void> {
        return this._resourcePromise;
    }

    public getResourceDiagnostics(): ReadonlyArray<PackageResourceDiagnostic> {
        return this._resourceDiagnostics.slice();
    }

    public getItemAssetURL(item: PackageItem): string {
        if (!item)
            return null;
        return this._resolvedSpriteAssetURLs[item.id]
            || this._resolvedItemAssetURLs[item.id]
            || item.file;
    }

    public getSpriteAssetURL(itemId: string): string | null {
        return this._resolvedSpriteAssetURLs[itemId] || null;
    }
}

var _instById: { [index: string]: UIPackage } = {};
var _instByName: { [index: string]: UIPackage } = {};
var _branch: string = "";
var _vars: { [index: string]: string } = {};

function normalizeResourceBaseURL(value: string | null | undefined): string {
    if (!value)
        return "";
    return value.endsWith("/") ? value : value + "/";
}

function packageLoadError(
    code: UIPackageLoadErrorCode,
    source: string,
    decoded: DecodedPackage,
    detail: string
): UIPackageLoadError {
    return new UIPackageLoadError(
        code,
        "Cannot load FairyGUI package from \""
            + source
            + "\": "
            + detail,
        source,
        decoded.id,
        decoded.name
    );
}
