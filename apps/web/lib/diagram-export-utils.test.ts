import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EXPORT_MAX_CANVAS, EXPORT_MAX_SIDE, EXPORT_PADDING, exportFrame } from "./diagram-export-utils.ts";

// Where a node's corner lands in the image, given the frame's transform.
const place = (f: ReturnType<typeof exportFrame>, x: number, y: number) => ({ x: f.x + x * f.zoom, y: f.y + y * f.zoom });

describe("PNG export frame", () => {
  it("covers every node plus padding, wherever the nodes sit (not the on-screen viewport)", () => {
    // An expanded map: nodes far right of and above the original view.
    const bounds = { x: -120, y: -300, width: 2400, height: 900 };
    const f = exportFrame(bounds);
    assert.equal(f.zoom, 1);
    assert.equal(f.width, 2400 + EXPORT_PADDING * 2);
    assert.equal(f.height, 900 + EXPORT_PADDING * 2);
    assert.deepEqual(place(f, bounds.x, bounds.y), { x: EXPORT_PADDING, y: EXPORT_PADDING });
    const far = place(f, bounds.x + bounds.width, bounds.y + bounds.height);
    assert.deepEqual(far, { x: f.width - EXPORT_PADDING, y: f.height - EXPORT_PADDING });
    assert.equal(f.pixelRatio, 2);
  });

  it("scales very large diagrams down and keeps the canvas within browser limits", () => {
    const f = exportFrame({ x: 0, y: 0, width: 20000, height: 3000 });
    assert.ok(f.zoom < 1);
    assert.ok(f.width <= EXPORT_MAX_SIDE + 1);
    assert.ok(Math.max(f.width, f.height) * f.pixelRatio <= EXPORT_MAX_CANVAS + 1);
    const right = place(f, 20000, 3000);
    assert.ok(right.x <= f.width && right.y <= f.height);
  });

  it("small diagrams get a tight frame, not a fixed 900×700 canvas", () => {
    const f = exportFrame({ x: 10, y: 10, width: 200, height: 60 });
    assert.deepEqual([f.width, f.height], [200 + EXPORT_PADDING * 2, 60 + EXPORT_PADDING * 2]);
  });
});
