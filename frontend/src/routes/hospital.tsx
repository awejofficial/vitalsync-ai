import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Map, { Marker } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { doc, updateDoc, onSnapshot, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { TopNav } from "@/components/TopNav";
import { StoreHydrator } from "@/components/StoreHydrator";
import { HOSPITALS } from "@/lib/hospitals";
import { useStore } from "@/lib/store";
import {
  BedDouble, Ambulance, Clock, AlertTriangle,
  Stethoscope, ShieldCheck, Users, Plus, Minus, Navigation
} from "lucide-react";

export const Route = createFileRoute("/hospital")({
  component: HospitalAdmin,
});

function HospitalAdmin() {
  const storeCases = useStore((s) => s.cases);
  const [cases, setCases] = useState<typeof storeCases>(storeCases);
  const [selectedHospitalId, setSelectedHospitalId] = useState(HOSPITALS[0]?.id ?? "");
  const [mounted, setMounted] = useState(false);

  // Bed counts per hospital (in-memory, ideally synced to Firestore)
  const [beds, setBeds] = useState<Record<string, { icu: number; emergency: number; general: number }>>(
    Object.fromEntries(HOSPITALS.map((h) => [h.id, { icu: h.icuBeds, emergency: h.emergencyBeds, general: 24 }]))
  );

  useEffect(() => {
    setMounted(true);
    try {
      const unsub = onSnapshot(collection(db, "emergencies"), (snapshot) => {
        const liveCases: any = {};
        snapshot.forEach((doc) => { liveCases[doc.id] = doc.data(); });
        if (Object.keys(liveCases).length > 0) setCases(liveCases);
      });
      return () => unsub();
    } catch {
      setCases(storeCases);
    }
  }, [storeCases]);

  const selectedHospital = HOSPITALS.find((h) => h.id === selectedHospitalId)!;
  const incomingCases = Object.values(cases).filter(
    (c) => c.hospital?.id === selectedHospitalId && c.status !== "PATIENT_ARRIVED"
  ).sort((a, b) => severityRank(b.triage?.severity) - severityRank(a.triage?.severity));

  const updateBeds = async (hospitalId: string, type: "icu" | "emergency" | "general", delta: number) => {
    setBeds((prev) => ({
      ...prev,
      [hospitalId]: { ...prev[hospitalId], [type]: Math.max(0, (prev[hospitalId][type] ?? 0) + delta) },
    }));
    try {
      await updateDoc(doc(db, "hospitals", hospitalId), { [`beds.${type}`]: (beds[hospitalId]?.[type] ?? 0) + delta, updatedAt: Date.now() });
    } catch { /* fallback local only */ }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <StoreHydrator />
      <TopNav />
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-medical animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
              <div className="font-mono text-xs uppercase tracking-[0.2em] text-medical font-semibold">Hospital Command</div>
            </div>
            <h1 className="mt-2 font-display text-4xl font-bold tracking-tight">Hospital Dashboard</h1>
          </div>
          <div className="font-mono text-xs text-muted-foreground glass px-4 py-2 rounded-full border border-border/50">
            {incomingCases.length} INCOMING · LIVE SYNC
          </div>
        </div>

        {/* Hospital Selector */}
        <div className="flex gap-3 mb-6 overflow-x-auto pb-1">
          {HOSPITALS.map((h) => {
            const count = Object.values(cases).filter((c) => c.hospital?.id === h.id && c.status !== "PATIENT_ARRIVED").length;
            return (
              <button
                key={h.id}
                onClick={() => setSelectedHospitalId(h.id)}
                className={`shrink-0 glass rounded-xl px-5 py-3 text-left transition-all border ${selectedHospitalId === h.id ? "border-medical/60 ring-1 ring-medical/30 bg-medical/5" : "border-border/40 hover:border-border"}`}
              >
                <div className="font-semibold text-sm">{h.name}</div>
                <div className="mt-0.5 font-mono text-xs text-muted-foreground">{count > 0 ? `${count} incoming` : "ready"}</div>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            {/* Emergency Queue */}
            <div className="glass rounded-3xl p-6 border border-border/50">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  <Ambulance className="w-4 h-4 text-warning" /> Emergency Queue
                </div>
                <div className={`px-3 py-1 rounded-full font-mono text-xs font-bold ${incomingCases.length > 0 ? "bg-emergency/10 text-emergency" : "bg-success/10 text-success"}`}>
                  {incomingCases.length > 0 ? `${incomingCases.length} ACTIVE` : "ALL CLEAR"}
                </div>
              </div>
              <div className="space-y-3">
                <AnimatePresence>
                  {incomingCases.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground font-mono text-sm">
                      <ShieldCheck className="w-8 h-8 mx-auto mb-3 opacity-30" />
                      No incoming emergencies
                    </div>
                  )}
                  {incomingCases.map((c) => {
                    const sev = c.triage?.severity ?? "MODERATE";
                    const isCritical = sev === "CRITICAL";
                    return (
                      <motion.div
                        key={c.id}
                        layout
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex items-center gap-4 p-4 rounded-2xl border bg-surface/50 ${isCritical ? "border-emergency/40 shadow-[0_0_12px_rgba(239,68,68,0.1)]" : "border-border/40"}`}
                      >
                        {isCritical && <div className="w-1 h-12 rounded-full bg-emergency shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`font-mono text-[10px] font-bold uppercase tracking-wider ${isCritical ? "text-emergency" : sev === "URGENT" ? "text-warning" : "text-medical"}`}>{sev}</span>
                            <span className="font-mono text-[10px] text-muted-foreground">#{c.id.slice(0, 6)}</span>
                          </div>
                          <div className="font-semibold truncate">{c.patient?.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{c.triage?.condition}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-mono text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> ETA</div>
                          <div className={`font-display text-2xl font-bold tabular-nums ${isCritical ? "text-emergency" : "text-foreground"}`}>{c.ambulance?.etaMin ?? "–"}</div>
                          <div className="text-[10px] text-muted-foreground">min</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-mono text-[10px] text-muted-foreground">Ambulance</div>
                          <div className="font-mono text-sm font-semibold">{c.ambulance?.callsign ?? "–"}</div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>

            {/* Live Arrival Tracking Map */}
            <div className="glass rounded-3xl overflow-hidden border border-border/50 relative">
              <div className="absolute top-4 left-4 z-10 glass px-3 py-1.5 rounded-full border border-border/50 font-mono text-xs flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-success animate-pulse" /> Live Arrival Tracking
              </div>
              {/* ETA overlay */}
              {incomingCases[0] && (
                <div className="absolute top-4 right-4 z-10 glass px-3 py-2 rounded-xl border border-border/50 text-right">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Next Arrival ETA</div>
                  <div className="font-display text-3xl font-bold text-emergency tabular-nums">{incomingCases[0].ambulance?.etaMin ?? "–"}<span className="text-base text-muted-foreground ml-1">min</span></div>
                </div>
              )}
              {mounted ? (
                <Map
                  initialViewState={{ longitude: -122.4194, latitude: 37.7749, zoom: 12 }}
                  style={{ height: 380, width: "100%" }}
                  mapStyle="mapbox://styles/mapbox/dark-v11"
                  mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN || "pk.eyJ1IjoiZHVtbXkiLCJhIjoiY2x1eW11b21rMGw3bTJqcW16M216In0.dummy"}
                >
                  {/* Hospital marker */}
                  <Marker longitude={-122.4194} latitude={37.7749}>
                    <div className="w-8 h-8 rounded-full bg-medical/20 border-2 border-medical flex items-center justify-center shadow-[0_0_10px_rgba(16,185,129,0.5)]">
                      <span className="text-xs font-bold text-medical">H</span>
                    </div>
                  </Marker>
                  {/* Ambulance markers (simulated) */}
                  {incomingCases.slice(0, 3).map((c, i) => (
                    <Marker key={c.id} longitude={-122.4194 + (i + 1) * 0.02} latitude={37.7749 - (i + 1) * 0.01}>
                      <div className="w-7 h-7 rounded-full bg-warning/20 border-2 border-warning flex items-center justify-center animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.4)]">
                        <Ambulance className="w-3 h-3 text-warning" />
                      </div>
                    </Marker>
                  ))}
                </Map>
              ) : (
                <div className="h-[380px] bg-surface flex items-center justify-center">
                  <Navigation className="w-8 h-8 text-muted-foreground animate-spin" />
                </div>
              )}
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Bed Availability Management */}
            <div className="glass rounded-3xl p-6 border border-border/50">
              <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground mb-5">
                <BedDouble className="w-4 h-4 text-medical" /> Bed Availability
              </div>
              <div className="text-lg font-semibold mb-4">{selectedHospital?.name}</div>
              <div className="space-y-4">
                <BedControl
                  label="ICU Beds"
                  count={beds[selectedHospitalId]?.icu ?? 0}
                  onInc={() => updateBeds(selectedHospitalId, "icu", 1)}
                  onDec={() => updateBeds(selectedHospitalId, "icu", -1)}
                  accent="emergency"
                />
                <BedControl
                  label="Emergency Beds"
                  count={beds[selectedHospitalId]?.emergency ?? 0}
                  onInc={() => updateBeds(selectedHospitalId, "emergency", 1)}
                  onDec={() => updateBeds(selectedHospitalId, "emergency", -1)}
                  accent="warning"
                />
                <BedControl
                  label="General Beds"
                  count={beds[selectedHospitalId]?.general ?? 0}
                  onInc={() => updateBeds(selectedHospitalId, "general", 1)}
                  onDec={() => updateBeds(selectedHospitalId, "general", -1)}
                  accent="medical"
                />
              </div>
            </div>

            {/* Staff Preparation Panel */}
            {incomingCases[0]?.triage && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass rounded-3xl p-6 border border-warning/20 bg-gradient-to-br from-warning/5 to-transparent"
              >
                <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-widest text-warning mb-5">
                  <Users className="w-4 h-4" /> Staff Preparation Panel
                </div>
                <div className="space-y-4">
                  <PrepRow label="Required Specialist" value={incomingCases[0].triage.specialist} icon={<Stethoscope className="w-4 h-4 text-medical" />} />
                  <PrepRow
                    label="Required Equipment"
                    value={incomingCases[0].triage.requiredEquipment?.slice(0, 3).join(", ") ?? "–"}
                    icon={<AlertTriangle className="w-4 h-4 text-warning" />}
                  />
                  <PrepRow
                    label="Criticality Level"
                    value={incomingCases[0].triage.severity}
                    icon={<ShieldCheck className="w-4 h-4 text-emergency" />}
                    isEmergency={incomingCases[0].triage.severity === "CRITICAL"}
                  />
                </div>
                <div className="mt-5 p-4 bg-surface/50 rounded-xl border border-border/50">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Preparation Steps</div>
                  <ul className="space-y-1.5">
                    {incomingCases[0].triage.preparationSteps?.slice(0, 4).map((step: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <div className="w-1.5 h-1.5 rounded-full bg-warning mt-1.5 shrink-0" />
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            )}

            {/* Specialists on duty */}
            {selectedHospital && (
              <div className="glass rounded-3xl p-6 border border-border/50">
                <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">
                  <Stethoscope className="w-4 h-4 text-primary" /> Specialists On Duty
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedHospital.specialists.map((s) => (
                    <span key={s} className="px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary font-mono text-xs">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function severityRank(s: string = "") {
  return ({ CRITICAL: 4, URGENT: 3, MODERATE: 2, LOW: 1 } as any)[s] ?? 0;
}

function BedControl({ label, count, onInc, onDec, accent }: { label: string; count: number; onInc: () => void; onDec: () => void; accent: "emergency" | "warning" | "medical" }) {
  const colors = { emergency: "text-emergency bg-emergency/10 border-emergency/30", warning: "text-warning bg-warning/10 border-warning/30", medical: "text-medical bg-medical/10 border-medical/30" };
  return (
    <div className="flex items-center justify-between p-4 rounded-xl bg-surface/50 border border-border/40">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`mt-1 font-display text-3xl font-bold tabular-nums ${accent === "emergency" ? "text-emergency" : accent === "warning" ? "text-warning" : "text-medical"}`}>{count}</div>
        <div className="text-xs text-muted-foreground">available</div>
      </div>
      <div className="flex flex-col gap-2">
        <button onClick={onInc} className={`w-9 h-9 rounded-lg border flex items-center justify-center transition hover:opacity-80 active:scale-95 ${colors[accent]}`}>
          <Plus className="w-4 h-4" />
        </button>
        <button onClick={onDec} className="w-9 h-9 rounded-lg border border-border bg-surface flex items-center justify-center transition hover:bg-surface-elevated active:scale-95">
          <Minus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function PrepRow({ label, value, icon, isEmergency }: { label: string; value: string; icon: React.ReactNode; isEmergency?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`font-semibold text-sm mt-0.5 ${isEmergency ? "text-emergency" : ""}`}>{value}</div>
      </div>
    </div>
  );
}
