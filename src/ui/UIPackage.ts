import { PackageItemType } from "./FieldTypes";
import { constructingDepth, GObject } from "./GObject";
import { PackageItem } from "./PackageItem";
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

type PackageDependency = { id: string, name: string };

export interface UIPackageLoadOptions extends PackageDecodeOptions {
    resourceBaseURL?: string;
}

export type UIPackageLoadErrorCode =
    | "PACKAGE_ID_CONFLICT"
    | "PACKAGE_NAME_CONFLICT"
    | "PACKAGE_PATH_CONFLICT";

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

    /** @internal */
    public _branchIndex: number;

    public constructor() {
        this._items = [];
        this._itemsById = {};
        this._itemsByName = {};
        this._dependencies = [];
        this._branches = [];
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
                    resolve(UIPackage.loadPackageFromBuffer(evt.data, {
                        source: url + "package.xml",
                        resourceBaseURL: url
                    }));
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
        pkg.loadDecodedPackage(decoded, resourceBaseURL);
        _instById[pkg.id] = pkg;
        _instByName[pkg.name] = pkg;
        if (pkg.path)
            _instById[pkg.path] = pkg;
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
        resourceBaseURL: string
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

    public getItemAssetURL(item: PackageItem): string {
        return item.file;
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
