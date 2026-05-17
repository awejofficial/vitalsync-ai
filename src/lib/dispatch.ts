import { AMBULANCE_DEPOTS, distanceKm } from "./hospitals";
import { useStore } from "./store";
import type { EmergencyCase, Hospital, TriageResult, Severity, BackendEmergencyResponse } from "./types";

function buildRoute(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Array<[number, number]> {
  // Simple multi-waypoint path with slight jitter to look like routed road
  const steps = 40;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lat = from.lat + (to.lat - from.lat) * t;
    const lng = from.lng + (to.lng - from.lng) * t;
    const jitter = Math.sin(t * Math.PI * 3) * 0.0015;
    pts.push([lat + jitter, lng - jitter * 0.7]);
  }
  return pts;
}

export async function dispatchPipeline(caseId: string, backendRes: BackendEmergencyResponse) {
  const store = useStore.getState();
  const c = store.cases[caseId];
  if (!c) return;

  // 1. Triage completed
  const triage: TriageResult = {
    severity: (backendRes.severity_level || "URGENT") as Severity,
    condition: backendRes.suspected_condition,
    specialist: backendRes.required_specialist,
    timeSensitivityMin: 30,
    requiredEquipment: [],
    preparationSteps: [],
    reasoning: "Triage via Backend LangGraph",
  };

  store.updateCase(caseId, { triage, status: "TRIAGE_COMPLETED" });
  store.pushLog(caseId, {
    ts: Date.now(),
    agent: "TRIAGE",
    level: triage.severity === "CRITICAL" ? "critical" : "info",
    message: `Severity ${triage.severity} — ${triage.condition}. Needs ${triage.specialist}.`,
  });

  await wait(700);

  // 2. Hospital finder
  const hospital: Hospital = {
    id: backendRes.selected_hospital.id || "1",
    name: backendRes.selected_hospital.name,
    lat: backendRes.selected_hospital.lat,
    lng: backendRes.selected_hospital.lng,
    icuBeds: 5, // Mock data since backend doesn't return capacity yet
    emergencyBeds: 10,
    specialists: [backendRes.required_specialist],
    rating: Number(backendRes.selected_hospital.rating) || 4.0,
  };

  store.pushLog(caseId, {
    ts: Date.now(),
    agent: "HOSPITAL",
    level: "success",
    message: `Matched ${hospital.name} — Rating: ${hospital.rating}.`,
  });
  store.updateCase(caseId, { hospital, status: "HOSPITAL_ASSIGNED" });

  await wait(700);

  // 3. Ambulance assignment — dynamic depot near patient
  const depot = {
    id: `dynamic-${Math.floor(Math.random() * 1000)}`,
    callsign: `RELAY-${Math.floor(Math.random() * 90) + 10}`,
    lat: c.location.lat + (Math.random() - 0.5) * 0.05,
    lng: c.location.lng + (Math.random() - 0.5) * 0.05,
  };

  const route = buildRoute({ lat: depot.lat, lng: depot.lng }, c.location);
  const etaMin = Math.round(backendRes.eta_minutes) || Math.max(4, Math.round(distanceKm(depot, c.location) * 2.4));
  store.updateCase(caseId, {
    ambulance: {
      id: depot.id,
      callsign: depot.callsign,
      lat: depot.lat,
      lng: depot.lng,
      etaMin,
      speedKmh: 58,
    },
    route,
    routeProgress: 0,
    status: "AMBULANCE_ASSIGNED",
  });
  store.pushLog(caseId, {
    ts: Date.now(),
    agent: "AMBULANCE",
    level: "info",
    message: `${depot.callsign} dispatched. ETA ${etaMin} min. ${backendRes.route_details || "Route optimized."}`,
  });

  await wait(700);

  // 4. Doctor briefing
  store.updateCase(caseId, {
    status: "DOCTOR_ALERTED",
    vitals: { bp: simulateBP(triage.severity), hr: simulateHR(triage.severity), spo2: simulateSpO2(triage.severity) },
  });
  store.pushLog(caseId, {
    ts: Date.now(),
    agent: "DOCTOR",
    level: "success",
    message: `Doctor Brief: ${backendRes.doctor_brief}`,
  });

  await wait(500);
  store.setStatus(caseId, "PATIENT_EN_ROUTE");
  startAmbulanceSimulation(caseId);
}

function simulateBP(sev: string) {
  if (sev === "CRITICAL") return "160/100";
  if (sev === "URGENT") return "145/92";
  return "128/82";
}
function simulateHR(sev: string) {
  if (sev === "CRITICAL") return 118;
  if (sev === "URGENT") return 102;
  return 88;
}
function simulateSpO2(sev: string) {
  if (sev === "CRITICAL") return 89;
  if (sev === "URGENT") return 94;
  return 97;
}

const TICKERS = new Map<string, ReturnType<typeof setInterval>>();

export function startAmbulanceSimulation(caseId: string) {
  if (TICKERS.has(caseId)) return;
  const tick = setInterval(() => {
    const c = useStore.getState().cases[caseId];
    if (!c || !c.route || !c.ambulance) {
      clearInterval(tick);
      TICKERS.delete(caseId);
      return;
    }
    const progress = Math.min(1, (c.routeProgress ?? 0) + 0.018);
    const idx = Math.floor(progress * (c.route.length - 1));
    const [lat, lng] = c.route[idx];
    const remaining = Math.max(0, Math.round(c.ambulance.etaMin * (1 - progress)));
    useStore.getState().updateCase(caseId, {
      routeProgress: progress,
      ambulance: { ...c.ambulance, lat, lng, etaMin: remaining },
    });

    if (progress >= 1) {
      useStore.getState().setStatus(caseId, "PATIENT_ARRIVED");
      useStore.getState().pushLog(caseId, {
        ts: Date.now(),
        agent: "SYSTEM",
        level: "success",
        message: `Patient arrived at ${c.hospital?.name}. Handover to ${c.triage?.specialist}.`,
      });
      clearInterval(tick);
      TICKERS.delete(caseId);
    }
  }, 600);
  TICKERS.set(caseId, tick);
}

function wait(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}
