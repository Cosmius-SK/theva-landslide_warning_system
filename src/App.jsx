import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, CloudRain, Droplets, Gauge, Radio, RotateCcw, ShieldCheck, Signal, WifiOff } from "lucide-react";
import { realtimeEnabled, supabase } from "./lib/supabase";
import { assess } from "./lib/risk";
import { normalizeScene, SCENE_VIEWS, sceneImagePath } from "./lib/scenes";

const initialSensors = [
  { id: "moisture", name: "Soil moisture", unit: "Moisture", value: 22, icon: Droplets, description: "Water saturation in the slope" },
  { id: "rainfall", name: "Rainfall", unit: "Rainfall", value: 18, icon: CloudRain, description: "Rain intensity in the demonstration" },
  { id: "movement", name: "Ground movement", unit: "Movement", value: 12, icon: Activity, description: "Movement detected in the slope model" }
];

function HillScene({ sensors, risk, scene = "panorama", onSceneChange, audience = false }) {
  const moisture = Number(sensors.find(s => s.id === "moisture")?.value || 0);
  const rainfall = Number(sensors.find(s => s.id === "rainfall")?.value || 0);
  const movement = Number(sensors.find(s => s.id === "movement")?.value || 0);
  const sensorById = new Map(sensors.map(sensor => [sensor.id, sensor]));
  const wet = moisture >= 35 || rainfall >= 35;
  const sensorStates = [
    { id: "rainfall", label: "Rainfall", value: rainfall, failed: Boolean(sensorById.get("rainfall")?.failed), x: 50, y: 27 },
    { id: "moisture", label: "Soil moisture", value: moisture, failed: Boolean(sensorById.get("moisture")?.failed), x: 72, y: 68 },
    { id: "movement", label: "Ground movement", value: movement, failed: Boolean(sensorById.get("movement")?.failed), x: 87, y: 53 }
  ].map(sensor => ({ ...sensor, active: !sensor.failed && sensor.value >= 35 }));
  const moistureSensor = sensorStates.find(sensor => sensor.id === "moisture");
  const rainfallSensor = sensorStates.find(sensor => sensor.id === "rainfall");
  const movementSensor = sensorStates.find(sensor => sensor.id === "movement");
  const [imageError, setImageError] = useState(null);
  const rainOpacity = Math.min(0.9, rainfall / 100);
  const seepageOpacity = Math.max(0, Math.min(0.9, (moisture - 20) / 80));
  const movementOpacity = Math.max(0, Math.min(0.95, movement / 100));
  const visualDescription = `Hillside simulation. Model state: ${risk.level}. Rainfall ${rainfallSensor.failed ? "unavailable" : `${rainfall}%`}; soil moisture ${moistureSensor.failed ? "unavailable" : `${moisture}%`}; ground movement ${movementSensor.failed ? "unavailable" : `${movement}%`}.`;
  const sceneImage = sceneImagePath(risk.level, scene);
  const fallbackImage = "/images/theva-cinematic-hillside.png";
  const usingFallback = imageError === sceneImage;
  const imageUnavailable = imageError === fallbackImage;
  const displayedImage = usingFallback ? fallbackImage : sceneImage;
  useEffect(() => setImageError(null), [sceneImage]);
  const explanation = risk.level === "Evacuation"
    ? "The model's highest alert is showing. This is a classroom simulation—ask your teacher what the model is telling us."
    : risk.level === "High"
      ? "Several readings are high. The slope model shows a big change, so let's look closely together."
      : risk.level === "Unavailable"
        ? "Some readings are missing, so the model cannot check the slope yet. Let's ask our operator for help."
        : risk.level === "Watch"
          ? movement >= 35
            ? "The ground movement number is rising. Let's watch the hillside together."
            : moisture >= 35
              ? "The soil has more water in it. Wet soil can feel heavier, so let's keep watching."
              : rainfall >= 35
                ? "Rain is falling harder on the hillside. Let's see whether water gathers in the soil."
                : "A sensor reading is rising. Let's keep watching the hillside together."
          : "The slope model is calm. Let's try raising a sensor and watch the picture change.";
  return <section className={"hill-scene " + risk.tone + (audience ? " audience-hill" : "")} aria-label="Cinematic hillside simulation of slope conditions">
    <div className="hill-scene-head"><div><span className="card-kicker">LIVE SLOPE MODEL</span><h3>{risk.level === "Evacuation" ? "Evacuation alert in model" : risk.level === "High" ? "Slope under stress" : wet ? "Water entering the slope" : "Slope conditions"}</h3></div><span className={"hill-risk-state " + risk.tone} role="status" aria-live="polite" aria-atomic="true">{risk.level === "Evacuation" ? "⚠ " : ""}{risk.level}</span></div>
    <div className={`hill-visual ${imageUnavailable ? "image-failed" : ""}`}>
      {!imageUnavailable && <img key={displayedImage} className="hill-visual-image" src={displayedImage} alt={visualDescription} onError={() => setImageError(usingFallback ? fallbackImage : sceneImage)} />}
      {!imageUnavailable && <>
        <svg className="hill-overlays" viewBox="0 0 1672 936" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <rect className={`risk-wash ${risk.tone}`} x="0" y="0" width="1672" height="936" />
          <g className={`hill-rain ${rainfall >= 35 ? "active" : ""}`} style={{ opacity: rainOpacity }}>
            <path d="M410 0l-24 82m118-54-24 82m126-46-25 84m131-102-24 84m122-47-25 84m129-116-25 85m136-47-24 84m128-101-24 84m122-48-24 84m124-109-24 84m111-48-24 85m112-108-24 84" />
            <path d="M460 137l-18 62m118-47-18 62m130-89-18 62m136-46-18 62m126-88-18 62m140-46-18 62m135-89-18 62m126-46-18 62m125-88-18 62" />
          </g>
          <g className={`hill-seepage ${moisture >= 35 ? "active" : ""}`} style={{ opacity: seepageOpacity }}>
            <path d="M1188 423c-13 49 14 61-4 100s-5 51-18 83m78-105c-14 36 10 52-10 86s-8 46-20 67m-101-86c-10 29 12 41-7 68" />
            <path d="M1148 543c-15 25-13 43-7 62m119-22c-11 22-10 37-3 52" className="seepage-branch" />
          </g>
          <g className={`hill-fractures ${movement >= 35 ? "active" : ""} ${risk.tone}`} style={{ opacity: movement >= 35 ? movementOpacity : 0 }}>
            <path d="M1392 454l-20 24 24 19-31 27 22 19-27 33" />
            {movement >= 60 && <path d="M1456 480l-17 19 18 17-24 23 20 18-23 27" />}
          </g>
          {movement >= 35 && <g className={`hill-slip ${risk.tone}`} style={{ opacity: Math.max(0.24, movementOpacity) }}>
            <path d="M1467 412c-28 18-49 39-67 63" />
            <path d="M1386 467l13 8 3-15" />
          </g>}
        </svg>
        <div className="visual-sensors" aria-hidden="true">{sensorStates.map(sensor => <div className={`visual-sensor ${sensor.id} ${sensor.active ? "active" : ""} ${sensor.failed ? "failed" : ""}`} key={sensor.id} style={{ left: `${sensor.x}%`, top: `${sensor.y}%` }}>
          <span className="visual-sensor-pin"><i /></span>
          <span className="visual-sensor-tag">{sensor.label} · {sensor.failed ? "NO SIGNAL" : `${sensor.value}%`}</span>
        </div>)}</div>
      </>}
      {imageUnavailable && <div className="landscape-error" role="alert">The hillside image could not be loaded. Sensor readings and the risk state are still available below.</div>}
    </div>
    <div className="scene-picker-row">
      <span className="scene-current" aria-live="polite">{usingFallback ? "Standard landscape fallback" : SCENE_VIEWS.find(view => view.id === scene)?.label || "Panorama"}</span>
      {onSceneChange ? <div className="scene-picker" role="group" aria-label="Choose hillside scene view">
        {SCENE_VIEWS.map(view => <button key={view.id} type="button" className={view.id === scene ? "selected" : ""} aria-pressed={view.id === scene} onClick={() => onSceneChange(view.id)}>{view.label}</button>)}
      </div> : <span className="scene-following">Scene follows the operator</span>}
    </div>
    {usingFallback && <p className="scene-fallback-note" role="status">This scene could not load, so the standard hillside image is shown.</p>}
    <div className="hill-readings">{sensorStates.map(sensor=><span className={sensor.failed ? "reading-failed" : sensor.active ? "reading-active" : ""} key={sensor.id}><b>{sensor.failed ? "—" : `${sensor.value}%`}</b>{sensor.label}</span>)}</div>
    <div className="hill-explanation"><span className="theva-guide-mark" aria-hidden="true">T</span><div className="theva-guide-copy"><b>Theva says</b><p>{explanation}</p></div></div>
    <div className="hill-steps"><span className={rainfall >= 35 ? "step-active" : ""}>1 <b>Rain adds water</b></span><i>→</i><span className={moisture >= 35 ? "step-active" : ""}>2 <b>Soil gets heavier</b></span><i>→</i><span className={movement >= 35 ? "step-active" : ""}>3 <b>Ground may move</b></span></div>
  </section>;
}

