import { ByteBuffer } from "../utils/ByteBuffer";
import { ObjectType, PackageItemType } from "./FieldTypes";

const FGUI_MAGIC = 0x46475549;
const NULL_STRING_INDEX = 65534;
const EMPTY_STRING_INDEX = 65533;
const MAX_COLLECTION_SIZE = 1000000;

export type PackageBinaryData = ArrayBuffer | ArrayBufferView;

export interface PackageDecodeOptions {
    source?: string;
}

export type PackageDecodeErrorCode =
    | "INVALID_INPUT"
    | "INVALID_MAGIC"
    | "UNSUPPORTED_COMPRESSION"
    | "TRUNCATED_DATA"
    | "MISSING_BLOCK"
    | "INVALID_BLOCK"
    | "INVALID_STRING_REFERENCE";

export class PackageDecodeError extends Error {
    public readonly code: PackageDecodeErrorCode;
    public readonly source: string;
    public readonly offset: number;
    public readonly cause?: unknown;

    public constructor(
        code: PackageDecodeErrorCode,
        message: string,
        source: string,
        offset: number,
        cause?: unknown
    ) {
        super(message);
        this.name = "PackageDecodeError";
        this.code = code;
        this.source = source;
        this.offset = offset;
        this.cause = cause;
        Object.setPrototypeOf(this, PackageDecodeError.prototype);
    }
}

export interface DecodedPackageDependency {
    readonly id: string;
    readonly name: string;
}

