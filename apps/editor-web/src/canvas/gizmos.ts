import { Graphics } from "pixi.js";
export const CANVAS_BACKGROUND = 0x181818;
export const ARTBOARD_FILL = 0x1e1e2e;
export const ARTBOARD_BORDER = 0x3c3c50;
export const SELECTION_COLOR = 0x4c9aff;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 8;
export const PIVOT_GIZMO_HALF_SIZE = 6;
export const PIVOT_GIZMO_THICKNESS = 2;
export const ANCHOR_GIZMO_GAP = 2;
export const ANCHOR_GIZMO_LENGTH = 11;
export const ANCHOR_GIZMO_HALF_WIDTH = 4;

/** Unity-подобный «лепесток» якоря: треугольник с вершиной в якорной точке, раскрывающийся наружу по диагонали. */
export function drawAnchorPetal(graphics: Graphics, point: { x: number; y: number }, dirX: number, dirY: number): void {
  const nx = dirX / Math.SQRT2;
  const ny = dirY / Math.SQRT2;
  const baseX = point.x + nx * (ANCHOR_GIZMO_GAP + ANCHOR_GIZMO_LENGTH);
  const baseY = point.y + ny * (ANCHOR_GIZMO_GAP + ANCHOR_GIZMO_LENGTH);
  graphics
    .poly([
      point.x + nx * ANCHOR_GIZMO_GAP, point.y + ny * ANCHOR_GIZMO_GAP,
      baseX - ny * ANCHOR_GIZMO_HALF_WIDTH, baseY + nx * ANCHOR_GIZMO_HALF_WIDTH,
      baseX + ny * ANCHOR_GIZMO_HALF_WIDTH, baseY - nx * ANCHOR_GIZMO_HALF_WIDTH,
    ])
    .fill({ color: 0xffffff, alpha: 0.9 })
    .stroke({ width: 1, color: 0x242424 });
}


export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export const RESIZE_HANDLES: readonly { handle: ResizeHandle; x: number; y: number; cursor: string }[] = [
  { handle: "nw", x: 0, y: 0, cursor: "nwse-resize" },
  { handle: "n", x: 0.5, y: 0, cursor: "ns-resize" },
  { handle: "ne", x: 1, y: 0, cursor: "nesw-resize" },
  { handle: "e", x: 1, y: 0.5, cursor: "ew-resize" },
  { handle: "se", x: 1, y: 1, cursor: "nwse-resize" },
  { handle: "s", x: 0.5, y: 1, cursor: "ns-resize" },
  { handle: "sw", x: 0, y: 1, cursor: "nesw-resize" },
  { handle: "w", x: 0, y: 0.5, cursor: "ew-resize" },
];
