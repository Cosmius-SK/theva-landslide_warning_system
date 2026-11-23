import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { Activity, AlertTriangle, CheckCircle2, CloudRain, Droplets, Gauge, Radio, RotateCcw, ShieldCheck, Signal, WifiOff } from "lucide-react";
import { realtimeEnabled, supabase } from "./lib/supabase";
import { assess } from "./lib/risk";
import { normalizeScene, SCENE_VIEWS, sceneImagePath } from "./lib/scenes";
import { isCurrentOrNewerUpdate } from "./lib/shared-state";
import { apiFetch } from "./lib/api-fetch";

const initialSensors = [
  { id: "moisture", name: "Soil moisture", unit: "Moisture", value: 22, icon: Droplets, description: "Water saturation in the slope" },
  { id: "rainfall", name: "Rainfall", unit: "Rainfall", value: 18, icon: CloudRain, description: "Rain intensity in the demonstration" },
  { id: "movement", name: "Ground movement", unit: "Movement", value: 12, icon: Activity, description: "Movement detected in the slope model" }
];

async function readJsonResponse(response) {
  try { return await response.json(); } catch { return {}; }
}

function getAudienceTokenFromUrl() {
  return new URLSearchParams(window.location.hash.slice(1)).get("session") || "";
}

function HillScene({ sensors, risk, scene = "panorama", onSceneChange, audience = false, compact = false }) {
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
  return <section className={"hill-scene " + risk.tone + (audience ? " audience-hill" : compact ? " operator-hill" : "")} aria-label="Cinematic hillside simulation of slope conditions">
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
    {!compact && !audience && <div className="hill-readings">{sensorStates.map(sensor=><span className={sensor.failed ? "reading-failed" : sensor.active ? "reading-active" : ""} key={sensor.id}><b>{sensor.failed ? "—" : `${sensor.value}%`}</b>{sensor.label}</span>)}</div>}
    {!compact && <div className="hill-explanation"><span className="theva-guide-mark" aria-hidden="true">T</span><div className="theva-guide-copy"><b>Theva says</b><p>{explanation}</p></div></div>}
    {!compact && <div className="hill-steps"><span className={rainfall >= 35 ? "step-active" : ""}>1 <b>Rain adds water</b></span><i>→</i><span className={moisture >= 35 ? "step-active" : ""}>2 <b>Soil gets heavier</b></span><i>→</i><span className={movement >= 35 ? "step-active" : ""}>3 <b>Ground may move</b></span></div>}
  </section>;
}