export default function App() {
  const [page, setPage] = useState(window.location.pathname.startsWith("/operator") ? "operator" : "welcome");
  const [sensors, setSensors] = useState(initialSensors);
  const [faults, setFaults] = useState([]);
  const [espOnline, setEspOnline] = useState(true);
  const [mode, setMode] = useState("auto");
  const [scene, setScene] = useState("panorama");
  const [virtual, setVirtual] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [feedback, setFeedback] = useState([]);
  const [rating, setRating] = useState("5");
  const [learning, setLearning] = useState("Yes");
  const [comment, setComment] = useState("");
  const [sessionStart, setSessionStart] = useState(Date.now());
  const [secondsLeft, setSecondsLeft] = useState(420);
  const [operatorToken, setOperatorToken] = useState("");
  const [operatorOwnerId] = useState(() => crypto.randomUUID());
  const [lockStatus, setLockStatus] = useState("unlocked");
  const [lockError, setLockError] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [sharedState, setSharedState] = useState(null);
  const [sharedUpdatedAt, setSharedUpdatedAt] = useState(null);
  const [syncStatus, setSyncStatus] = useState(realtimeEnabled ? "connecting" : "not-configured");
  const [publishError, setPublishError] = useState("");

  const activeSensors = sensors.map(s => ({ ...s, failed: faults.includes(s.id) || !espOnline }));
  const values = activeSensors.filter(s => !s.failed).map(s => s.value);
  const risk = useMemo(() => assess(values), [sensors, faults, espOnline]);
  const healthy = activeSensors.filter(s => !s.failed).length;
  const degraded = healthy < 3 || !espOnline;

  // Load shared state and subscribe to Supabase database changes.
  useEffect(() => {
    let channel;
    let mounted = true;
    async function loadState() {
      try {
        const response = await fetch("/api/state", { cache: "no-store" });
        if (!response.ok) throw new Error("Shared state API unavailable");
        const data = await response.json();
        if (mounted) {
          if (data.state) { setSharedState(data.state); setSharedUpdatedAt(data.updatedAt); }
          setSyncStatus("connected");
        }
      } catch { if (mounted) setSyncStatus("offline"); }
    }
    loadState();
    if (supabase) {
      channel = supabase.channel("theva-demo-state")
        .on("postgres_changes", { event: "*", schema: "public", table: "demo_state", filter: "id=eq.1" }, payload => {
          if (mounted && payload.new?.state) {
            setSharedState(payload.new.state);
            setSharedUpdatedAt(payload.new.updated_at);
            setSyncStatus("connected");
          }
        })
        .subscribe(status => {
          if (!mounted) return;
          if (status === "SUBSCRIBED") setSyncStatus("connected");
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setSyncStatus("offline");
        });
    } else setSyncStatus("not-configured");
    return () => { mounted = false; if (channel && supabase) supabase.removeChannel(channel); };
  }, []);

  // Audience fallback sync: poll the authoritative API as well as Realtime.
  // This recovers from missed websocket events, mobile sleep, and reconnects.
  useEffect(() => {
    if (page !== "audience") return;
    let stopped = false;
    let inFlight = false;
    async function refreshSharedState() {
      if (stopped || inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        const response = await fetch("/api/state?refresh=" + Date.now(), { cache: "no-store" });
        if (!response.ok) throw new Error("Shared state unavailable");
        const data = await response.json();
        if (!stopped && data.state) {
          setSharedState(data.state);
          setSharedUpdatedAt(data.updatedAt);
          setSyncStatus("connected");
        }
      } catch {
        if (!stopped) setSyncStatus("offline");
      } finally {
        inFlight = false;
      }
    }
    const onVisibility = () => { if (document.visibilityState === "visible") refreshSharedState(); };
    window.addEventListener("focus", refreshSharedState);
    window.addEventListener("online", refreshSharedState);
    document.addEventListener("visibilitychange", onVisibility);
    refreshSharedState();
    const timer = window.setInterval(refreshSharedState, 2000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshSharedState);
      window.removeEventListener("online", refreshSharedState);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [page]);

  // Keep the server-side operator lease alive while this console is active.
  useEffect(() => {
    if (!operatorToken || lockStatus !== "active") return;
    async function renewLock() {
      try {
        const response = await fetch("/api/operator-lock", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + operatorToken },
          body: JSON.stringify({ action: "renew", ownerId: operatorOwnerId })
        });
        if (!response.ok) throw new Error("Operator lock lost. This console is now read-only; another operator may have taken over.");
      } catch (error) {
        setLockStatus("lost");
        setLockError(error.message);
        setOperatorToken("");
      }
    }
    const timer = window.setInterval(renewLock, 10000);
    const releaseOnClose = () => {
      fetch("/api/operator-lock", {
        method: "POST", keepalive: true,
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + operatorToken },
        body: JSON.stringify({ action: "release", ownerId: operatorOwnerId })
      }).catch(() => {});
    };
    window.addEventListener("pagehide", releaseOnClose);
    return () => { window.clearInterval(timer); window.removeEventListener("pagehide", releaseOnClose); };
  }, [operatorToken, lockStatus, operatorOwnerId]);

  async function connectOperator() {
    const candidate = tokenInput.trim();
    if (!candidate) { setLockError("Enter the operator access token first."); return; }
    setLockError("");
    try {
      const response = await fetch("/api/operator-lock", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + candidate },
        body: JSON.stringify({ action: "acquire", ownerId: operatorOwnerId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not acquire operator lock.");
      // Restore the last cloud state before this newly elected operator publishes.
      const snapshotResponse = await fetch("/api/state", { cache: "no-store" });
      if (!snapshotResponse.ok) throw new Error("Operator lock acquired, but the latest shared state could not be loaded. Try connecting again.");
      const snapshot = await snapshotResponse.json();
      if (snapshot.state) {
        const saved = snapshot.state;
        if (saved.scene) setScene(normalizeScene(saved.scene));
        if (Array.isArray(saved.sensors)) {
          setSensors(prev => prev.map(sensor => {
            const remote = saved.sensors.find(item => item.id === sensor.id);
            return remote ? { ...sensor, value: Number(remote.value) } : sensor;
          }));
          setFaults(saved.sensors.filter(item => item.healthy === false).map(item => item.id));
        }
        if (typeof saved.espOnline === "boolean") setEspOnline(saved.espOnline);
        if (saved.mode) setMode(saved.mode);
        setSharedState(saved);
        setSharedUpdatedAt(snapshot.updatedAt);
      }
      setOperatorToken(candidate);
      setLockStatus("active");
      setPublishError("");
    } catch (error) {
      setOperatorToken("");
      setLockStatus("blocked");
      setLockError(error.message);
    }
  }

  // Publish operator state only while this browser owns the server-side lock.
  useEffect(() => {
    if (page !== "operator" || !operatorToken || lockStatus !== "active") return;
    const timer = setTimeout(async () => {
      try {
        setPublishError("");
        const state = {
          sensors: sensors.map(sensor => ({
            id: sensor.id, name: sensor.name, value: sensor.value,
            healthy: !faults.includes(sensor.id) && espOnline
          })),
          espOnline, source: "operator-simulation", mode, scene,
          publishedAt: new Date().toISOString()
        };
        const response = await fetch("/api/state", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + operatorToken },
          body: JSON.stringify({ state, ownerId: operatorOwnerId })
        });
        if (!response.ok) {
          if (response.status === 401) throw new Error("Operator token rejected. Check the Vercel OPERATOR_ACCESS_TOKEN value.");
          throw new Error("Could not publish state. Check the API and Supabase configuration.");
        }
        const data = await response.json();
        setSharedState(data.state); setSharedUpdatedAt(data.updatedAt); setSyncStatus("connected");
      } catch (error) { setPublishError(error.message); setSyncStatus("offline"); }
    }, 250);
    return () => clearTimeout(timer);
  }, [page, operatorToken, operatorOwnerId, lockStatus, sensors, faults, espOnline, mode, scene]);

  useEffect(() => {
    const t = setInterval(() => setLastUpdate(new Date()), 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (page !== "audience") return;
    const t = setInterval(() => setSecondsLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [page, sessionStart]);

  useEffect(() => {
    if (secondsLeft === 0 && page === "audience") setPage("expired");
  }, [secondsLeft, page]);

  function changeValue(id, value) {
    setSensors(prev => prev.map(s => s.id === id ? { ...s, value: Number(value) } : s));
    setLastUpdate(new Date());
  }
  function toggleFault(id) {
    setFaults(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  function resetSystem() {
    setFaults([]);
    setEspOnline(true);
    setSensors(initialSensors);
    setLastUpdate(new Date());
  }
  function startAudience() {
    setSessionStart(Date.now());
    setSecondsLeft(420);
    setPage("audience");
  }
  function submitFeedback(e) {
    e.preventDefault();
    setFeedback(prev => [{ id: crypto.randomUUID(), at: new Date().toISOString(), rating, learning, comment }, ...prev]);
    setComment("");
    setPage("thanks");
  }

  const live = page === "audience";
  const audienceSensors = sharedState?.sensors?.length ? sharedState.sensors.map(s => ({ ...s, failed: !s.healthy })) : activeSensors;
  const audienceValues = audienceSensors.filter(s => !s.failed).map(s => s.value);
  const audienceRisk = assess(audienceValues);
  const audienceScene = normalizeScene(sharedState?.scene || scene);
  const showOperator = page === "operator" || page === "diagnostics" || page === "feedback-admin";
  const statusLabel = degraded ? "DEGRADED MONITORING" : "SYSTEM HEALTHY";

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#" onClick={e => {e.preventDefault(); setPage("operator");}}>
        <span className="brand-mark">T</span><span><b>THEVA LIVE</b><small>LANDSLIDE EARLY WARNING SYSTEM</small></span>
      </a>
      <div className="top-actions"><span className="connection"><i className={"dot " + (syncStatus === "connected" ? "online" : "offline")} />{syncStatus === "connected" ? "CLOUD SYNC" : syncStatus === "not-configured" ? "LOCAL MODE" : "CLOUD OFFLINE"}</span><span className="mode-chip">DEMO BUILD 0.2</span></div>
    </header>

    {showOperator && <div className="workspace">
      <aside className="sidebar">
        <div className="side-label">WORKSPACE</div>
        <button className={page === "operator" ? "nav active" : "nav"} onClick={() => setPage("operator")}><Gauge size={17}/> Operator console</button>
        <button className={page === "diagnostics" ? "nav active" : "nav"} onClick={() => setPage("diagnostics")}><Activity size={17}/> Diagnostics</button>
        <button className={page === "feedback-admin" ? "nav active" : "nav"} onClick={() => setPage("feedback-admin")}><ShieldCheck size={17}/> Feedback <span className="nav-count">{feedback.length}</span></button>
        <div className="side-bottom"><div className="health-mini"><span className="dot online"/> Prototype running</div><small>Local simulation · No cloud link yet</small></div>
      </aside>

      <main className="main-content">
        <div className="page-heading"><div><div className="eyebrow">THEVA'S SCIENCE PROJECT</div><h1>{page === "operator" ? "Operator console" : page === "diagnostics" ? "System diagnostics" : "Audience feedback"}</h1><p>Monitor the slope model and demonstrate how warning indicators respond.</p></div><div className="page-heading-actions">{page === "operator" && <button className="btn secondary" onClick={() => setPage("welcome")}>Preview audience experience ↗</button>}<button className="btn secondary" onClick={resetSystem} disabled={showOperator && lockStatus !== "active"}><RotateCcw size={15}/> Reset system</button></div></div>

        {page === "operator" && <>
          <div className="status-strip"><div className="status-icon"><Radio size={20}/></div><div><b>{statusLabel}</b><small>{degraded ? "One or more inputs are unavailable. Risk and equipment health are assessed separately." : "All three simulated sensor channels are responding."}</small></div><span className="updated">Updated {lastUpdate.toLocaleTimeString()}</span></div>
          <div className="metrics-grid">
            <section className={"risk-card " + risk.tone}><div className="card-kicker">CURRENT LANDSLIDE INDICATION</div><div className="risk-main"><div><div className="risk-level">{risk.level}</div><p>{risk.message}</p></div><div className="risk-emblem"><AlertTriangle size={30}/></div></div><div className="risk-foot"><span>DEMO THRESHOLD MODEL</span><span>NOT A REAL FORECAST</span></div></section>
            <section className="health-card"><div className="card-kicker">SENSOR AVAILABILITY</div><div className="health-number">{healthy}<small> / 3</small></div><div className="health-track"><span style={{width: (healthy/3*100)+"%"}}/></div><p>{healthy === 3 ? "All inputs healthy" : healthy + " of 3 inputs responding"}</p></section>
          </div>
          <HillScene sensors={activeSensors} risk={risk} scene={scene} onSceneChange={lockStatus === "active" ? setScene : undefined} />
          <div className="section-head"><div><h2>Sensor inputs</h2><p>Adjust the virtual controls or inject a sensor fault.</p></div><span className="pill">SIMULATED INPUTS</span></div>
          <div className="sensor-grid">{sensors.map(sensor => {
            const Icon = sensor.icon; const failed = faults.includes(sensor.id) || !espOnline;
            return <section className={"sensor-card " + (failed ? "failed" : "")} key={sensor.id}>
              <div className="sensor-top"><div className="sensor-icon"><Icon size={19}/></div><span className={"sensor-state " + (failed ? "bad" : "good")}>{failed ? "FAULT" : "HEALTHY"}</span></div>
              <h3>{sensor.name}</h3><p>{sensor.description}</p>
              <div className="slider-row"><input aria-label={sensor.name} type="range" min="0" max="100" value={sensor.value} onChange={e => changeValue(sensor.id, e.target.value)} disabled={failed || lockStatus !== "active"}/><b>{sensor.value}</b></div>
              <div className="scale"><span>LOW</span><span>HIGH</span></div>
              <button className={"fault-btn " + (failed ? "restore" : "")} onClick={() => toggleFault(sensor.id)} disabled={lockStatus !== "active"}>{failed ? "Restore sensor" : "Simulate sensor fault"}</button>
            </section>;
          })}</div>
          <div className="section-head"><div><h2>Live audience sync</h2><p>Enter the operator token configured in Vercel. Changes publish automatically to audience devices.</p></div><span className="pill">{syncStatus.toUpperCase()}</span></div>
          <section className="controls-card"><div className="control-copy"><div className="control-icon"><Radio size={19}/></div><div><b>Single operator access</b><p>{lockStatus === "active" ? "This browser owns the live operator session." : "Only one browser can control and publish the live demonstration at a time."}</p></div></div><input type="password" placeholder="Paste operator token" value={tokenInput} onChange={e => setTokenInput(e.target.value)} /><button className="btn secondary" onClick={connectOperator} disabled={lockStatus === "active"}>{lockStatus === "active" ? "Operator connected" : "Connect operator"}</button></section>
          {lockError && <p className="disclaimer">{lockError}</p>}
          {publishError && <p className="disclaimer">{publishError}</p>}
          <p className="disclaimer">Cloud sync: {syncStatus}. Audience devices receive updates through Supabase Realtime when configured.</p>
          <div className="section-head"><div><h2>System controls</h2><p>Demonstrate communication failure and fallback behaviour.</p></div></div>
          <section className="controls-card">
            <div className="control-copy"><div className="control-icon"><WifiOff size={19}/></div><div><b>ESP32 communication</b><p>Simulate loss of the controller heartbeat.</p></div></div>
            <button className={espOnline ? "btn secondary" : "btn danger"} onClick={() => setEspOnline(v => !v)} disabled={lockStatus !== "active"}>{espOnline ? "Disconnect ESP32" : "Reconnect ESP32"}</button>
          </section>
          <section className="controls-card"><div className="control-copy"><div className="control-icon"><Signal size={19}/></div><div><b>Operating preference</b><p>Automatic prefers healthy hardware; virtual mode is a manual demonstration override.</p></div></div><select value={mode} onChange={e => setMode(e.target.value)} disabled={lockStatus !== "active"}><option value="auto">Automatic</option><option value="virtual">Virtual override</option><option value="hardware">Hardware only</option></select></section>
          <div className="disclaimer">Educational simulation only. The thresholds are illustrative and are not calibrated for real-world landslide prediction or evacuation decisions.</div>
        </>}

        {page === "diagnostics" && <><div className="diagnostic-grid"><section className="health-card"><div className="card-kicker">CONTROLLER</div><h2>{espOnline ? "Connected (simulated)" : "No heartbeat"}</h2><p>{espOnline ? "The prototype is simulating an active ESP32 link." : "Controller link is unavailable. Hardware readings must not be treated as current."}</p></section><section className="health-card"><div className="card-kicker">DATA FRESHNESS</div><h2>{lastUpdate.toLocaleTimeString()}</h2><p>Local prototype timestamp. Cloud freshness monitoring is not connected yet.</p></section></div><div className="section-head"><div><h2>Channel diagnostics</h2><p>Sensor status is independent of the landslide risk indication.</p></div></div><div className="diag-list">{activeSensors.map(s => <div className="diag-row" key={s.id}><span className={"dot " + (s.failed ? "offline" : "online")}/><b>{s.name}</b><span>{s.failed ? "No response" : "Responding"}</span><small>{s.failed ? "Input excluded from healthy-channel count" : "Simulation channel available"}</small></div>)}</div></>}
        {page === "feedback-admin" && <><div className="section-head"><div><h2>Feedback submissions</h2><p>{feedback.length} submissions stored in this browser session.</p></div><button className="btn secondary" onClick={() => {const csv = ["id,timestamp,rating,learned,comment", ...feedback.map(f => [f.id,f.at,f.rating,f.learning,JSON.stringify(f.comment)].join(","))].join("\n"); const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"})); a.download="theva-feedback.csv"; a.click(); URL.revokeObjectURL(a.href);}}>Export CSV</button></div>{feedback.length ? feedback.map(f => <div className="feedback-row" key={f.id}><b>{f.rating}/5 · Learned: {f.learning}</b><small>{new Date(f.at).toLocaleString()}</small><p>{f.comment || "No comment"}</p></div>) : <div className="empty-state">No feedback received yet.</div>}<p className="disclaimer">Prototype limitation: feedback currently remains in this browser only. Persistent cloud storage and protected admin access are planned next.</p></>}
      </main>
    </div>}

    {page === "audience" && <main className="audience-page"><div className="audience-top"><span className="pill live-pill"><i className="dot online"/> LIVE DEMONSTRATION</span><span className="timer">SESSION ENDS IN {Math.floor(secondsLeft/60)}:{String(secondsLeft%60).padStart(2,"0")}</span></div><div className="audience-title"><div className="eyebrow">THEVA'S SCIENCE PROJECT</div><h1>Landslide Early Warning System</h1><p>Watch how changing slope conditions can trigger an early warning.</p></div><HillScene sensors={audienceSensors} risk={audienceRisk} scene={audienceScene} audience /><div className={"audience-risk " + audienceRisk.tone}><span>CURRENT INDICATION</span><h2>{audienceRisk.level}</h2><p>{audienceRisk.message}</p></div><div className="audience-sensors">{audienceSensors.map(s => <div className="audience-sensor" key={s.id}><span className={"dot " + (s.failed ? "offline" : "online")}/><b>{s.name}</b><small>{s.failed ? "Sensor unavailable" : "Monitoring active"}</small></div>)}</div><p className="disclaimer">Educational demonstration only. This is not a real landslide warning service.</p><p className="disclaimer">Data: {sharedState ? "Shared live state" : "Local preview"} · {sharedUpdatedAt ? "Updated " + new Date(sharedUpdatedAt).toLocaleTimeString() : "Waiting for operator data"} · Cloud {syncStatus}</p><button className="btn secondary" onClick={() => setPage("feedback")}>Share feedback</button></main>}

    {page === "welcome" && <main className="welcome-page"><div className="welcome-art"><div className="mountain m1"/><div className="mountain m2"/><div className="sun"/></div><div className="welcome-content"><div className="eyebrow">A GRADE 2 SCIENCE PROJECT</div><h1>Small signals.<br/><em>Safer slopes.</em></h1><p className="welcome-lead">I'm Theva, and I'm exploring how technology can help detect landslide danger and protect lives.</p><div className="welcome-info"><span><ShieldCheck/> Learn how early warnings work</span><span><Activity/> Explore changing slope conditions</span><span><Radio/> Watch a live demonstration</span></div><button className="btn primary large" onClick={startAudience}>Explore the live demo <span>→</span></button><small className="welcome-note">A learning model · Not a real-world prediction system</small></div></main>}

    {page === "feedback" && <main className="form-page"><button className="text-btn" onClick={() => setPage("audience")}>← Back to live demo</button><div className="eyebrow">THEVA WOULD LOVE YOUR FEEDBACK</div><h1>How was the demonstration?</h1><form onSubmit={submitFeedback}><label>How would you rate the demo?</label><div className="rating-options">{["1","2","3","4","5"].map(n => <button type="button" className={rating===n?"chosen":""} onClick={() => setRating(n)} key={n}>{n}</button>)}</div><label>Did you learn something new?</label><select value={learning} onChange={e => setLearning(e.target.value)}><option>Yes</option><option>A little</option><option>No</option></select><label>Any suggestions? (optional)</label><textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Share a thought..." rows="4"/><button className="btn primary large" type="submit">Submit feedback</button></form></main>}
    {page === "expired" && <main className="form-page centered"><div className="eyebrow">THANK YOU FOR EXPLORING</div><h1>This demo session has ended.</h1><p>We hope you discovered something new about landslide early warning systems.</p><button className="btn primary large" onClick={() => setPage("welcome")}>Return to welcome page</button><button className="text-btn" onClick={() => setPage("feedback")}>Share feedback</button></main>}
    {page === "thanks" && <main className="form-page centered"><div className="success-mark"><CheckCircle2 size={34}/></div><h1>Thank you!</h1><p>Your feedback has been recorded in this prototype.</p><button className="btn primary" onClick={() => setPage("welcome")}>Back to welcome page</button></main>}

    <footer className="footer"><span>THEVA LIVE <i>·</i> EDUCATIONAL PROTOTYPE</span><span>Built to learn. Designed to protect.</span></footer>
  </div>;
}
