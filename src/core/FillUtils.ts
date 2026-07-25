import { FillMethod, FillOrigin } from "../ui/FieldTypes";

/**
 * Calculates the visible polygon of a filled image without changing its size.
 *
 * The returned coordinates are in the image's local pixel space. A null result
 * represents an empty fill, while a full fill returns the image rectangle.
 */
export function fillImage(
    width: number,
    height: number,
    method: number,
    origin: number,
    clockwise: boolean,
    amount: number
): number[] | null {
    if (amount <= 0)
        return null;
    if (amount >= 0.9999 || method === FillMethod.None)
        return [0, 0, width, 0, width, height, 0, height];

    let points: number[];
    switch (method) {
        case FillMethod.Horizontal:
            points = fillHorizontal(width, height, origin, amount);
            break;
        case FillMethod.Vertical:
            points = fillVertical(width, height, origin, amount);
            break;
        case FillMethod.Radial90:
            points = fillRadial90(width, height, origin, clockwise, amount);
            break;
        case FillMethod.Radial180:
            points = fillRadial180(width, height, origin, clockwise, amount);
            break;
        case FillMethod.Radial360:
            points = fillRadial360(width, height, origin, clockwise, amount);
            break;
        default:
            return [0, 0, width, 0, width, height, 0, height];
    }

    return normalizePoints(points, width, height);
}

function normalizePoints(points: number[], width: number, height: number): number[] {
    return points.map((value, index) => {
        const maximum = index % 2 === 0 ? width : height;
        if (Math.abs(value) < 1e-10)
            return 0;
        if (Math.abs(value - maximum) < 1e-10)
            return maximum;
        return Math.max(0, Math.min(maximum, value));
    });
}

function fillHorizontal(width: number, height: number, origin: number, amount: number): number[] {
    const filledWidth = width * amount;
    if (origin === FillOrigin.Left || origin === FillOrigin.Top)
        return [0, 0, filledWidth, 0, filledWidth, height, 0, height];

    return [width, 0, width, height, width - filledWidth, height, width - filledWidth, 0];
}

function fillVertical(width: number, height: number, origin: number, amount: number): number[] {
    const filledHeight = height * amount;
    if (origin === FillOrigin.Left || origin === FillOrigin.Top)
        return [0, 0, 0, filledHeight, width, filledHeight, width, 0];

    return [0, height, width, height, width, height - filledHeight, 0, height - filledHeight];
}

function fillRadial90(
    width: number,
    height: number,
    origin: number,
    clockwise: boolean,
    amount: number
): number[] {
    if (
        (clockwise && (origin === FillOrigin.TopRight || origin === FillOrigin.BottomLeft))
        || (!clockwise && (origin === FillOrigin.TopLeft || origin === FillOrigin.BottomRight))
    )
        amount = 1 - amount;

    const slope = Math.tan(Math.PI / 2 * amount);
    const edgeHeight = width * slope;
    const overflowRatio = (edgeHeight - height) / edgeHeight;

    switch (origin) {
        case FillOrigin.TopLeft:
            if (clockwise) {
                if (edgeHeight <= height)
                    return [0, 0, width, edgeHeight, width, 0];
                return [0, 0, width * (1 - overflowRatio), height, width, height, width, 0];
            }
            if (edgeHeight <= height)
                return [0, 0, width, edgeHeight, width, height, 0, height];
            return [0, 0, width * (1 - overflowRatio), height, 0, height];

        case FillOrigin.TopRight:
            if (clockwise) {
                if (edgeHeight <= height)
                    return [width, 0, 0, edgeHeight, 0, height, width, height];
                return [width, 0, width * overflowRatio, height, width, height];
            }
            if (edgeHeight <= height)
                return [width, 0, 0, edgeHeight, 0, 0];
            return [width, 0, width * overflowRatio, height, 0, height, 0, 0];

        case FillOrigin.BottomLeft:
            if (clockwise) {
                if (edgeHeight <= height)
                    return [0, height, width, height - edgeHeight, width, 0, 0, 0];
                return [0, height, width * (1 - overflowRatio), 0, 0, 0];
            }
            if (edgeHeight <= height)
                return [0, height, width, height - edgeHeight, width, height];
            return [0, height, width * (1 - overflowRatio), 0, width, 0, width, height];

        case FillOrigin.BottomRight:
            if (clockwise) {
                if (edgeHeight <= height)
                    return [width, height, 0, height - edgeHeight, 0, height];
                return [width, height, width * overflowRatio, 0, 0, 0, 0, height];
            }
            if (edgeHeight <= height)
                return [width, height, 0, height - edgeHeight, 0, 0, width, 0];
            return [width, height, width * overflowRatio, 0, width, 0];

        default:
            return [0, 0, width, 0, width, height, 0, height];
    }
}

