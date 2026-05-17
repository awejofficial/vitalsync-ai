import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Map from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { doc, updateDoc, onSnapshot, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { TopNav } from "@/components/TopNav";
import { StoreHydrator } from "@/components/StoreHydrator";
import { useStore } from "@/lib/store";
import { AlertCircle, Clock, CheckCircle2, ShieldAlert, Activity, HeartPulse, Hospital, Ambulance } from "lucide-react";

export const Route = createFileRoute("/doctor")({
  component: DoctorDashboard,
});

function DoctorDashboard() {
  const storeCases = useStore((s) => s.cases);
  const updateCaseStore = useStore((s) => s.updateCase);
  
  // Local state for Firebase real-time data sync (fallback to Zustand if Firebase isn't configured)
  const [cases, setCases] = useState<typeof storeCases>(storeCases);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    // Attempt Firebase sync if available, otherwise fallback to store
    try {
      const unsub = onSnapshot(collection(db, "emergencies"), (snapshot) => {
        const liveCases: any = {};
        snapshot.forEach((doc) => {
          liveCases[doc.id] = doc.data();
        });
        if (Object.keys(liveCases).length > 0) {
          setCases(liveCases);
        }
      });
      return () => unsub();
    } catch (e) {
      console.warn("Firebase not fully configured. Falling back to local store.");
      setCases(storeCases);
    }
  }, [storeCases]);

  const list = Object.values(cases)
    .filter((c) => c.hospital && c.triage)
    .sort((a, b) => (severityRank(b.triage!.severity) - severityRank(a.triage!.severity)) || b.createdAt - a.createdAt);

  useEffect(() => {
    if (!selectedId && list[0]) setSelectedId(list[0].id);
  }, [list, selectedId]);

  const selected = selectedId ? cases[selectedId] : null;

  // Realtime Actions
  const handleAction = async (actionType: string) => {
    if (!selected) return;
    
    // Update local store immediately for instant UI reaction
    updateCaseStore(selected.id, { doctorStatus: actionType });
    setCases(prev => ({ ...prev, [selected.id]: { ...prev[selected.id], doctorStatus: actionType } }));

    // Sync to Firestore
    try {
      const caseRef = doc(db, "emergencies", selected.id);
      await updateDoc(caseRef, { doctorStatus: actionType, updatedAt: Date.now() });
    } catch (e) {
      console.warn("Failed to sync to Firestore:", e);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30">
      <StoreHydrator />
      <TopNav />
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-6">
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emergency animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.8)]" />
              <div className="font-mono text-xs uppercase tracking-[0.2em] text-emergency font-semibold">Doctor Command Center</div>
            </div>
            <h1 className="mt-2 font-display text-4xl font-bold tracking-tight">Live Emergency Feed</h1>
          </div>
          <div className="font-mono text-xs text-muted-foreground glass px-4 py-2 rounded-full border border-border/50">
            {list.length} ACTIVE CASES · LIVE SYNC
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
          {/* Feed Column */}
          <div className="space-y-3 max-h-[800px] overflow-auto pr-2 scrollbar-thin">
            <AnimatePresence initial={false}>
              {list.length === 0 && (
                <div className="glass rounded-2xl p-8 text-center text-muted-foreground border border-border/50">
                  <ShieldAlert className="w-8 h-8 mx-auto mb-3 opacity-50" />
                  No incoming cases. All clear.
                </div>
              )}
              {list.map((c) => {
                const sev = c.triage!.severity;
                const isSel = c.id === selectedId;
                const isCritical = sev === "CRITICAL";
                return (
                  <motion.button
                    layout
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={`w-full text-left relative overflow-hidden glass rounded-2xl p-5 transition-all duration-300 border ${
                      isSel ? "border-primary/60 bg-primary/5 ring-1 ring-primary/30" : "border-border/40 hover:border-border"
                    } ${isCritical ? "animate-pulse-slow shadow-[0_0_15px_rgba(239,68,68,0.15)]" : ""}`}
                  >
                    {isCritical && <div className="absolute top-0 left-0 w-1 h-full bg-emergency" />}
                    <div className="flex items-center justify-between">
                      <span className={`flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-wider ${
                        isCritical ? "text-emergency" : sev === "URGENT" ? "text-warning" : "text-medical"
                      }`}>
                        {isCritical && <AlertCircle className="w-3.5 h-3.5" />}
                        {sev} · {c.ambulance?.etaMin ?? "–"} MIN ETA
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">ID: {c.id.slice(0, 6)}</span>
                    </div>
                    <div className="mt-2 text-lg font-semibold tracking-tight">{c.patient.name}</div>
                    <div className="mt-1 text-sm text-foreground/80 line-clamp-2">{c.triage!.condition}</div>
                    <div className="mt-3 flex items-center gap-3 text-xs font-mono text-muted-foreground">
                      <div className="flex items-center gap-1"><Ambulance className="w-3 h-3"/> En Route</div>
                      <div className="flex items-center gap-1"><HeartPulse className="w-3 h-3 text-warning"/> {c.vitals?.hr || "--"} BPM</div>
                    </div>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Details Column */}
          {selected ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 h-fit">
              {/* Left Details */}
              <div className="space-y-6">
                {/* AI Summary Panel */}
                <div className="glass rounded-3xl p-6 border border-primary/20 relative overflow-hidden bg-gradient-to-br from-surface to-background shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
                  <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 text-primary font-mono text-xs font-bold uppercase tracking-widest">
                      <Activity className="w-4 h-4" /> AI Emergency Summary
                    </div>
                    <div className="bg-emergency/10 text-emergency px-3 py-1 rounded-full font-mono text-xs font-bold animate-pulse">
                      ETA: {selected.ambulance?.etaMin ?? "–"} MIN
                    </div>
                  </div>
                  
                  <h2 className="text-4xl font-display font-bold tracking-tight mb-6">{selected.patient.name}</h2>
                  
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <SummaryItem label="Possible Condition" value={selected.triage!.condition} />
                    <SummaryItem label="Required Specialist" value={selected.triage!.specialist} />
                    <SummaryItem label="Severity Level" value={selected.triage!.severity} isEmergency={selected.triage!.severity === "CRITICAL"} />
                    <SummaryItem label="Time Window" value={`< ${selected.triage!.timeSensitivityMin} mins`} />
                  </div>
                  
                  <div className="p-4 bg-surface/50 rounded-xl border border-border/50">
                    <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Required Preparation</div>
                    <ul className="space-y-1.5">
                      {selected.triage!.preparationSteps.slice(0, 3).map((p, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <CheckCircle2 className="w-4 h-4 text-medical shrink-0 mt-0.5" />
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Quick Action Buttons */}
                <div className="grid grid-cols-2 gap-3">
                  <ActionButton label="Accept Case" onClick={() => handleAction("accepted")} active={selected.doctorStatus === "accepted"} type="primary" />
                  <ActionButton label="Prepare ICU" onClick={() => handleAction("icu_ready")} active={selected.doctorStatus === "icu_ready"} type="warning" />
                  <ActionButton label="Alert Staff" onClick={() => handleAction("staff_alerted")} active={selected.doctorStatus === "staff_alerted"} type="secondary" />
                  <ActionButton label="Ready For Arrival" onClick={() => handleAction("ready")} active={selected.doctorStatus === "ready"} type="success" />
                </div>
              </div>

              {/* Right Details */}
              <div className="space-y-6">
                {/* Live Tracking Map */}
                <div className="glass rounded-3xl overflow-hidden border border-border/50 h-[350px] relative">
                  <div className="absolute top-4 left-4 z-10 glass px-3 py-1.5 rounded-full border border-border/50 font-mono text-xs flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-success animate-pulse" /> Live Tracking
                  </div>
                  <Map
                    initialViewState={{
                      longitude: -122.4194,
                      latitude: 37.7749,
                      zoom: 12
                    }}
                    mapStyle="mapbox://styles/mapbox/dark-v11"
                    mapboxAccessToken={import.meta.env.VITE_MAPBOX_TOKEN || "pk.eyJ1IjoiZHVtbXkiLCJhIjoiY2x1eW11b21rMGw3bTJqcW16M216M216In0.dummy"}
                  />
                  {/* Note: Markers/Polylines omitted for brevity, would map over selected.route */}
                </div>

                {/* Emergency Timeline */}
                <div className="glass rounded-3xl p-6 border border-border/50">
                  <div className="font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground mb-6">Emergency Timeline</div>
                  <div className="space-y-5">
                    <TimelineStep label="Emergency Created" time="10:42 AM" active={true} />
                    <TimelineStep label="AI Classified Critical" time="10:43 AM" active={true} />
                    <TimelineStep label="Hospital Assigned" time="10:43 AM" active={!!selected.hospital} />
                    <TimelineStep label="Ambulance En Route" time="10:45 AM" active={!!selected.ambulance} />
                    <TimelineStep label="Doctor Alerted" time="Now" active={true} isLast />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="glass rounded-3xl flex items-center justify-center h-[600px] border border-border/30 text-muted-foreground font-mono text-sm">
              <div className="text-center">
                <Activity className="w-12 h-12 mx-auto mb-4 opacity-20" />
                Awaiting incoming emergency streams...
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function severityRank(s: string) {
  return ({ CRITICAL: 4, URGENT: 3, MODERATE: 2, LOW: 1 } as const)[s as "CRITICAL"] ?? 0;
}

function SummaryItem({ label, value, isEmergency }: { label: string; value: string; isEmergency?: boolean }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className={`font-semibold ${isEmergency ? "text-emergency" : ""}`}>{value}</div>
    </div>
  );
}

function ActionButton({ label, onClick, active, type }: { label: string; onClick: () => void; active: boolean; type: "primary" | "warning" | "secondary" | "success" }) {
  const styles = {
    primary: active ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary hover:bg-primary/20",
    warning: active ? "bg-warning text-warning-foreground" : "bg-warning/10 text-warning hover:bg-warning/20",
    success: active ? "bg-success text-success-foreground" : "bg-success/10 text-success hover:bg-success/20",
    secondary: active ? "bg-surface-elevated text-foreground border-border" : "bg-surface text-muted-foreground border-transparent hover:bg-surface-elevated",
  };
  return (
    <button
      onClick={onClick}
      className={`px-4 py-4 rounded-xl font-semibold transition-all duration-200 border border-transparent active:scale-95 ${styles[type]}`}
    >
      {active ? <span className="flex items-center justify-center gap-2"><CheckCircle2 className="w-4 h-4"/> {label}</span> : label}
    </button>
  );
}

function TimelineStep({ label, time, active, isLast }: { label: string; time: string; active: boolean; isLast?: boolean }) {
  return (
    <div className="flex gap-4 relative">
      {!isLast && <div className={`absolute left-[9px] top-6 bottom-[-20px] w-0.5 ${active ? "bg-primary/50" : "bg-surface"}`} />}
      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 z-10 ${active ? "bg-primary text-background shadow-[0_0_10px_rgba(59,130,246,0.5)]" : "bg-surface border border-border"}`}>
        {active && <div className="w-1.5 h-1.5 bg-background rounded-full" />}
      </div>
      <div className="flex-1 pb-2">
        <div className={`text-sm font-semibold ${active ? "text-foreground" : "text-muted-foreground"}`}>{label}</div>
        <div className="text-xs text-muted-foreground font-mono mt-0.5 flex items-center gap-1">
          <Clock className="w-3 h-3" /> {time}
        </div>
      </div>
    </div>
  );
}