export default function App() {
  const [page, setPage] = useState(() => {
    if (window.location.pathname.startsWith("/operator")) return "operator";
    return window.location.pathname === "/audience" && getAudienceTokenFromUrl() ? "audience-loading" : "welcome";
  });
  const [sensors, setSensors] = useState(initialSensors);
  const [faults, setFaults] = useState([]);
  const [espOnline, setEspOnline] = useState(false);
  const [mode, setMode] = useState("auto");
  const [scene, setScene] = useState("panorama");
  const [virtual, setVirtual] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [feedback, setFeedback] = useState([]);
  const [rating, setRating] = useState("5");
  const [learning, setLearning] = useState("Yes");
  const [comment, setComment] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(420);
  const [audienceToken, setAudienceToken] = useState(getAudienceTokenFromUrl);
  const [audienceExpiresAt, setAudienceExpiresAt] = useState(null);
  const [audienceSessionActive, setAudienceSessionActive] = useState(false);
  const [audienceSessionExpiresAt, setAudienceSessionExpiresAt] = useState(null);
  const [audienceSessionUrl, setAudienceSessionUrl] = useState("");
  const [audienceSessionQr, setAudienceSessionQr] = useState("");
  const [audienceSessionError, setAudienceSessionError] = useState("");
  const [operatorToken, setOperatorToken] = useState("");
  const [operatorOwnerId] = useState(() => crypto.randomUUID());
  const [lockStatus, setLockStatus] = useState("unlocked");
  const [lockError, setLockError] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [sharedState, setSharedState] = useState(null);
  const [sharedUpdatedAt, setSharedUpdatedAt] = useState(null);
  const sharedUpdatedAtRef = useRef(null);
  const [operatorMobileTab, setOperatorMobileTab] = useState("monitor");
  const [syncStatus, setSyncStatus] = useState(realtimeEnabled ? "connecting" : "not-configured");
  const [publishError, setPublishError] = useState("");

  // This checkout contains no hardware adapter. Auto therefore uses virtual values;
  // Hardware-only stays visibly unavailable until a real telemetry source is connected.
  const activeSource = mode === "hardware" ? "hardware-unavailable" : mode === "virtual" ? "virtual" : "virtual-fallback";
  const activeSensors = sensors.map(s => ({ ...s, failed: mode === "hardware" || faults.includes(s.id) }));
  const values = activeSensors.filter(s => !s.failed).map(s => s.value);
  const risk = useMemo(() => assess(values), [sensors, faults, mode]);
  const healthy = activeSensors.filter(s => !s.failed).length;
  const degraded = healthy < 3 || !espOnline || mode === "hardware";

  function acceptSharedState(nextState, updatedAt) {
    if (!nextState) return;
    if (!isCurrentOrNewerUpdate(updatedAt, sharedUpdatedAtRef.current)) return;
    if (updatedAt) sharedUpdatedAtRef.current = updatedAt;
    setSharedState(nextState);
    setSharedUpdatedAt(updatedAt || null);
  }

  // Operators load the initial snapshot. Audience sessions get their snapshot
  // from the server-side token validation below, then use Realtime plus fallback polling.
  useEffect(() => {
    let channel;
    let mounted = true;
    async function loadState() {
      try {
        const response = await apiFetch("/api/state", { cache: "no-store" });
        if (!response.ok) throw new Error("Shared state API unavailable");
        const data = await response.json();
        if (mounted) {
          if (data.state) acceptSharedState(data.state, data.updatedAt);
          setSyncStatus("connected");
        }
      } catch { if (mounted) setSyncStatus("offline"); }
    }
    if (page === "operator") loadState();
    if (supabase) {
      channel = supabase.channel("theva-demo-state")
        .on("postgres_changes", { event: "*", schema: "public", table: "demo_state", filter: "id=eq.1" }, payload => {
          if (mounted && payload.new?.state) {
            acceptSharedState(payload.new.state, payload.new.updated_at);
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
  }, [page]);

  // A signed-in audience link is only admitted after the server validates its bearer token.
  useEffect(() => {
    if (page !== "audience-loading") return;
    let stopped = false;
    async function validateLink() {
      if (!audienceToken) {
        returnToWelcome("This audience session link is missing or invalid. Ask the operator for a current link.");
        return;
      }
      try {
        const response = await apiFetch("/api/audience-session", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "validate", token: audienceToken }), cache: "no-store"
        });
        const data = await readJsonResponse(response);
        if (stopped) return;
        if (!response.ok || !data.active || !data.expiresAt) {
          returnToWelcome(response.status === 410 ? "This audience session has ended. Ask the operator for a new link." : "This audience session link is invalid. Ask the operator for a current link.");
          return;
        }
        acceptSharedState(data.state || null, data.updatedAt || null);
        setAudienceExpiresAt(data.expiresAt);
        setSecondsLeft(Math.max(0, Math.ceil((Date.parse(data.expiresAt) - Date.now()) / 1000)));
        setAudienceSessionError("");
        setPage("audience");
      } catch {
        if (!stopped) returnToWelcome("The audience session could not be verified. Reconnect and try the link again.");
      }
    }
    validateLink();
    return () => { stopped = true; };
  }, [page, audienceToken]);

  useEffect(() => {
    function onAudienceLinkChange() {
      if (window.location.pathname !== "/audience") return;
      const nextToken = getAudienceTokenFromUrl();
      if (!nextToken) {
        returnToWelcome("This audience session link is missing or invalid. Ask the operator for a current link.");
        return;
      }
      setAudienceSessionError("");
      setAudienceExpiresAt(null);
      setAudienceToken(nextToken);
      setPage("audience-loading");
    }
    window.addEventListener("hashchange", onAudienceLinkChange);
    return () => window.removeEventListener("hashchange", onAudienceLinkChange);
  }, []);

  // Audience fallback sync: poll the authoritative API as well as Realtime.
  // Every refresh is authorized against the same server-side session and original expiry.
  useEffect(() => {
    if (page !== "audience" || !audienceToken) return;
    let stopped = false;
    let inFlight = false;
    let pollTimer;
    let pollDelay = 5_000;
    async function refreshSharedState() {
      if (stopped || inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        const response = await apiFetch("/api/audience-session", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "validate", token: audienceToken }), cache: "no-store"
        });
        const data = await readJsonResponse(response);
        if ([401, 410].includes(response.status) || (response.ok && !data.active)) {
          if (!stopped) returnToWelcome("This audience session has ended. Ask the operator for a new link.");
          return;
        }
        if (!response.ok) throw new Error("Audience session service unavailable");
        if (!stopped) {
          acceptSharedState(data.state || null, data.updatedAt || null);
          setSyncStatus("connected");
          pollDelay = 5_000;
        }
      } catch {
        if (!stopped) {
          setSyncStatus("offline");
          pollDelay = Math.min(30_000, Math.max(2_000, pollDelay * 2));
        }
      } finally {
        inFlight = false;
        if (!stopped) pollTimer = window.setTimeout(refreshSharedState, pollDelay);
      }
    }
    const onVisibility = () => { if (document.visibilityState === "visible") refreshSharedState(); };
    window.addEventListener("focus", refreshSharedState);
    window.addEventListener("online", refreshSharedState);
    document.addEventListener("visibilitychange", onVisibility);
    refreshSharedState();
    pollTimer = window.setTimeout(refreshSharedState, pollDelay);
    return () => {
      stopped = true;
      window.clearTimeout(pollTimer);
      window.removeEventListener("focus", refreshSharedState);
      window.removeEventListener("online", refreshSharedState);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [page, audienceToken]);

  // Keep the server-side operator lease alive while this console is active.
  useEffect(() => {
    if (!operatorToken || lockStatus !== "active") return;
    async function renewLock() {
      try {
        const response = await apiFetch("/api/operator-lock", {
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
      apiFetch("/api/operator-lock", {
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
      const response = await apiFetch("/api/operator-lock", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + candidate },
        body: JSON.stringify({ action: "acquire", ownerId: operatorOwnerId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not acquire operator lock.");
      // Restore the last cloud state before this newly elected operator publishes.
      const snapshotResponse = await apiFetch("/api/state", { cache: "no-store" });
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
        acceptSharedState(saved, snapshot.updatedAt);
      }
      try {
        const sessionResponse = await apiFetch("/api/audience-session", {
          method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + candidate },
          body: JSON.stringify({ action: "status", ownerId: operatorOwnerId }), cache: "no-store"
        });
        const sessionData = await readJsonResponse(sessionResponse);
        if (sessionResponse.ok) {
          setAudienceSessionActive(Boolean(sessionData.active));
          setAudienceSessionExpiresAt(sessionData.expiresAt || null);
          setAudienceSessionUrl("");
      setAudienceSessionQr("");
        }
      } catch { /* The operator can retry session controls after connecting. */ }
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
            healthy: mode !== "hardware" && !faults.includes(sensor.id)
          })),
          espOnline, source: activeSource, mode, scene,
          publishedAt: new Date().toISOString()
        };
        const response = await apiFetch("/api/state", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + operatorToken },
          body: JSON.stringify({ state, ownerId: operatorOwnerId })
        });
        if (!response.ok) {
          if (response.status === 401) throw new Error("Operator token rejected. Check the Vercel OPERATOR_ACCESS_TOKEN value.");
          throw new Error("Could not publish state. Check the API and Supabase configuration.");
        }
        const data = await response.json();
        acceptSharedState(data.state, data.updatedAt); setSyncStatus("connected");
      } catch (error) { setPublishError(error.message); setSyncStatus("offline"); }
    }, 250);
    return () => clearTimeout(timer);
  }, [page, operatorToken, operatorOwnerId, lockStatus, sensors, faults, espOnline, mode, scene, activeSource]);

  useEffect(() => {
    if (page !== "feedback-admin" || lockStatus !== "active") return;
    let stopped = false;
    async function loadFeedback() {
      try {
        const response = await apiFetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + operatorToken },
          body: JSON.stringify({ action: "list", ownerId: operatorOwnerId }),
          cache: "no-store"
        });
        const data = await readJsonResponse(response);
        if (!response.ok) throw new Error(data.error || "Could not load saved feedback.");
        if (!stopped) { setFeedback(data.feedback || []); setFeedbackError(""); }
      } catch (error) {
        if (!stopped) setFeedbackError(error.message);
      }
    }
    loadFeedback();
    return () => { stopped = true; };
  }, [page, lockStatus, operatorToken, operatorOwnerId]);

  useEffect(() => {
    const t = setInterval(() => setLastUpdate(new Date()), 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (page !== "audience" || !audienceExpiresAt) return;
    const updateRemaining = () => {
      const remaining = Math.max(0, Math.ceil((Date.parse(audienceExpiresAt) - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) returnToWelcome("This audience session has ended. Ask the operator for a new link.");
    };
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [page, audienceExpiresAt]);

  function returnToWelcome(message = "") {
    const url = new URL(window.location.href);
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    window.history.replaceState({}, "", url.pathname);
    setAudienceToken("");
    setAudienceExpiresAt(null);
    setAudienceSessionActive(false);
    setAudienceSessionUrl("");
    setAudienceSessionQr("");
    setAudienceSessionError(message);
    setPage("welcome");
  }

  async function operatorSessionRequest(action) {
    const response = await apiFetch("/api/audience-session", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + operatorToken },
      body: JSON.stringify({ action, ownerId: operatorOwnerId }),
      cache: "no-store"
    });
    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data.error || "Could not update the audience session.");
    return data;
  }

  async function startAudienceSession() {
    try {
      setAudienceSessionQr("");
      setAudienceSessionError("");
      const data = await operatorSessionRequest("start");
      setAudienceSessionActive(true);
      setAudienceSessionExpiresAt(data.expiresAt);
      const sessionUrl = `${window.location.origin}/audience#session=${encodeURIComponent(data.token)}`;
      setAudienceSessionUrl(sessionUrl);
      try {
        const qr = await QRCode.toDataURL(sessionUrl, { errorCorrectionLevel: "M", margin: 2, width: 240 });
        setAudienceSessionQr(qr);
      } catch { setAudienceSessionError("Session link is ready, but its QR code could not be created. Copy the link instead."); }
    } catch (error) { setAudienceSessionError(error.message); }
  }

  async function endAudienceSession() {
    try {
      await operatorSessionRequest("end");
      setAudienceSessionActive(false);
      setAudienceSessionExpiresAt(null);
      setAudienceSessionUrl("");
      setAudienceSessionQr("");
      setAudienceSessionError("");
    } catch (error) { setAudienceSessionError(error.message); }
  }

  async function copyAudienceSessionLink() {
    try {
      await navigator.clipboard.writeText(audienceSessionUrl);
      setAudienceSessionError("Audience link copied.");
    } catch {
      setAudienceSessionError("Copy was unavailable. Select and copy the audience link.");
    }
  }

  function changeValue(id, value) {
    setSensors(prev => prev.map(s => s.id === id ? { ...s, value: Number(value) } : s));
    setLastUpdate(new Date());
  }
  function toggleFault(id) {
    setFaults(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  async function resetSystem() {
    let sessionError = "";
    if (audienceSessionActive && lockStatus === "active") {
      try {
        await operatorSessionRequest("end");
        setAudienceSessionActive(false);
        setAudienceSessionExpiresAt(null);
        setAudienceSessionUrl("");
        setAudienceSessionQr("");
      } catch (error) { sessionError = `Demo reset, but its audience session could not be ended: ${error.message}`; }
    }
    setFaults([]);
    setEspOnline(true);
    setSensors(initialSensors);
    setMode("auto");
    setScene("panorama");
    setLastUpdate(new Date());
    if (sessionError) setAudienceSessionError(sessionError);
  }
  async function submitFeedback(e) {
    e.preventDefault();
    setFeedbackError("");
    try {
      const response = await apiFetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit", token: audienceToken, rating: Number(rating), learning, comment }),
        cache: "no-store"
      });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data.error || "Feedback could not be saved. Please try again.");
      setFeedback(prev => [data.feedback, ...prev]);
      setComment("");
      setPage("thanks");
    } catch (error) { setFeedbackError(error.message); }
  }

  const live = page === "audience";
  const audienceSensors = sharedState?.sensors?.length ? sharedState.sensors.map(s => ({ ...s, failed: s.healthy !== true })) : activeSensors;
  const audienceValues = audienceSensors.filter(s => !s.failed).map(s => s.value);
  const audienceRisk = assess(audienceValues);
  const audienceScene = normalizeScene(sharedState?.scene || scene);
  const showOperator = page === "operator" || page === "diagnostics" || page === "feedback-admin";
  const statusLabel = mode === "hardware" ? "HARDWARE INPUT UNAVAILABLE" : degraded ? "VIRTUAL FALLBACK ACTIVE" : "VIRTUAL MODEL READY";

  return <div className={"app-shell" + (page === "audience" ? " audience-shell" : page === "operator" ? " operator-shell" : "")}>
    <header className="topbar">
      <a className="brand" href="#" onClick={e => {e.preventDefault(); setPage("operator");}}>
        <span className="brand-mark">T</span><span><b>THEVA LIVE</b><small>LANDSLIDE EARLY WARNING SYSTEM</small></span>
      </a>
      <div className="top-actions"><span className="connection"><i className={"dot " + (syncStatus === "connected" ? "online" : "offline")} />{syncStatus === "connected" ? "CLOUD SYNC" : syncStatus === "not-configured" ? "LOCAL MODE" : "CLOUD OFFLINE"}</span><span className="mode-chip">DEMO BUILD 0.2</span></div>
    </header>

    {showOperator && <div className={"workspace" + (page === "operator" ? " operator-workspace" : "")}>
      <aside className="sidebar">
        <div className="side-label">WORKSPACE</div>
        <button className={page === "operator" ? "nav active" : "nav"} onClick={() => setPage("operator")}><Gauge size={17}/> Operator console</button>
        <button className={page === "diagnostics" ? "nav active" : "nav"} onClick={() => setPage("diagnostics")}><Activity size={17}/> Diagnostics</button>
        <button className={page === "feedback-admin" ? "nav active" : "nav"} onClick={() => setPage("feedback-admin")}><ShieldCheck size={17}/> Feedback <span className="nav-count">{feedback.length}</span></button>
        <div className="side-bottom"><div className="health-mini"><span className={"dot " + (syncStatus === "connected" ? "online" : "offline")}/>{syncStatus === "connected" ? "Cloud connected" : "Cloud not connected"}</div><small>{activeSource === "hardware-unavailable" ? "Hardware-only · no adapter" : activeSource === "virtual-fallback" ? "Automatic · virtual fallback" : "Virtual override"}</small></div>
      </aside>

      <main className={"main-content " + (page === "operator" ? `operator-content operator-tab-${operatorMobileTab}` : "")}>
        <div className="page-heading"><div><div className="eyebrow">THEVA'S SCIENCE PROJECT</div><h1>{page === "operator" ? "Operator console" : page === "diagnostics" ? "System diagnostics" : "Audience feedback"}</h1><p>Monitor the slope model and demonstrate how warning indicators respond.</p></div><div className="page-heading-actions">{page === "operator" && <button className="btn secondary" onClick={() => setPage("welcome")}>Preview audience experience ↗</button>}<button className="btn secondary" onClick={resetSystem} disabled={showOperator && lockStatus !== "active"}><RotateCcw size={15}/> Reset system</button></div></div>

        {page === "operator" && <>
          <div className="mobile-console-switch" role="tablist" aria-label="Operator console view">
            <button id="operator-monitor-tab" role="tab" aria-controls="operator-monitor-panel" aria-selected={operatorMobileTab === "monitor"} onClick={() => setOperatorMobileTab("monitor")}>Monitor</button>
            <button id="operator-controls-tab" role="tab" aria-controls="operator-controls-panel" aria-selected={operatorMobileTab === "controls"} onClick={() => setOperatorMobileTab("controls")}>Inputs</button>
            <button id="operator-session-tab" role="tab" aria-controls="operator-controls-panel" aria-selected={operatorMobileTab === "session"} onClick={() => setOperatorMobileTab("session")}>Session</button>
          </div>
          <div className="status-strip"><div className="status-icon"><Radio size={18}/></div><div><b>{statusLabel}</b><small>{mode === "hardware" ? "No ESP32 telemetry adapter is connected. Switch to Automatic or Virtual to continue the simulation." : `${healthy} of 3 simulation channels available · simulated controller heartbeat ${espOnline ? "on" : "off"}.`}</small></div><span className="updated">{syncStatus === "connected" ? "CLOUD SYNC" : syncStatus === "not-configured" ? "LOCAL MODE" : "CLOUD OFFLINE"}</span></div>
          <div className="operator-live-layout">
            <section id="operator-monitor-panel" className="operator-monitor-panel" role="tabpanel" aria-labelledby="operator-monitor-tab">
              <div className="metrics-grid operator-metrics">
                <section className={"risk-card " + risk.tone}><div className="card-kicker">CURRENT LANDSLIDE INDICATION</div><div className="risk-main"><div><div className="risk-level">{risk.level}</div><p>{risk.message}</p></div><div className="risk-emblem"><AlertTriangle size={25}/></div></div><div className="risk-foot"><span>DEMO MODEL</span><span>NOT A FORECAST</span></div></section>
                <section className="health-card"><div className="card-kicker">AVAILABLE INPUTS</div><div className="health-number">{healthy}<small> / 3</small></div><div className="health-track"><span style={{width: (healthy/3*100)+"%"}}/></div><p>{healthy === 3 ? "All channels active" : healthy + " channels active"}</p></section>
              </div>
              <HillScene sensors={activeSensors} risk={risk} scene={scene} onSceneChange={lockStatus === "active" ? setScene : undefined} compact />
              <p className="operator-source-note">Input: {mode === "hardware" ? "Hardware only · unavailable" : mode === "virtual" ? "Virtual override" : "Automatic · virtual fallback"} · Scene follows the shared risk state.</p>
            </section>

            <section id="operator-controls-panel" className="operator-controls-panel" role="tabpanel" aria-labelledby="operator-controls-tab">
              <div className="section-head compact-section-head"><div><h2>Sensor inputs</h2><p>Adjust values or test a channel fault.</p></div><span className="pill">{mode === "hardware" ? "NO DEVICE" : "SIMULATION"}</span></div>
              <div className="sensor-grid">{sensors.map(sensor => {
                const Icon = sensor.icon; const simulatedFault = faults.includes(sensor.id); const failed = mode === "hardware" || simulatedFault;
                return <section className={"sensor-card " + (failed ? "failed" : "")} key={sensor.id}>
                  <div className="sensor-top"><div className="sensor-icon"><Icon size={16}/></div><span className={"sensor-state " + (failed ? "bad" : "good")}>{mode === "hardware" ? "UNAVAILABLE" : simulatedFault ? "FAULT" : "HEALTHY"}</span></div>
                  <h3>{sensor.name}</h3>
                  <div className="slider-row"><input aria-label={sensor.name} type="range" min="0" max="100" value={sensor.value} onChange={e => changeValue(sensor.id, e.target.value)} disabled={failed || lockStatus !== "active"}/><b>{failed ? "—" : sensor.value}</b></div>
                  <button className={"fault-btn " + (simulatedFault ? "restore" : "")} onClick={() => toggleFault(sensor.id)} disabled={lockStatus !== "active" || mode === "hardware"}>{mode === "hardware" ? "Switch input mode to resume" : simulatedFault ? "Restore sensor" : "Simulate sensor fault"}</button>
                </section>;
              })}</div>

              <div className="operator-quick-controls">
                <label><span>Operating mode</span><select value={mode} onChange={e => setMode(e.target.value)} disabled={lockStatus !== "active"}><option value="auto">Automatic fallback</option><option value="virtual">Virtual override</option><option value="hardware">Hardware only</option></select></label>
                <div className="heartbeat-control"><div><b>Controller heartbeat</b><small>Simulation only · no ESP32 connected</small></div><button className="btn secondary" onClick={() => setEspOnline(v => !v)} disabled={lockStatus !== "active"}>{espOnline ? "Set offline" : "Set online"}</button></div>
              </div>

              <div className="operator-access-card">
                <div className="operator-access-row"><div><b>Operator connection</b><small>{lockStatus === "active" ? "This browser owns the control lock." : "Connect to enable sensor and session controls."}</small></div>{lockStatus !== "active" && <><input type="password" aria-label="Operator access token" placeholder="Operator token" value={tokenInput} onChange={e => setTokenInput(e.target.value)} /><button className="btn secondary" onClick={connectOperator}>Connect</button></>}</div>
                {lockError && <p className="session-message" role="status">{lockError}</p>}
                {publishError && <p className="session-message" role="status">{publishError}</p>}
                <div className="audience-session-card">
                  <div className="operator-access-row"><div><b>Audience session</b><small>{audienceSessionActive ? `Active until ${audienceSessionExpiresAt ? new Date(audienceSessionExpiresAt).toLocaleTimeString() : "expiry"}.` : "Server-validated · 7 minutes"}</small></div><div className="audience-session-actions"><button className="btn secondary" onClick={startAudienceSession} disabled={lockStatus !== "active"}>{audienceSessionActive ? "Replace link" : "Start session"}</button>{audienceSessionActive && <button className="btn danger" onClick={endAudienceSession} disabled={lockStatus !== "active"}>End</button>}</div></div>
                  {audienceSessionActive && audienceSessionUrl && <div className="audience-session-link"><input aria-label="Audience session link" value={audienceSessionUrl} readOnly onFocus={e => e.target.select()} /><button className="btn secondary" onClick={copyAudienceSessionLink}>Copy</button>{audienceSessionQr && <img className="audience-session-qr" src={audienceSessionQr} alt="QR code for the active audience session" />}</div>}
                  {audienceSessionActive && !audienceSessionUrl && <small className="session-link-note">Link hidden after reconnect. Replace it to issue a new link.</small>}
                  {audienceSessionError && <p className="session-message" role="status">{audienceSessionError}</p>}
                </div>
              </div>
            </section>
          </div>
        </>}

        {page === "diagnostics" && <><div className="diagnostic-grid"><section className="health-card"><div className="card-kicker">HARDWARE ADAPTER</div><h2>Not connected</h2><p>No ESP32 firmware or telemetry adapter is present in this checkout. The heartbeat control is a simulation only.</p></section><section className="health-card"><div className="card-kicker">INPUT SOURCE</div><h2>{mode === "hardware" ? "Unavailable" : mode === "virtual" ? "Virtual override" : "Automatic · virtual fallback"}</h2><p>{mode === "hardware" ? "Hardware-only mode correctly reports no usable readings." : "Illustrative virtual readings are currently used."}</p></section><section className="health-card"><div className="card-kicker">CLOUD / REALTIME</div><h2>{syncStatus.toUpperCase()}</h2><p>Last shared-state update: {sharedUpdatedAt ? new Date(sharedUpdatedAt).toLocaleString() : "No cloud update received"}.</p></section></div><div className="section-head"><div><h2>Channel diagnostics</h2><p>Sensor faults and environmental risk are reported separately.</p></div></div><div className="diag-list">{activeSensors.map(s => <div className="diag-row" key={s.id}><span className={"dot " + (s.failed ? "offline" : "online")}/><b>{s.name}</b><span>{s.failed ? mode === "hardware" ? "Unavailable" : "Simulated fault" : "Simulation input"}</span><small>{s.failed ? "Excluded from the risk calculation" : "Available virtual channel"}</small></div>)}</div>{publishError && <p className="disclaimer">{publishError}</p>}</>}
        {page === "feedback-admin" && <><div className="section-head"><div><h2>Feedback submissions</h2><p>{lockStatus === "active" ? `${feedback.length} persistent submissions loaded.` : "Connect the active operator console to review saved feedback."}</p></div>{lockStatus === "active" && <button className="btn secondary" onClick={() => {const csv = ["id,timestamp,rating,learned,comment", ...feedback.map(f => [f.id,f.created_at,f.rating,f.learning,JSON.stringify(f.comment)].join(","))].join("\n"); const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"})); a.download="theva-feedback.csv"; a.click(); URL.revokeObjectURL(a.href);}}>Export CSV</button>}</div>{feedbackError && <p className="session-message" role="status">{feedbackError}</p>}{lockStatus === "active" && (feedback.length ? feedback.map(f => <div className="feedback-row" key={f.id}><b>{f.rating}/5 · Learned: {f.learning}</b><small>{new Date(f.created_at).toLocaleString()}</small><p>{f.comment || "No comment"}</p></div>) : <div className="empty-state">No feedback received yet.</div>)}</>}
      </main>
    </div>}

    {page === "audience-loading" && <main className="form-page centered" aria-live="polite"><div className="eyebrow">CHECKING SESSION LINK</div><h1>Getting the live demonstration ready…</h1><p>The session link is being checked with the operator.</p></main>}
    {page === "audience" && <main className="audience-page">
      <div className="audience-top"><span className="pill live-pill"><i className="dot online"/> LIVE DEMONSTRATION</span><span className="timer">SESSION ENDS IN {Math.floor(secondsLeft/60)}:{String(secondsLeft%60).padStart(2,"0")}</span></div>
      <div className="audience-title"><div className="eyebrow">THEVA'S SCIENCE PROJECT</div><h1>Small signals. Safer slopes.</h1><p>Watch rain and ground changes affect the hillside model.</p></div>
      <HillScene sensors={audienceSensors} risk={audienceRisk} scene={audienceScene} audience />
      <aside className="audience-summary">
        <div className={"audience-risk " + audienceRisk.tone}><span>CURRENT MODEL INDICATION</span><h2>{audienceRisk.level}</h2><p>{audienceRisk.message}</p>{audienceSensors.some(s => s.failed) && <small>One or more sensors are unavailable. Other healthy readings still help the model.</small>}</div>
        <div className="audience-sensors">{audienceSensors.map(s => <div className={"audience-sensor " + (s.failed ? "failed" : "")} key={s.id}><span className={"dot " + (s.failed ? "offline" : "online")}/><b>{s.name}</b><strong>{s.failed ? "—" : `${s.value}%`}</strong><small>{s.failed ? "Sensor unavailable" : "Monitoring active"}</small></div>)}</div>
        <div className="audience-session-meta"><span>{sharedState?.source === "hardware" ? "Hardware readings" : sharedState?.source === "virtual" ? "Virtual simulation" : "Automatic virtual fallback"}</span><span>{sharedUpdatedAt ? "Updated " + new Date(sharedUpdatedAt).toLocaleTimeString() : "Waiting for operator data"}</span><span>Cloud {syncStatus}</span></div>
        <p className="disclaimer">Educational demonstration only. This is not a real landslide warning service.</p>
        <button className="btn secondary audience-feedback-button" onClick={() => setPage("feedback")}>Share feedback</button>
      </aside>
    </main>}

    {page === "welcome" && <main className="welcome-page"><div className="welcome-art"><div className="mountain m1"/><div className="mountain m2"/><div className="sun"/></div><div className="welcome-content"><div className="eyebrow">A GRADE 2 SCIENCE PROJECT</div><h1>Small signals.<br/><em>Safer slopes.</em></h1><p className="welcome-lead">I'm Theva, and I'm exploring how technology can help detect landslide danger and protect lives.</p><div className="welcome-info"><span><ShieldCheck/> Learn how early warnings work</span><span><Activity/> Explore changing slope conditions</span><span><Radio/> Watch a live demonstration</span></div>{audienceSessionError && <p className="session-message" role="status">{audienceSessionError}</p>}<p className="welcome-note">Open the active audience session link shared by your operator to start the live demonstration.</p><small className="welcome-note">A learning model · Not a real-world prediction system</small></div></main>}

    {page === "feedback" && <main className="form-page"><button className="text-btn" onClick={() => setPage("audience")}>← Back to live demo</button><div className="eyebrow">THEVA WOULD LOVE YOUR FEEDBACK</div><h1>How was the demonstration?</h1><form onSubmit={submitFeedback}><fieldset className="rating-fieldset"><legend>How would you rate the demo?</legend><div className="rating-options">{["1","2","3","4","5"].map(n => <button type="button" className={rating===n?"chosen":""} aria-pressed={rating===n} onClick={() => setRating(n)} key={n}>{n}</button>)}</div></fieldset><label htmlFor="feedback-learning">Did you learn something new?</label><select id="feedback-learning" value={learning} onChange={e => setLearning(e.target.value)}><option>Yes</option><option>A little</option><option>No</option></select><label htmlFor="feedback-comment">Any suggestions? (optional)</label><textarea id="feedback-comment" maxLength={1000} value={comment} onChange={e => setComment(e.target.value)} placeholder="Share a thought..." rows="4"/><button className="btn primary large" type="submit">Submit feedback</button>{feedbackError && <p className="session-message" role="alert">{feedbackError}</p>}</form></main>}
    {page === "expired" && <main className="form-page centered"><div className="eyebrow">THANK YOU FOR EXPLORING</div><h1>This demo session has ended.</h1><p>We hope you discovered something new about landslide early warning systems.</p><button className="btn primary large" onClick={() => setPage("welcome")}>Return to welcome page</button><button className="text-btn" onClick={() => setPage("feedback")}>Share feedback</button></main>}
    {page === "thanks" && <main className="form-page centered"><div className="success-mark"><CheckCircle2 size={34}/></div><h1>Thank you!</h1><p>Your feedback has been saved.</p><button className="btn primary" onClick={() => setPage("welcome")}>Back to welcome page</button></main>}

    <footer className="footer"><span>THEVA LIVE <i>·</i> EDUCATIONAL PROTOTYPE</span><span>Built to learn. Designed to protect.</span></footer>
  </div>;
}
