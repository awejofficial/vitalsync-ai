import { HOSPITALS, AMBULANCE_DEPOTS, distanceKm } from "./hospitals";
import { useStore } from "./store";
import type { EmergencyCase, Hospital, TriageResult } from "./types";

function pickHospital(patient: { lat: number; lng: number }, triage: TriageResult): Hospital {
  const candidates = HOSPITALS
    .map((h) => {
      const dist = distanceKm(patient, h);
      const specialistMatch = h.specialists.some((s) =>
        s.toLowerCase().includes(triage.specialist.toLowerCase().split(" ")[0])
      );
      const icuOk = triage.severity === "CRITICAL" ? h.icuBeds > 0 : true;
      const capacityOk = h.emergencyBeds > 0;
      let score = 0;
      score -= dist * 2; // closer is better
      if (specialistMatch) score += 15;
      if (icuOk) score += 10;
      if (capacityOk) score += 5;
      score += h.rating * 2;
      return { h, score, dist, specialistMatch, icuOk, capacityOk };
    })
    .filter((c) => c.capacityOk)
    .sort((a, b) => b.score - a.score);
  return (candidates[0]?.h) ?? HOSPITALS[0];
}

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

export async function dispatchPipeline(caseId: string, triage: TriageResult) {
  const store = useStore.getState();
  const c = store.cases[caseId];
  if (!c) return;

  // 1. Triage completed
  store.updateCase(caseId, { triage, status: "TRIAGE_COMPLETED" });
  store.pushLog(caseId, {
    ts: Date.now(),
    agent: "TRIAGE",
    level: triage.severity === "CRITICAL" ? "critical" : "info",
    message: `Severity ${triage.severity} — ${triage.condition}. Needs ${triage.specialist}. < ${triage.timeSensitivityMin} min window.`,
  });

  await wait(700);

  // 2. Hospital finder
  const hospital = pickHospital(c.location, triage);
  store.pushLog(caseId, {
    ts: Date.now(),
    agent: "HOSPITAL",
    level: "success",
    message: `Matched ${hospital.name} — ${hospital.icuBeds} ICU beds, ${hospital.emergencyBeds} ER beds available.`,
  });
  store.updateCase(caseId, { hospital, status: "HOSPITAL_ASSIGNED" });

  await wait(700);

  // 3. Ambulance assignment — nearest depot
  const depot = AMBULANCE_DEPOTS
    .map((d) => ({ d, dist: distanceKm(d, c.location) }))
    .sort((a, b) => a.dist - b.dist)[0].d;

  const route = buildRoute({ lat: depot.lat, lng: depot.lng }, c.location);
  const etaMin = Math.max(4, Math.round(distanceKm(depot, c.location) * 2.4));
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
    message: `${depot.callsign} dispatched. ETA ${etaMin} min. Route optimized, traffic-aware.`,
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
    message: `${hospital.name} ${triage.specialist} alerted. Prep: ${triage.preparationSteps.slice(0, 2).join(", ")}.`,
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
