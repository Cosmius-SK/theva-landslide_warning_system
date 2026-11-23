export const SCENE_VIEWS = [
  { id: "panorama", label: "Panorama" },
  { id: "hillside_home", label: "Hillside home" },
  { id: "slope_detail", label: "Slope detail" },
  { id: "soil_closeup", label: "Soil close-up" }
];

const RISK_FOLDERS = {
  Safe: "safe",
  Watch: "watch",
  High: "high",
  Evacuation: "evacuation"
};

export function normalizeScene(scene) {
  return SCENE_VIEWS.some(view => view.id === scene) ? scene : "panorama";
}

export function sceneImagePath(riskLevel, scene) {
  const riskFolder = RISK_FOLDERS[riskLevel] || "safe";
  const sceneView = normalizeScene(scene);
  return `/images/${riskFolder}/${riskFolder}_${sceneView}.jpg`;
}
