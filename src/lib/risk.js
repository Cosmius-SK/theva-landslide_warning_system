export function assess(values) {
  const high = values.filter(value => value >= 60).length;
  const critical = values.filter(value => value >= 80).length;
  if (values.length === 0) {
    return { level: "Unavailable", tone: "watch", message: "No healthy sensor inputs are available. The system cannot assess the simulated slope." };
  }
  if (critical >= 2) {
    return { level: "Evacuation", tone: "critical", message: "The model's highest alert is on. Pause the demonstration and ask the grown-up leading it what happens next." };
  }
  if (critical >= 1 || high >= 2) {
    return { level: "High", tone: "high", message: "Several signals are high. The model is showing a big change in the slope." };
  }
  if (values.some(value => value >= 35)) {
    return { level: "Watch", tone: "watch", message: "A reading is rising. Let's keep watching how the slope model changes." };
  }
  return { level: "Safe", tone: "safe", message: "The slope model is calm right now. Try changing a sensor to see what happens." };
}