function movePoints(points: number[], offsetX: number, offsetY: number): void {
    for (let index = 0; index < points.length; index += 2) {
        points[index] += offsetX;
        points[index + 1] += offsetY;
    }
}

function fillRadial180(
    width: number,
    height: number,
    origin: number,
    clockwise: boolean,
    amount: number
): number[] {
    let points: number[];

    switch (origin) {
        case FillOrigin.Top:
            if (amount <= 0.5) {
                amount /= 0.5;
                points = fillRadial90(
                    width / 2,
                    height,
                    clockwise ? FillOrigin.TopLeft : FillOrigin.TopRight,
                    clockwise,
                    amount
                );
                if (clockwise)
                    movePoints(points, width / 2, 0);
            }
            else {
                amount = (amount - 0.5) / 0.5;
                points = fillRadial90(
                    width / 2,
                    height,
                    clockwise ? FillOrigin.TopRight : FillOrigin.TopLeft,
                    clockwise,
                    amount
                );
                if (clockwise)
                    points.push(width, height, width, 0);
                else {
                    movePoints(points, width / 2, 0);
                    points.push(0, height, 0, 0);
                }
            }
            return points;

        case FillOrigin.Bottom:
            if (amount <= 0.5) {
                amount /= 0.5;
                points = fillRadial90(
                    width / 2,
                    height,
                    clockwise ? FillOrigin.BottomRight : FillOrigin.BottomLeft,
                    clockwise,
                    amount
                );
                if (!clockwise)
                    movePoints(points, width / 2, 0);
            }
            else {
                amount = (amount - 0.5) / 0.5;
                points = fillRadial90(
                    width / 2,
                    height,
                    clockwise ? FillOrigin.BottomLeft : FillOrigin.BottomRight,
                    clockwise,
                    amount
                );
                if (clockwise) {
                    movePoints(points, width / 2, 0);
                    points.push(0, 0, 0, height);
                }
                else
                    points.push(width, 0, width, height);
            }
            return points;

        case FillOrigin.Left:
            if (amount <= 0.5) {
                amount /= 0.5;
                points = fillRadial90(
                    width,
                    height / 2,
                    clockwise ? FillOrigin.BottomLeft : FillOrigin.TopLeft,
                    clockwise,
                    amount
                );
                if (!clockwise)
                    movePoints(points, 0, height / 2);
            }
            else {
                amount = (amount - 0.5) / 0.5;
                points = fillRadial90(
                    width,
                    height / 2,
                    clockwise ? FillOrigin.TopLeft : FillOrigin.BottomLeft,
                    clockwise,
                    amount
                );
                if (clockwise) {
                    movePoints(points, 0, height / 2);
                    points.push(width, 0, 0, 0);
                }
                else
                    points.push(width, height, 0, height);
            }
            return points;

        case FillOrigin.Right:
            if (amount <= 0.5) {
                amount /= 0.5;
                points = fillRadial90(
                    width,
                    height / 2,
                    clockwise ? FillOrigin.TopRight : FillOrigin.BottomRight,
                    clockwise,
                    amount
                );
                if (clockwise)
                    movePoints(points, 0, height / 2);
            }
            else {
                amount = (amount - 0.5) / 0.5;
                points = fillRadial90(
                    width,
                    height / 2,
                    clockwise ? FillOrigin.BottomRight : FillOrigin.TopRight,
                    clockwise,
                    amount
                );
                if (clockwise)
                    points.push(0, height, width, height);
                else {
                    movePoints(points, 0, height / 2);
                    points.push(0, 0, width, 0);
                }
            }
            return points;

        default:
            return [0, 0, width, 0, width, height, 0, height];
    }
}

