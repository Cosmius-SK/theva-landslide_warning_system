import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { normalizeScene, SCENE_VIEWS, sceneImagePath } from "../src/lib/scenes.js";

function readJpegDimensions(image) {
  let offset = 2;
  while (offset < image.length - 9) {
    if (image[offset] !== 0xff) { offset += 1; continue; }
    const marker = image[offset + 1];
    const segmentLength = image.readUInt16BE(offset + 2);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { width: image.readUInt16BE(offset + 7), height: image.readUInt16BE(offset + 5) };
    }
    offset += segmentLength + 2;
  }
  throw new Error("JPEG dimensions were not found");
}

test("maps every risk state and scene view to an available image asset", () => {
  const states = ["Safe", "Watch", "High", "Evacuation"];
  assert.equal(SCENE_VIEWS.length, 4);

  for (const state of states) {
    for (const { id } of SCENE_VIEWS) {
      const assetPath = sceneImagePath(state, id);
      assert.ok(existsSync(join(process.cwd(), "public", assetPath)), `${state}/${id} asset should exist`);
    }
  }
});

test("all 16 cinematic assets are high-resolution 16:9 images", () => {
  for (const state of ["Safe", "Watch", "High", "Evacuation"]) {
    for (const { id } of SCENE_VIEWS) {
      const assetPath = sceneImagePath(state, id);
      const diskPath = join(process.cwd(), "public", assetPath);
      const png = readFileSync(diskPath);
      const { width, height } = readJpegDimensions(png);
      assert.ok(width >= 1600 && height >= 900, `${state}/${id} must be at least 1600x900`);
      assert.ok(Math.abs(width / height - 16 / 9) < 0.01, `${state}/${id} must retain a 16:9 aspect ratio`);
      assert.ok(statSync(diskPath).size > 100_000, `${state}/${id} should retain high-detail image data`);
    }
  }
});

test("uses the panorama as the default for unknown scene and risk values", () => {
  assert.equal(normalizeScene("unknown-view"), "panorama");
  assert.equal(sceneImagePath("Unavailable", "unknown-view"), "/images/safe/safe_panorama.jpg");
});
