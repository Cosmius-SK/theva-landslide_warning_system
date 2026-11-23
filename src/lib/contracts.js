import { normalizeScene } from "./scenes.js";

export const SENSOR_IDS = Object.freeze(["moisture", "rainfall", "movement"]);
export const OPERATING_MODES = Object.freeze(["auto", "virtual", "hardware"]);
export const SENSOR_VALUE_MIN = 0;
export const SENSOR_VALUE_MAX = 100;
export const MAX_HARDWARE_READING_AGE_MS = 30_000;
export const MAX_HARDWARE_CLOCK_SKEW_MS = 60_000;
export const SIMULATED_TEST_LABEL = "SIMULATED TEST ONLY";

export function validateDeviceTelemetryPayload(payload, { now = Date.now(), maxAgeMs = MAX_HARDWARE_READING_AGE_MS } = {}) {
  const errors = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { valid: false, errors: ["payload must be an object"] };
  }
  if (Object.keys(payload).sort().join(",") !== ["deviceId", "label", "readings", "sentAt", "sequence"].sort().join(",")) errors.push("payload fields are incomplete or unsupported");
  if (typeof payload.deviceId !== "string" || !/^[a-zA-Z0-9._-]{1,80}$/.test(payload.deviceId)) errors.push("deviceId is invalid");
  if (typeof payload.label !== "string" || payload.label !== SIMULATED_TEST_LABEL) errors.push("label must be SIMULATED TEST ONLY");
  if (!Number.isSafeInteger(payload.sequence) || payload.sequence < 1) errors.push("sequence must be a positive safe integer");
  if (typeof payload.sentAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(payload.sentAt)) errors.push("sentAt must be an ISO-8601 UTC timestamp");
  const observedAt = Date.parse(payload.sentAt);
  if (!Number.isFinite(observedAt) || observedAt > now + MAX_HARDWARE_CLOCK_SKEW_MS || now - observedAt > maxAgeMs) errors.push("sentAt is invalid, in the future, or stale");
  if (!payload.readings || typeof payload.readings !== "object" || Array.isArray(payload.readings)) {
    errors.push("readings must be an object");
  } else {
    const keys = Object.keys(payload.readings).sort();
    if (keys.join(",") !== [...SENSOR_IDS].sort().join(",")) errors.push("readings must contain exactly moisture, rainfall, and movement");
    for (const id of SENSOR_IDS) {
      const value = payload.readings[id];
      if (!Number.isInteger(value) || value < SENSOR_VALUE_MIN || value > SENSOR_VALUE_MAX) errors.push(`${id} must be an integer from 0 to 100`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateDemoState(state) {
  const errors = [];
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return { valid: false, errors: ["state must be an object"] };
  }
  if (!Array.isArray(state.sensors) || state.sensors.length !== SENSOR_IDS.length) {
    errors.push("state.sensors must contain exactly the three known sensor channels");
  } else {
    const seen = new Set();
    for (const sensor of state.sensors) {
      if (!sensor || !SENSOR_IDS.includes(sensor.id) || seen.has(sensor.id)) {
        errors.push("sensor ids must be unique known channels");
        continue;
      }
      seen.add(sensor.id);
      if (!Number.isInteger(sensor.value) || sensor.value < SENSOR_VALUE_MIN || sensor.value > SENSOR_VALUE_MAX) {
        errors.push(`${sensor.id} must be an integer from 0 to 100`);
      }
      if (typeof sensor.healthy !== "boolean") errors.push(`${sensor.id}.healthy must be boolean`);
    }
    if (seen.size !== SENSOR_IDS.length) errors.push("all three sensor channels are required");
  }
  if (typeof state.espOnline !== "boolean") errors.push("espOnline must be boolean");
  if (state.mode !== undefined && !OPERATING_MODES.includes(state.mode)) errors.push("mode is not supported");
  if (state.scene !== undefined && normalizeScene(state.scene) !== state.scene) errors.push("scene is not supported");
  if (state.source !== undefined && !["waiting", "operator-simulation", "virtual", "virtual-fallback", "hardware-unavailable", "hardware"].includes(state.source)) {
    errors.push("source is not supported");
  }
  return { valid: errors.length === 0, errors };
}

export function validateHardwarePayload(payload, { now = Date.now(), maxAgeMs = MAX_HARDWARE_READING_AGE_MS } = {}) {
  const errors = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { valid: false, errors: ["payload must be an object"] };
  }
  if (typeof payload.deviceId !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(payload.deviceId)) errors.push("deviceId must be a short hardware identifier");
  if (!Number.isSafeInteger(payload.sequence) || payload.sequence < 0) errors.push("sequence must be a non-negative integer");
  const sentAt = Date.parse(payload.sentAt);
  if (!Number.isFinite(sentAt) || sentAt > now + MAX_HARDWARE_CLOCK_SKEW_MS || now - sentAt > maxAgeMs) errors.push("sentAt is invalid, in the future, or stale");
  if (typeof payload.controllerOnline !== "boolean") errors.push("controllerOnline must be boolean");
  if (!Array.isArray(payload.readings) || payload.readings.length !== SENSOR_IDS.length) {
    errors.push("readings must contain all three sensor channels");
  } else {
    const seen = new Set();
    for (const reading of payload.readings) {
      if (!reading || !SENSOR_IDS.includes(reading.id) || seen.has(reading.id)) {
        errors.push("reading ids must be unique known channels");
        continue;
      }
      seen.add(reading.id);
      if (reading.status !== "ok" && reading.status !== "fault") errors.push(`${reading.id}.status must be ok or fault`);
      if (!Number.isInteger(reading.value) || reading.value < SENSOR_VALUE_MIN || reading.value > SENSOR_VALUE_MAX) errors.push(`${reading.id}.value must be an integer from 0 to 100`);
    }
    if (seen.size !== SENSOR_IDS.length) errors.push("all three sensor channels are required");
  }
  return { valid: errors.length === 0, errors };
}