function fillRadial360(
    width: number,
    height: number,
    origin: number,
    clockwise: boolean,
    amount: number
): number[] {
    let points: number[];

    switch (origin) {
        case FillOrigin.Top:
            if (amount <= 0.5) {
                amount /= 0.5;
                points = fillRadial180(
                    width / 2,
                    height,
                    clockwise ? FillOrigin.Left : FillOrigin.Right,
                    clockwise,
                    amount
                );
                if (clockwise)
                    movePoints(points, width / 2, 0);
            }
            else {
                amount = (amount - 0.5) / 0.5;
                points = fillRadial180(
                    width / 2,
                    height,
                    clockwise ? FillOrigin.Right : FillOrigin.Left,
                    clockwise,
                    amount
                );
                if (clockwise)
                    points.push(width, height, width, 0, width / 2, 0);
                else {
                    movePoints(points, width / 2, 0);
                    points.push(0, height, 0, 0, width / 2, 0);
                }
            }
            return points;

        case FillOrigin.Bottom:
            if (amount <= 0.5) {
                amount /= 0.5;
                points = fillRadial180(
                    width / 2,
                    height,
                    clockwise ? FillOrigin.Right : FillOrigin.Left,
                    clockwise,
                    amount
                );
                if (!clockwise)
                    movePoints(points, width / 2, 0);
            }
            else {
                amount = (amount - 0.5) / 0.5;
                points = fillRadial180(
                    width / 2,
                    height,
                    clockwise ? FillOrigin.Left : FillOrigin.Right,
                    clockwise,
                    amount
                );
                if (clockwise) {
                    movePoints(points, width / 2, 0);
                    points.push(0, 0, 0, height, width / 2, height);
                }
                else
                    points.push(width, 0, width, height, width / 2, height);
            }
            return points;

        case FillOrigin.Left:
            if (amount <= 0.5) {
                amount /= 0.5;
                points = fillRadial180(
                    width,
                    height / 2,
                    clockwise ? FillOrigin.Bottom : FillOrigin.Top,
                    clockwise,
                    amount
                );
                if (!clockwise)
                    movePoints(points, 0, height / 2);
            }
            else {
                amount = (amount - 0.5) / 0.5;
                points = fillRadial180(
                    width,
                    height / 2,
                    clockwise ? FillOrigin.Top : FillOrigin.Bottom,
                    clockwise,
                    amount
                );
                if (clockwise) {
                    movePoints(points, 0, height / 2);
                    points.push(width, 0, 0, 0, 0, height / 2);
                }
                else
                    points.push(width, height, 0, height, 0, height / 2);
            }
            return points;

        case FillOrigin.Right:
            if (amount <= 0.5) {
                amount /= 0.5;
                points = fillRadial180(
                    width,
                    height / 2,
                    clockwise ? FillOrigin.Top : FillOrigin.Bottom,
                    clockwise,
                    amount
                );
                if (clockwise)
                    movePoints(points, 0, height / 2);
            }
            else {
                amount = (amount - 0.5) / 0.5;
                points = fillRadial180(
                    width,
                    height / 2,
                    clockwise ? FillOrigin.Bottom : FillOrigin.Top,
                    clockwise,
                    amount
                );
                if (clockwise)
                    points.push(0, height, width, height, width, height / 2);
                else {
                    movePoints(points, 0, height / 2);
                    points.push(0, 0, width, 0, width, height / 2);
                }
            }
            return points;

        default:
            return [0, 0, width, 0, width, height, 0, height];
    }
}
