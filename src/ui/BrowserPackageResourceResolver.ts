import { PackageItemType } from "./FieldTypes";
import {
    PackageResourceRequest,
    PackageResourceResolver
} from "./PackageResource";

/**
 * Browser resource resolver used by UIPackage when DOM image and canvas APIs
 * are available. Atlas sprites are converted to independent PNG Blob URLs so
 * the existing DOM Image implementation can keep using regular CSS URLs.
 */
export class BrowserPackageResourceResolver
    implements PackageResourceResolver {
    private _images: { [url: string]: Promise<HTMLImageElement> };
    private _objectURLs: Set<string>;

    public constructor() {
        this._images = {};
        this._objectURLs = new Set<string>();
    }

    public static isSupported(): boolean {
        return typeof document !== "undefined"
            && typeof HTMLImageElement !== "undefined"
            && typeof HTMLCanvasElement !== "undefined"
            && typeof URL !== "undefined"
            && typeof URL.createObjectURL === "function"
            && typeof URL.revokeObjectURL === "function";
    }

    public resolve(request: PackageResourceRequest): Promise<string> {
        if (!BrowserPackageResourceResolver.isSupported()) {
            return Promise.reject(new Error(
                "Browser image, canvas, and Blob URL APIs are required."
            ));
        }

        if (request.kind === "file") {
            if (
                request.item.type === PackageItemType.Atlas
                || request.item.type === PackageItemType.Image
            ) {
                return this.loadImage(request.sourceURL)
                    .then(() => request.sourceURL);
            }
            return Promise.resolve(request.sourceURL);
        }

        return this.loadImage(request.sourceURL)
            .then(image => this.createSpriteURL(image, request.sprite));
    }

    public release(
        request: PackageResourceRequest,
        resolvedURL: string
    ): void {
        if (!this._objectURLs.has(resolvedURL))
            return;

        this._objectURLs.delete(resolvedURL);
        URL.revokeObjectURL(resolvedURL);
    }

    public dispose(): void {
        this._objectURLs.forEach(url => URL.revokeObjectURL(url));
        this._objectURLs.clear();
        this._images = {};
    }

    private loadImage(url: string): Promise<HTMLImageElement> {
        let promise = this._images[url];
        if (promise)
            return promise;

        promise = new Promise<HTMLImageElement>((resolve, reject) => {
            const image = document.createElement("img");
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error(
                "Cannot load image resource \"" + url + "\"."
            ));
            image.src = url;
        });
        this._images[url] = promise;
        return promise;
    }

    private createSpriteURL(
        image: HTMLImageElement,
        sprite: import("./PackageItem").PackageItemSprite
    ): Promise<string> {
        if (
            sprite.x < 0
            || sprite.y < 0
            || sprite.width <= 0
            || sprite.height <= 0
            || sprite.x + sprite.width > image.naturalWidth
            || sprite.y + sprite.height > image.naturalHeight
        ) {
            return Promise.reject(new Error(
                "Sprite \""
                    + sprite.itemId
                    + "\" lies outside atlas bounds "
                    + image.naturalWidth
                    + "x"
                    + image.naturalHeight
                    + "."
            ));
        }

        const contentWidth = sprite.rotated
            ? sprite.height
            : sprite.width;
        const contentHeight = sprite.rotated
            ? sprite.width
            : sprite.height;
        const outputWidth = sprite.originalWidth > 0
            ? sprite.originalWidth
            : contentWidth;
        const outputHeight = sprite.originalHeight > 0
            ? sprite.originalHeight
            : contentHeight;
        const canvas = document.createElement("canvas");
        canvas.width = outputWidth;
        canvas.height = outputHeight;
        const context = canvas.getContext("2d");
        if (!context) {
            return Promise.reject(new Error(
                "Cannot create a 2D canvas context for sprite \""
                    + sprite.itemId
                    + "\"."
            ));
        }

        if (sprite.rotated) {
            context.save();
            context.translate(
                sprite.offsetX,
                sprite.offsetY + sprite.width
            );
            context.rotate(-Math.PI / 2);
            context.drawImage(
                image,
                sprite.x,
                sprite.y,
                sprite.width,
                sprite.height,
                0,
                0,
                sprite.width,
                sprite.height
            );
            context.restore();
        }
        else {
            context.drawImage(
                image,
                sprite.x,
                sprite.y,
                sprite.width,
                sprite.height,
                sprite.offsetX,
                sprite.offsetY,
                sprite.width,
                sprite.height
            );
        }

        return new Promise<string>((resolve, reject) => {
            canvas.toBlob(blob => {
                if (!blob) {
                    reject(new Error(
                        "Cannot encode sprite \""
                            + sprite.itemId
                            + "\" as PNG."
                    ));
                    return;
                }

                const url = URL.createObjectURL(blob);
                this._objectURLs.add(url);
                resolve(url);
            }, "image/png");
        });
    }
}
