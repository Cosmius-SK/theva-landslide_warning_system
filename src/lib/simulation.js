export function simulateSlopeReadings(tick = 0) {
  const phase = ((Math.max(0, Math.floor(tick)) % 72) / 72) * Math.PI * 2;
  const wave = offset => (1 + Math.sin(phase - Math.PI / 2 - offset)) / 2;
  return {
    rainfall: Math.round(15 + 75 * wave(0)),
    moisture: Math.round(20 + 70 * wave(0.9)),
    movement: Math.round(5 + 90 * wave(1.8))
  };
}
