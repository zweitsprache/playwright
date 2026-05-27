/**
 * Calculates the draw dimensions and position for an image/video on a canvas
 * based on CSS objectFit behavior
 * 
 * @param sourceWidth - The natural width of the source media
 * @param sourceHeight - The natural height of the source media
 * @param canvasWidth - The canvas width to draw into
 * @param canvasHeight - The canvas height to draw into
 * @param objectFit - The CSS objectFit mode
 * @returns Object with drawX, drawY, drawWidth, drawHeight
 */
export function calculateObjectFitDimensions(
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  objectFit: "contain" | "cover" | "fill" | "none" | "scale-down" = "cover",
  objectPosition = "50% 50%"
): {
  drawX: number;
  drawY: number;
  drawWidth: number;
  drawHeight: number;
} {
  const normalizePositionToken = (token: string | undefined, axis: "x" | "y") => {
    if (!token) {
      return 0.5;
    }

    const normalized = token.toLowerCase();
    if (normalized.endsWith("%")) {
      const parsed = Number.parseFloat(normalized);
      return Number.isFinite(parsed) ? parsed / 100 : 0.5;
    }

    if (normalized.endsWith("px")) {
      return 0.5;
    }

    if (axis === "x") {
      if (normalized === "left") return 0;
      if (normalized === "right") return 1;
    }

    if (axis === "y") {
      if (normalized === "top") return 0;
      if (normalized === "bottom") return 1;
    }

    if (normalized === "center") {
      return 0.5;
    }

    return 0.5;
  };

  const resolveObjectPosition = (value: string) => {
    const parts = value.trim().split(/\s+/).filter(Boolean);

    if (parts.length === 0) {
      return { x: 0.5, y: 0.5 };
    }

    if (parts.length === 1) {
      const token = parts[0];
      if (token === "top" || token === "bottom") {
        return { x: 0.5, y: normalizePositionToken(token, "y") };
      }

      return {
        x: normalizePositionToken(token, "x"),
        y: 0.5,
      };
    }

    return {
      x: normalizePositionToken(parts[0], "x"),
      y: normalizePositionToken(parts[1], "y"),
    };
  };

  const applyObjectPosition = (
    availableWidth: number,
    availableHeight: number,
    width: number,
    height: number,
  ) => {
    const { x, y } = resolveObjectPosition(objectPosition);
    return {
      drawX: (availableWidth - width) * x,
      drawY: (availableHeight - height) * y,
    };
  };

  let drawX = 0;
  let drawY = 0;
  let drawWidth = canvasWidth;
  let drawHeight = canvasHeight;

  switch (objectFit) {
    case "contain": {
      const scale = Math.min(canvasWidth / sourceWidth, canvasHeight / sourceHeight);
      drawWidth = sourceWidth * scale;
      drawHeight = sourceHeight * scale;
      ({ drawX, drawY } = applyObjectPosition(
        canvasWidth,
        canvasHeight,
        drawWidth,
        drawHeight,
      ));
      break;
    }

    case "cover": {
      const scale = Math.max(canvasWidth / sourceWidth, canvasHeight / sourceHeight);
      drawWidth = sourceWidth * scale;
      drawHeight = sourceHeight * scale;
      ({ drawX, drawY } = applyObjectPosition(
        canvasWidth,
        canvasHeight,
        drawWidth,
        drawHeight,
      ));
      break;
    }

    case "fill":
      // Use full canvas dimensions (already set as defaults)
      break;

    case "none": {
      drawWidth = sourceWidth;
      drawHeight = sourceHeight;
      ({ drawX, drawY } = applyObjectPosition(
        canvasWidth,
        canvasHeight,
        drawWidth,
        drawHeight,
      ));
      break;
    }

    case "scale-down": {
      // Use "none" if source is smaller, otherwise use "contain"
      if (sourceWidth > canvasWidth || sourceHeight > canvasHeight) {
        const scale = Math.min(canvasWidth / sourceWidth, canvasHeight / sourceHeight);
        drawWidth = sourceWidth * scale;
        drawHeight = sourceHeight * scale;
      } else {
        drawWidth = sourceWidth;
        drawHeight = sourceHeight;
      }
      ({ drawX, drawY } = applyObjectPosition(
        canvasWidth,
        canvasHeight,
        drawWidth,
        drawHeight,
      ));
      break;
    }
  }

  return { drawX, drawY, drawWidth, drawHeight };
}

