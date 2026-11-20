import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, CloudRain, Droplets, Gauge, Radio, RotateCcw, ShieldCheck, Signal, WifiOff } from "lucide-react";
import { realtimeEnabled, supabase } from "./lib/supabase";

const initialSensors = [
  { id: "moisture", name: "Soil moisture", unit: "Moisture", value: 22, icon: Droplets, description: "Water saturation in the slope" },
  { id: "rainfall", name: "Rainfall", unit: "Rainfall", value: 18, icon: CloudRain, description: "Rain intensity in the demonstration" },
  { id: "movement", name: "Ground movement", unit: "Movement", value: 12, icon: Activity, description: "Movement detected in the slope model" }
];

function assess(values) {
  const high = values.filter(v => v >= 60).length;
  const critical = values.filter(v => v >= 80).length;
  if (values.length === 0) return { level: "Unavailable", tone: "watch", message: "No healthy sensor inputs are available. The system cannot assess the simulated slope." };
  if (critical >= 2) return { level: "Evacuation", tone: "critical", message: "Multiple indicators are critical. Evacuate the demonstration zone." };
  if (critical >= 1 || high >= 2) return { level: "High", tone: "high", message: "High-risk conditions detected. Take precautionary action." };
  if (values.some(v => v >= 35)) return { level: "Watch", tone: "watch", message: "Conditions are changing. Continue monitoring the slope." };
  return { level: "Safe", tone: "safe", message: "No warning threshold is currently crossed in this simulation." };
}

export default function App() {
  const [page, setPage] = useState(window.location.pathname.startsWith("/operator") ? "operator" : "welcome");
  const [sensors, setSensors] = useState(initialSensors);
  const [faults, setFaults] = useState([]);
  const [espOnline, setEspOnline] = useState(true);
  const [mode, setMode] = useState("auto");
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
          espOnline, source: "operator-simulation", mode,
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
  }, [page, operatorToken, operatorOwnerId, lockStatus, sensors, faults, espOnline, mode]);

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
        <div className="page-heading"><div><div className="eyebrow">THEVA'S SCIENCE PROJECT</div><h1>{page === "operator" ? "Operator console" : page === "diagnostics" ? "System diagnostics" : "Audience feedback"}</h1><p>Monitor the slope model and demonstrate how warning indicators respond.</p></div><button className="btn secondary" onClick={resetSystem} disabled={showOperator && lockStatus !== "active"}><RotateCcw size={15}/> Reset system</button></div>

        {page === "operator" && <>
          <div className="status-strip"><div className="status-icon"><Radio size={20}/></div><div><b>{statusLabel}</b><small>{degraded ? "One or more inputs are unavailable. Risk and equipment health are assessed separately." : "All three simulated sensor channels are responding."}</small></div><span className="updated">Updated {lastUpdate.toLocaleTimeString()}</span></div>
          <div className="metrics-grid">
            <section className={"risk-card " + risk.tone}><div className="card-kicker">CURRENT LANDSLIDE INDICATION</div><div className="risk-main"><div><div className="risk-level">{risk.level}</div><p>{risk.message}</p></div><div className="risk-emblem"><AlertTriangle size={30}/></div></div><div className="risk-foot"><span>DEMO THRESHOLD MODEL</span><span>NOT A REAL FORECAST</span></div></section>
            <section className="health-card"><div className="card-kicker">SENSOR AVAILABILITY</div><div className="health-number">{healthy}<small> / 3</small></div><div className="health-track"><span style={{width: (healthy/3*100)+"%"}}/></div><p>{healthy === 3 ? "All inputs healthy" : healthy + " of 3 inputs responding"}</p></section>
          </div>
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

    {page === "audience" && <main className="audience-page"><div className="audience-top"><span className="pill live-pill"><i className="dot online"/> LIVE DEMONSTRATION</span><span className="timer">SESSION ENDS IN {Math.floor(secondsLeft/60)}:{String(secondsLeft%60).padStart(2,"0")}</span></div><div className="audience-title"><div className="eyebrow">THEVA'S SCIENCE PROJECT</div><h1>Landslide Early Warning System</h1><p>Watch how changing slope conditions can trigger an early warning.</p></div><div className={"audience-risk " + audienceRisk.tone}><span>CURRENT INDICATION</span><h2>{audienceRisk.level}</h2><p>{audienceRisk.message}</p></div><div className="audience-sensors">{audienceSensors.map(s => <div className="audience-sensor" key={s.id}><span className={"dot " + (s.failed ? "offline" : "online")}/><b>{s.name}</b><small>{s.failed ? "Sensor unavailable" : "Monitoring active"}</small></div>)}</div><p className="disclaimer">Educational demonstration only. This is not a real landslide warning service.</p><p className="disclaimer">Data: {sharedState ? "Shared live state" : "Local preview"} · {sharedUpdatedAt ? "Updated " + new Date(sharedUpdatedAt).toLocaleTimeString() : "Waiting for operator data"} · Cloud {syncStatus}</p><button className="btn secondary" onClick={() => setPage("feedback")}>Share feedback</button></main>}

    {page === "welcome" && <main className="welcome-page"><div className="welcome-art"><div className="mountain m1"/><div className="mountain m2"/><div className="sun"/></div><div className="welcome-content"><div className="eyebrow">A GRADE 2 SCIENCE PROJECT</div><h1>Small signals.<br/><em>Safer slopes.</em></h1><p className="welcome-lead">I'm Theva, and I'm exploring how technology can help detect landslide danger and protect lives.</p><div className="welcome-info"><span><ShieldCheck/> Learn how early warnings work</span><span><Activity/> Explore changing slope conditions</span><span><Radio/> Watch a live demonstration</span></div><button className="btn primary large" onClick={startAudience}>Explore the live demo <span>→</span></button><small className="welcome-note">A learning model · Not a real-world prediction system</small></div></main>}

    {page === "feedback" && <main className="form-page"><button className="text-btn" onClick={() => setPage("audience")}>← Back to live demo</button><div className="eyebrow">THEVA WOULD LOVE YOUR FEEDBACK</div><h1>How was the demonstration?</h1><form onSubmit={submitFeedback}><label>How would you rate the demo?</label><div className="rating-options">{["1","2","3","4","5"].map(n => <button type="button" className={rating===n?"chosen":""} onClick={() => setRating(n)} key={n}>{n}</button>)}</div><label>Did you learn something new?</label><select value={learning} onChange={e => setLearning(e.target.value)}><option>Yes</option><option>A little</option><option>No</option></select><label>Any suggestions? (optional)</label><textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Share a thought..." rows="4"/><button className="btn primary large" type="submit">Submit feedback</button></form></main>}
    {page === "expired" && <main className="form-page centered"><div className="eyebrow">THANK YOU FOR EXPLORING</div><h1>This demo session has ended.</h1><p>We hope you discovered something new about landslide early warning systems.</p><button className="btn primary large" onClick={() => setPage("welcome")}>Return to welcome page</button><button className="text-btn" onClick={() => setPage("feedback")}>Share feedback</button></main>}
    {page === "thanks" && <main className="form-page centered"><div className="success-mark"><CheckCircle2 size={34}/></div><h1>Thank you!</h1><p>Your feedback has been recorded in this prototype.</p><button className="btn primary" onClick={() => setPage("welcome")}>Back to welcome page</button></main>}

    <footer className="footer"><span>THEVA LIVE <i>·</i> EDUCATIONAL PROTOTYPE</span><span>Built to learn. Designed to protect.</span></footer>
    {page === "operator" && <button className="audience-launch" onClick={() => setPage("welcome")}>Preview audience experience ↗</button>}
  </div>;
}