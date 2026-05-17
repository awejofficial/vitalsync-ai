import { useEffect, useRef } from "react";
import L from "leaflet";
import type { EmergencyCase } from "@/lib/types";
import { HOSPITALS } from "@/lib/hospitals";

interface Props {
  caseData?: EmergencyCase;
  className?: string;
}

function ambulanceIcon() {
  return L.divIcon({
    className: "",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    html: `<div style="position:relative;width:36px;height:36px;">
      <div style="position:absolute;inset:0;border-radius:9999px;background:oklch(0.65 0.26 25 / 0.4);animation:pulse-ring 1.6s infinite;"></div>
      <div style="position:absolute;inset:6px;border-radius:9999px;background:oklch(0.65 0.26 25);display:grid;place-items:center;box-shadow:0 0 18px oklch(0.65 0.26 25 / 0.8);">
        <span style="color:white;font-weight:700;font-size:14px;font-family:'JetBrains Mono',monospace;">🚑</span>
      </div>
    </div>`,
  });
}

function hospitalIcon(highlight: boolean) {
  const color = highlight ? "oklch(0.78 0.16 200)" : "oklch(0.45 0.04 250)";
  const glow = highlight ? `box-shadow:0 0 18px ${color};` : "";
  return L.divIcon({
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `<div style="width:28px;height:28px;border-radius:6px;background:${color};display:grid;place-items:center;${glow}border:2px solid oklch(0.16 0.02 250);">
      <span style="color:oklch(0.12 0.02 250);font-weight:700;font-size:14px;">+</span>
    </div>`,
  });
}

function patientIcon() {
  return L.divIcon({
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    html: `<div style="width:24px;height:24px;border-radius:9999px;background:oklch(0.80 0.18 80);border:3px solid oklch(0.16 0.02 250);box-shadow:0 0 14px oklch(0.80 0.18 80 / 0.8);"></div>`,
  });
}

export function LiveMap({ caseData, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.Layer[]>([]);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = L.map(ref.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView([12.9550, 77.6100], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Clear old layers
    layersRef.current.forEach((l) => map.removeLayer(l));
    layersRef.current = [];

    // Hospitals
    HOSPITALS.forEach((h) => {
      const isMatch = caseData?.hospital?.id === h.id;
      const marker = L.marker([h.lat, h.lng], { icon: hospitalIcon(isMatch) })
        .addTo(map)
        .bindTooltip(`<b>${h.name}</b><br/>ICU: ${h.icuBeds} • ER: ${h.emergencyBeds}`, {
          direction: "top",
          className: "leaflet-tt-dark",
        });
      layersRef.current.push(marker);
    });

    if (!caseData) return;

    // Patient
    const pm = L.marker([caseData.location.lat, caseData.location.lng], { icon: patientIcon() })
      .addTo(map)
      .bindTooltip(`Patient: ${caseData.patient.name}`, { direction: "top" });
    layersRef.current.push(pm);

    // Route
    if (caseData.route) {
      const poly = L.polyline(caseData.route, {
        color: "oklch(0.65 0.26 25)",
        weight: 4,
        opacity: 0.85,
        dashArray: "8 6",
      }).addTo(map);
      layersRef.current.push(poly);
    }

    // Ambulance
    if (caseData.ambulance) {
      const am = L.marker([caseData.ambulance.lat, caseData.ambulance.lng], { icon: ambulanceIcon() })
        .addTo(map)
        .bindTooltip(`${caseData.ambulance.callsign} • ETA ${caseData.ambulance.etaMin} min`, {
          direction: "top",
          permanent: true,
          offset: [0, -16],
        });
      layersRef.current.push(am);
    }

    // Fit bounds to current emergency
    const all: L.LatLngExpression[] = [
      [caseData.location.lat, caseData.location.lng],
    ];
    if (caseData.ambulance) all.push([caseData.ambulance.lat, caseData.ambulance.lng]);
    if (caseData.hospital) all.push([caseData.hospital.lat, caseData.hospital.lng]);
    if (all.length > 1) {
      map.fitBounds(L.latLngBounds(all), { padding: [60, 60], maxZoom: 14 });
    }
  }, [caseData]);

  return <div ref={ref} className={className ?? "h-[420px] w-full rounded-xl overflow-hidden border border-border"} />;
}
