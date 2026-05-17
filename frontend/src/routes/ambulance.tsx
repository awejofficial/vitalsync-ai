import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Map, { Marker } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { doc, updateDoc, onSnapshot, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { TopNav } from "@/components/TopNav";
import { StoreHydrator } from "@/components/StoreHydrator";
import { useStore } from "@/lib/store";
import {
  CheckCircle2, AlertCircle, Navigation, Ambulance,
  Clock, MapPin, HeartPulse, Activity, Gauge
} from "lucide-react";

export const Route = createFileRoute("/ambulance")({
  component: AmbulanceDashboard,
});

const EMERGENCY_STEPS = [
  { key: "accepted", label: "Accept Emergency" },
  { key: "reached_patient", label: "Reached Patient" },
  { key: "patient_picked_up", label: "Patient Picked Up" },
  { key: "en_route", label: "En Route To Hospital" },
  { key: "reached_hospital", label: "Reached Hospital" },
];

function AmbulanceDashboard() {
  const storeCases = useStore((s) => s.cases);
  const [cases, setCases] = useState<typeof storeCases>(storeCases);
  const [mounted, setMounted] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  // Simulated ambulance position (moves toward hospital over time)
  const [ambPos, setAmbPos] = useState({ lng: -122.438, lat: 37.765 });
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    setMounted(true);
    try {
      const unsub = onSnapshot(collection(db, "emergencies"), (snapshot) => {
        const liveCases: any = {};
        snapshot.forEach((d) => { liveCases[d.id] = d.data(); });
        if (Object.keys(liveCases).length > 0) setCases(liveCases);
      });
      return () => unsub();
    } catch {
      setCases(storeCases);
    }
  }, [storeCases]);

  // Simulate ambulance movement
  useEffect(() => {
    if (currentStep >= 1) {
      timerRef.current = setInterval(() => {
        setAmbPos((p) => ({ lng: p.lng + 0.001, lat: p.lat + 0.0005 }));
      }, 2000);
    }
    return () => clearInterval(timerRef.current);
  }, [currentStep]);

  const list = Object.values(cases).filter((c) => c.ambulance).sort((a, b) => b.createdAt - a.createdAt);
  const active = list[0];

  const handleStep = async (stepIndex: number, stepKey: string) => {
    setCurrentStep(stepIndex + 1);
    if (!active) return;
    try {
      await updateDoc(doc(db, "emergencies", active.id), {
        ambulanceStatus: stepKey,
        updatedAt: Date.now(),
      });
    } catch { /* local only */ }
  };

  const etaMin = active?.ambulance?.etaMin ?? 12;
  const distanceKm = ((etaMin * 0.8) - (currentStep * 1.2)).toFixed(1);
  const trafficDelay = currentStep < 2 ? "2 min delay" : "Clear route";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <StoreHydrator />
      <TopNav />
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-warning animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.8)]" />
              <div className="font-mono text-xs uppercase tracking-[0.2em] text-warning font-semibold">Ambulance Unit</div>
            </div>
            <h1 className="mt-2 font-display text-4xl font-bold tracking-tight">
              {active?.ambulance?.callsign ?? "Standby — No Active Dispatch"}
            </h1>
          </div>
          {active?.ambulance && (
            <div className="text-right">
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">ETA</div>
              <div className="font-display text-5xl font-bold tabular-nums text-warning">
                {etaMin}<span className="text-base ml-1 text-muted-foreground">min</span>
              </div>
            </div>
          )}
        </div>

        {!active ? (
          <div className="glass rounded-3xl p-16 text-center border border-border/30">
            <Ambulance className="w-16 h-16 mx-auto mb-4 opacity-20 text-warning" />
            <div className="text-muted-foreground font-mono">No active dispatch. Awaiting emergency call...</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-6">
            {/* Left: Map */}
            <div className="space-y-6">
              <div className="glass rounded-3xl overflow-hidden border border-border/50 relative">
                {/* Overlay badges */}
                <div className="absolute top-4 left-4 z-10 glass px-3 py-1.5 rounded-full border border-border/50 font-mono text-xs flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-warning animate-pulse" /> Live Navigation
                </div>
                <div className="absolute top-4 right-4 z-10 glass px-4 py-2 rounded-xl border border-border/50 text-right">
                  <div className="font-mono text-[10px] text-muted-foreground">Distance</div>
                  <div className="font-display text-2xl font-bold text-warning">{Math.max(0, parseFloat(distanceKm))} km</div>
                </div>

                {mounted ? (
                  <Map
                    initialViewState={{ longitude: ambPos.lng, latitude: ambPos.lat, zoom: 13 }}
                    style={{ height: 450, width: "100%" }}
                    mapStyle="mapbox://styles/mapbox/dark-v11"
                    mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN || "pk.eyJ1IjoiZHVtbXkiLCJhIjoiY2x1eW11b21rMGw3bTJqcW16M216In0.dummy"}
                  >
                    {/* Ambulance marker (live-moving) */}
                    <Marker longitude={ambPos.lng} latitude={ambPos.lat}>
                      <div className="w-9 h-9 rounded-full bg-warning/20 border-2 border-warning flex items-center justify-center shadow-[0_0_14px_rgba(245,158,11,0.6)] animate-pulse">
                        <Ambulance className="w-4 h-4 text-warning" />
                      </div>
                    </Marker>
                    {/* Patient marker */}
                    <Marker longitude={-122.4194} latitude={37.762}>
                      <div className="w-8 h-8 rounded-full bg-emergency/20 border-2 border-emergency flex items-center justify-center shadow-[0_0_10px_rgba(239,68,68,0.5)]">
                        <HeartPulse className="w-4 h-4 text-emergency" />
                      </div>
                    </Marker>
                    {/* Hospital marker */}
                    <Marker longitude={-122.4194} latitude={37.7749}>
                      <div className="w-8 h-8 rounded-full bg-medical/20 border-2 border-medical flex items-center justify-center shadow-[0_0_10px_rgba(16,185,129,0.5)]">
                        <span className="text-xs font-bold text-medical">H</span>
                      </div>
                    </Marker>
                  </Map>
                ) : (
                  <div className="h-[450px] bg-surface flex items-center justify-center">
                    <Navigation className="w-8 h-8 text-muted-foreground animate-spin" />
                  </div>
                )}
              </div>

              {/* Live ETA Panel */}
              <div className="grid grid-cols-3 gap-4">
                <EtaCard icon={<Navigation className="w-5 h-5 text-warning" />} label="Distance" value={`${Math.max(0, parseFloat(distanceKm))} km`} />
                <EtaCard icon={<Clock className="w-5 h-5 text-primary" />} label="Est. Arrival" value={`${Math.max(0, etaMin - currentStep * 2)} min`} />
                <EtaCard icon={<Gauge className="w-5 h-5 text-medical" />} label="Traffic" value={trafficDelay} isAlert={currentStep < 2} />
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              {/* Assigned Emergency Case */}
              <div className="glass rounded-3xl p-6 border border-border/50 relative overflow-hidden">
                <div className="absolute -top-20 -right-20 w-40 h-40 bg-warning/10 rounded-full blur-3xl pointer-events-none" />
                <div className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-emergency" /> Assigned Emergency
                </div>
                <div className="text-3xl font-display font-bold mb-1">{active.patient?.name}</div>
                <div className="text-sm text-muted-foreground mb-4">{active.patient?.age} · {active.patient?.gender} · {active.patient?.medicalHistory || "No known history"}</div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <InfoCard label="Symptoms" value={active.triage?.condition ?? "–"} />
                  <InfoCard label="Severity" value={active.triage?.severity ?? "–"} isEmergency={active.triage?.severity === "CRITICAL"} />
                  <InfoCard label="Destination" value={active.hospital?.name ?? "–"} />
                  <InfoCard label="Specialist" value={active.triage?.specialist ?? "–"} />
                </div>
                {/* Vitals */}
                <div className="grid grid-cols-3 gap-2">
                  <MiniVital label="BP" value={active.vitals?.bp ?? "—"} />
                  <MiniVital label="HR" value={active.vitals?.hr ? `${active.vitals.hr}` : "—"} />
                  <MiniVital label="SpO₂" value={active.vitals?.spo2 ? `${active.vitals.spo2}%` : "—"} />
                </div>
              </div>

              {/* Route Progress */}
              <div className="glass rounded-3xl p-5 border border-border/50">
                <div className="flex justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  <span>Depot</span>
                  <span>{Math.min(100, currentStep * 25)}%</span>
                  <span>{active.hospital?.name}</span>
                </div>
                <div className="h-2.5 w-full bg-surface rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-warning via-emergency to-medical rounded-full"
                    animate={{ width: `${Math.min(100, currentStep * 25)}%` }}
                    transition={{ duration: 0.8 }}
                  />
                </div>
              </div>

              {/* Emergency Controls */}
              <div className="glass rounded-3xl p-6 border border-border/50">
                <div className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground mb-5 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-warning" /> Emergency Controls
                </div>
                <div className="space-y-3">
                  <AnimatePresence>
                    {EMERGENCY_STEPS.map((step, i) => {
                      const isCompleted = i < currentStep;
                      const isNext = i === currentStep;
                      return (
                        <motion.button
                          key={step.key}
                          layout
                          onClick={() => isNext && handleStep(i, step.key)}
                          disabled={!isNext && !isCompleted}
                          className={`w-full flex items-center gap-3 px-5 py-4 rounded-xl font-semibold transition-all duration-200 border ${
                            isCompleted
                              ? "bg-success/10 border-success/40 text-success"
                              : isNext
                              ? "bg-warning text-background hover:opacity-90 active:scale-95 border-transparent shadow-[0_0_20px_rgba(245,158,11,0.3)]"
                              : "bg-surface/50 border-border/30 text-muted-foreground cursor-not-allowed"
                          }`}
                        >
                          {isCompleted ? (
                            <CheckCircle2 className="w-5 h-5 shrink-0" />
                          ) : (
                            <div className={`w-5 h-5 rounded-full border-2 shrink-0 ${isNext ? "border-background" : "border-border"}`} />
                          )}
                          <span>{step.label}</span>
                          {isCompleted && <span className="ml-auto text-xs font-mono opacity-60">Done</span>}
                          {isNext && <span className="ml-auto text-xs font-mono opacity-75">Tap</span>}
                        </motion.button>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EtaCard({ icon, label, value, isAlert }: { icon: React.ReactNode; label: string; value: string; isAlert?: boolean }) {
  return (
    <div className={`glass rounded-2xl p-5 border text-center ${isAlert ? "border-warning/30 bg-warning/5" : "border-border/50"}`}>
      <div className="flex justify-center mb-2">{icon}</div>
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 font-bold text-lg ${isAlert ? "text-warning" : ""}`}>{value}</div>
    </div>
  );
}

function InfoCard({ label, value, isEmergency }: { label: string; value: string; isEmergency?: boolean }) {
  return (
    <div className="p-3 rounded-xl bg-surface/60 border border-border/40">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-0.5 font-semibold text-sm ${isEmergency ? "text-emergency" : ""}`}>{value}</div>
    </div>
  );
}

function MiniVital({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-xl bg-surface/60 border border-border/40 text-center">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
