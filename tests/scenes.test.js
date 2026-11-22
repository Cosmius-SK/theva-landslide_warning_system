import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { normalizeScene, SCENE_VIEWS, sceneImagePath } from "../src/lib/scenes.js";

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

test("uses the panorama as the default for unknown scene and risk values", () => {
  assert.equal(normalizeScene("unknown-view"), "panorama");
  assert.equal(sceneImagePath("Unavailable", "unknown-view"), "/images/safe/safe_panorama.png");
});