export interface DecodedScale9Grid {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export interface DecodedPoint {
    readonly x: number;
    readonly y: number;
}

export interface DecodedSize {
    readonly width: number;
    readonly height: number;
}

export interface DecodedPackageItem {
    readonly type: PackageItemType;
    readonly id: string;
    readonly name: string | null;
    readonly path: string | null;
    readonly file: string | null;
    readonly exported: boolean;
    readonly width: number;
    readonly height: number;
    readonly objectType?: number;
    readonly scale9Grid?: DecodedScale9Grid;
    readonly scaleByTile?: boolean;
    readonly tileGridIndice?: number;
    readonly smoothing?: boolean;
    readonly rawData?: Uint8Array;
    readonly skeletonAnchor?: DecodedPoint;
    readonly branch: string | null;
    readonly branches: ReadonlyArray<string>;
    readonly highResolution: ReadonlyArray<string>;
}

export interface DecodedPackageSprite {
    readonly itemId: string;
    readonly atlasId: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly rotated: boolean;
    readonly offset: DecodedPoint;
    readonly originalSize: DecodedSize;
}

export interface DecodedPixelHitTest {
    readonly itemId: string;
    readonly pixelWidth: number;
    readonly scaleDenominator: number;
    readonly pixels: Uint8Array;
}

export interface DecodedPackage {
    readonly version: number;
    readonly compressed: boolean;
    readonly id: string;
    readonly name: string;
    readonly dependencies: ReadonlyArray<DecodedPackageDependency>;
    readonly branches: ReadonlyArray<string>;
    readonly items: ReadonlyArray<DecodedPackageItem>;
    readonly sprites: ReadonlyArray<DecodedPackageSprite>;
    readonly pixelHitTests: ReadonlyArray<DecodedPixelHitTest>;
    readonly stringTable: ReadonlyArray<string>;
}

/**
 * Pure FairyGUI package decoder.
 *
 * It does not perform network access, mutate the UIPackage registry, or create
 * any DOM objects. Runtime assembly is intentionally handled by UIPackage.
 */
export class PackageDecoder {
    public static decode(
        data: PackageBinaryData,
        options: PackageDecodeOptions = {}
    ): DecodedPackage {
        const source = options.source || "<memory>";
        const input = normalizeInput(data, source);
        const buffer = new ByteBuffer(
            input.buffer,
            input.byteOffset,
            input.byteLength
        );

        try {
            if (buffer.readUint() !== FGUI_MAGIC) {
                throw decodeError(
                    "INVALID_MAGIC",
                    "Expected FairyGUI magic 0x46475549.",
                    source,
                    0
                );
            }

            buffer.version = buffer.readInt();
            const compressed = buffer.readBool();
            if (compressed) {
                throw decodeError(
                    "UNSUPPORTED_COMPRESSION",
                    "Compressed FairyGUI packages are not supported yet.",
                    source,
                    buffer.pos - 1
                );
            }

            const id = buffer.readString();
            const name = buffer.readString();
            skipChecked(buffer, 20, source, input.byteOffset);
            const indexTablePos = buffer.pos;
            const version2 = buffer.version >= 2;

            requireBlock(buffer, indexTablePos, 4, "string table", source);
            const stringCount = readCount(
                buffer.readInt(),
                "string table",
                buffer,
                source,
                input.byteOffset
            );
            const stringTable: Array<string> = [];
            for (let i = 0; i < stringCount; i++)
                stringTable.push(buffer.readString());
            buffer.stringTable = stringTable;

            if (buffer.seek(indexTablePos, 5)) {
                const overrideCount = readCount(
                    buffer.readInt(),
                    "custom string table",
                    buffer,
                    source,
                    input.byteOffset
                );
                for (let i = 0; i < overrideCount; i++) {
                    const stringIndexOffset = packageOffset(
                        buffer,
                        input.byteOffset
                    );
                    const stringIndex = buffer.readUshort();
                    if (stringIndex >= stringTable.length) {
                        throw decodeError(
                            "INVALID_STRING_REFERENCE",
                            "Custom string override references index "
                                + stringIndex
                                + ", but the string table contains "
                                + stringTable.length
                                + " entries.",
                            source,
                            stringIndexOffset
                        );
                    }

                    const length = buffer.readInt();
                    if (length < 0) {
                        throw decodeError(
                            "INVALID_BLOCK",
                            "Custom string length cannot be negative.",
                            source,
                            packageOffset(buffer, input.byteOffset) - 4
                        );
                    }
                    stringTable[stringIndex] = buffer.readString(length);
                }
            }

            requireBlock(buffer, indexTablePos, 0, "dependencies", source);
            const dependencies: Array<DecodedPackageDependency> = [];
            const dependencyCount = readCount(
                buffer.readShort(),
                "dependencies",
                buffer,
                source,
                input.byteOffset
            );
            for (let i = 0; i < dependencyCount; i++) {
                dependencies.push({
                    id: readStringReference(buffer, source, input.byteOffset)
                        || "",
                    name: readStringReference(buffer, source, input.byteOffset)
                        || ""
                });
            }

            const branches: Array<string> = [];
            if (version2) {
                const branchCount = readCount(
                    buffer.readShort(),
                    "branches",
                    buffer,
                    source,
                    input.byteOffset
                );
                for (let i = 0; i < branchCount; i++) {
                    branches.push(
                        readStringReference(buffer, source, input.byteOffset)
                            || ""
                    );
                }
            }
            const branchIncluded = branches.length > 0;

            requireBlock(buffer, indexTablePos, 1, "package items", source);
            const itemCount = readCount(
                buffer.readShort(),
                "package items",
                buffer,
                source,
                input.byteOffset
            );
            const items: Array<DecodedPackageItem> = [];
            for (let i = 0; i < itemCount; i++) {
                const recordLength = buffer.readInt();
                const recordStart = buffer.pos;
                const nextPosition = checkedRecordEnd(
                    buffer,
                    recordStart,
                    recordLength,
                    "package item",
                    source,
                    input.byteOffset
                );

                const type = buffer.readByte() as PackageItemType;
                const itemId = readStringReference(
                    buffer,
                    source,
                    input.byteOffset
                ) || "";
                let itemName = readStringReference(
                    buffer,
                    source,
                    input.byteOffset
                );
                const itemPath = readStringReference(
                    buffer,
                    source,
                    input.byteOffset
                );
                const itemFile = readStringReference(
                    buffer,
                    source,
                    input.byteOffset
                );
                const exported = buffer.readBool();
                const width = buffer.readInt();
                const height = buffer.readInt();

                let objectType: number;
                let scale9Grid: DecodedScale9Grid;
                let scaleByTile: boolean;
                let tileGridIndice: number;
                let smoothing: boolean;
                let rawData: Uint8Array;
                let skeletonAnchor: DecodedPoint;

                switch (type) {
                    case PackageItemType.Image:
                        objectType = ObjectType.Image;
                        const scaleOption = buffer.readByte();
                        if (scaleOption === 1) {
                            scale9Grid = {
                                x: buffer.readInt(),
                                y: buffer.readInt(),
                                width: buffer.readInt(),
                                height: buffer.readInt()
                            };
                            tileGridIndice = buffer.readInt();
                        }
                        else if (scaleOption === 2)
                            scaleByTile = true;
                        smoothing = buffer.readBool();
                        break;

                    case PackageItemType.MovieClip:
                        smoothing = buffer.readBool();
                        objectType = ObjectType.MovieClip;
                        rawData = readBufferBytes(buffer);
                        break;

                    case PackageItemType.Font:
                        rawData = readBufferBytes(buffer);
                        break;

                    case PackageItemType.Component:
                        const extension = buffer.readByte();
                        objectType = extension > 0
                            ? extension
                            : ObjectType.Component;
                        rawData = readBufferBytes(buffer);
                        break;

                    case PackageItemType.Spine:
                    case PackageItemType.DragonBones:
                        skeletonAnchor = {
                            x: buffer.readFloat(),
                            y: buffer.readFloat()
                        };
                        break;
                }

                let branch: string = null;
                let itemBranches: Array<string> = [];
                let highResolution: Array<string> = [];
                if (version2) {
                    branch = readStringReference(
                        buffer,
                        source,
                        input.byteOffset
                    );
                    if (branch !== null)
                        itemName = branch + "/" + (itemName || "");

                    const itemBranchCount = readCount(
                        buffer.readByte(),
                        "item branches",
                        buffer,
                        source,
                        input.byteOffset
                    );
                    if (itemBranchCount > 0) {
                        if (branchIncluded) {
                            for (let j = 0; j < itemBranchCount; j++) {
                                itemBranches.push(
                                    readStringReference(
                                        buffer,
                                        source,
                                        input.byteOffset
                                    ) || ""
                                );
                            }
                        }
                        else {
                            itemBranches = [
                                readStringReference(
                                    buffer,
                                    source,
                                    input.byteOffset
                                ) || ""
                            ];
                        }
                    }

                    const highResolutionCount = readCount(
                        buffer.readByte(),
                        "high-resolution items",
                        buffer,
                        source,
                        input.byteOffset
                    );
                    for (let j = 0; j < highResolutionCount; j++) {
                        highResolution.push(
                            readStringReference(
                                buffer,
                                source,
                                input.byteOffset
                            ) || ""
                        );
                    }
                }

                if (buffer.pos > nextPosition) {
                    throw decodeError(
                        "INVALID_BLOCK",
                        "Package item record is shorter than its declared fields.",
                        source,
                        packageOffset(buffer, input.byteOffset)
                    );
                }

                items.push({
                    type,
                    id: itemId,
                    name: itemName,
                    path: itemPath,
                    file: itemFile,
                    exported,
                    width,
                    height,
                    objectType,
                    scale9Grid,
                    scaleByTile,
                    tileGridIndice,
                    smoothing,
                    rawData,
                    skeletonAnchor,
                    branch,
                    branches: itemBranches,
                    highResolution
                });
                buffer.pos = nextPosition;
            }

            requireBlock(buffer, indexTablePos, 2, "sprites", source);
            const spriteCount = readCount(
                buffer.readShort(),
                "sprites",
                buffer,
                source,
                input.byteOffset
            );
            const sprites: Array<DecodedPackageSprite> = [];
            for (let i = 0; i < spriteCount; i++) {
                const recordLength = buffer.readUshort();
                const recordStart = buffer.pos;
                const nextPosition = checkedRecordEnd(
                    buffer,
                    recordStart,
                    recordLength,
                    "sprite",
                    source,
                    input.byteOffset
                );
                const itemId = readStringReference(
                    buffer,
                    source,
                    input.byteOffset
                ) || "";
                const atlasId = readStringReference(
                    buffer,
                    source,
                    input.byteOffset
                ) || "";
                const x = buffer.readInt();
                const y = buffer.readInt();
                const width = buffer.readInt();
                const height = buffer.readInt();
                const rotated = buffer.readBool();
                let offset: DecodedPoint = { x: 0, y: 0 };
                let originalSize: DecodedSize = rotated
                    ? { width: height, height: width }
                    : { width, height };

                if (version2 && buffer.readBool()) {
                    offset = {
                        x: buffer.readInt(),
                        y: buffer.readInt()
                    };
                    originalSize = {
                        width: buffer.readInt(),
                        height: buffer.readInt()
                    };
                }

                if (buffer.pos > nextPosition) {
                    throw decodeError(
                        "INVALID_BLOCK",
                        "Sprite record is shorter than its declared fields.",
                        source,
                        packageOffset(buffer, input.byteOffset)
                    );
                }

                sprites.push({
                    itemId,
                    atlasId,
                    x,
                    y,
                    width,
                    height,
                    rotated,
                    offset,
                    originalSize
                });
                buffer.pos = nextPosition;
            }

            const pixelHitTests: Array<DecodedPixelHitTest> = [];
            if (buffer.seek(indexTablePos, 3)) {
                const hitTestCount = readCount(
                    buffer.readShort(),
                    "pixel hit tests",
                    buffer,
                    source,
                    input.byteOffset
                );
                for (let i = 0; i < hitTestCount; i++) {
                    const recordLength = buffer.readInt();
                    const recordStart = buffer.pos;
                    const nextPosition = checkedRecordEnd(
                        buffer,
                        recordStart,
                        recordLength,
                        "pixel hit test",
                        source,
                        input.byteOffset
                    );
                    const itemId = readStringReference(
                        buffer,
                        source,
                        input.byteOffset
                    ) || "";
                    buffer.readInt(); // Deprecated offset field.
                    const pixelWidth = buffer.readInt();
                    const scaleDenominator = buffer.readByte();
                    const byteLength = buffer.readInt();
                    const pixels = readBytes(
                        buffer,
                        byteLength,
                        source,
                        input.byteOffset
                    );

                    if (buffer.pos > nextPosition) {
                        throw decodeError(
                            "INVALID_BLOCK",
                            "Pixel hit-test record is shorter than its declared fields.",
                            source,
                            packageOffset(buffer, input.byteOffset)
                        );
                    }

                    pixelHitTests.push({
                        itemId,
                        pixelWidth,
                        scaleDenominator,
                        pixels
                    });
                    buffer.pos = nextPosition;
                }
            }

            return {
                version: buffer.version,
                compressed,
                id,
                name,
                dependencies,
                branches,
                items,
                sprites,
                pixelHitTests,
                stringTable
            };
        }
        catch (error) {
            if (error instanceof PackageDecodeError)
                throw error;

            const offset = Math.max(
                0,
                Math.min(buffer.pos, input.byteLength)
            );
            const detail = error instanceof Error
                ? error.message
                : String(error);
            throw decodeError(
                "TRUNCATED_DATA",
                "The package ended while reading binary data"
                    + (detail ? ": " + detail : "."),
                source,
                offset,
                error
            );
        }
    }
}

interface NormalizedInput {
    buffer: ArrayBuffer;
    byteOffset: number;
    byteLength: number;
}

function normalizeInput(
    data: PackageBinaryData,
    source: string
): NormalizedInput {
    if (data instanceof ArrayBuffer) {
        return {
            buffer: data,
            byteOffset: 0,
            byteLength: data.byteLength
        };
    }

    if (data != null && ArrayBuffer.isView(data)) {
        return {
            buffer: data.buffer as ArrayBuffer,
            byteOffset: data.byteOffset,
            byteLength: data.byteLength
        };
    }

    throw decodeError(
        "INVALID_INPUT",
        "Expected an ArrayBuffer or ArrayBuffer view.",
        source,
        0
    );
}

function decodeError(
    code: PackageDecodeErrorCode,
    detail: string,
    source: string,
    offset: number,
    cause?: unknown
): PackageDecodeError {
    return new PackageDecodeError(
        code,
        "Cannot decode FairyGUI package \""
            + source
            + "\" at byte "
            + offset
            + ": "
            + detail,
        source,
        offset,
        cause
    );
}

function packageOffset(buffer: ByteBuffer, rootByteOffset: number): number {
    return buffer.byteOffset - rootByteOffset + buffer.pos;
}

function requireBlock(
    buffer: ByteBuffer,
    indexTablePos: number,
    blockIndex: number,
    blockName: string,
    source: string
): void {
    if (!buffer.seek(indexTablePos, blockIndex)) {
        throw decodeError(
            "MISSING_BLOCK",
            "Required " + blockName + " block " + blockIndex + " is missing.",
            source,
            indexTablePos
        );
    }
}

function readCount(
    count: number,
    collectionName: string,
    buffer: ByteBuffer,
    source: string,
    rootByteOffset: number
): number {
    if (!Number.isSafeInteger(count) || count < 0 || count > MAX_COLLECTION_SIZE) {
        throw decodeError(
            "INVALID_BLOCK",
            "Invalid " + collectionName + " count: " + count + ".",
            source,
            packageOffset(buffer, rootByteOffset)
        );
    }
    return count;
}

function readStringReference(
    buffer: ByteBuffer,
    source: string,
    rootByteOffset: number
): string | null {
    const offset = packageOffset(buffer, rootByteOffset);
    const index = buffer.readUshort();
    if (index === NULL_STRING_INDEX)
        return null;
    if (index === EMPTY_STRING_INDEX)
        return "";

    if (index >= buffer.stringTable.length) {
        throw decodeError(
            "INVALID_STRING_REFERENCE",
            "String index "
                + index
                + " is outside the "
                + buffer.stringTable.length
                + "-entry string table.",
            source,
            offset
        );
    }

    return buffer.stringTable[index];
}

function checkedRecordEnd(
    buffer: ByteBuffer,
    recordStart: number,
    recordLength: number,
    recordName: string,
    source: string,
    rootByteOffset: number
): number {
    const recordEnd = recordStart + recordLength;
    if (
        !Number.isSafeInteger(recordLength)
        || recordLength < 0
        || recordEnd < recordStart
        || recordEnd > buffer.length
    ) {
        throw decodeError(
            "INVALID_BLOCK",
            "Invalid " + recordName + " record length: " + recordLength + ".",
            source,
            packageOffset(buffer, rootByteOffset) - 4
        );
    }
    return recordEnd;
}

function skipChecked(
    buffer: ByteBuffer,
    count: number,
    source: string,
    rootByteOffset: number
): void {
    if (count < 0 || count > buffer.length - buffer.pos) {
        throw decodeError(
            "TRUNCATED_DATA",
            "Cannot skip " + count + " bytes past the package boundary.",
            source,
            packageOffset(buffer, rootByteOffset)
        );
    }
    buffer.skip(count);
}

function readBufferBytes(buffer: ByteBuffer): Uint8Array {
    const rawBuffer = buffer.readBuffer();
    return new Uint8Array(
        rawBuffer.data,
        rawBuffer.byteOffset,
        rawBuffer.length
    ).slice();
}

function readBytes(
    buffer: ByteBuffer,
    count: number,
    source: string,
    rootByteOffset: number
): Uint8Array {
    if (
        !Number.isSafeInteger(count)
        || count < 0
        || count > buffer.length - buffer.pos
    ) {
        throw decodeError(
            "TRUNCATED_DATA",
            "Cannot read byte array of length " + count + ".",
            source,
            packageOffset(buffer, rootByteOffset)
        );
    }

    const bytes = new Uint8Array(
        buffer.data,
        buffer.byteOffset + buffer.pos,
        count
    ).slice();
    buffer.skip(count);
    return bytes;
}
