import React, { useEffect, useRef } from "react";
import L from "leaflet";
import { Issue } from "../types";

interface OpenStreetMapProps {
  issues: Issue[];
  center: { lat: number; lng: number };
  onMarkerClick: (issue: Issue) => void;
}

export default function OpenStreetMap({ issues, center, onMarkerClick }: OpenStreetMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  // Helper to determine severity-based colors
  const getMarkerIcon = (severity: string, category: string) => {
    const colors = {
      Low: "#22c55e",       // Green
      Medium: "#f59e0b",    // Yellow
      High: "#f97316",      // Orange
      Critical: "#ef4444",  // Red
    };
    const color = colors[severity as keyof typeof colors] || "#3b82f6";
    const letter = category ? category.slice(0, 1).toUpperCase() : "⚠️";

    // Create a beautifully styled HTML marker with standard Tailwind colors and pulsing animation
    const html = `
      <div class="relative flex items-center justify-center" style="width: 28px; height: 28px;">
        ${
          severity === "Critical"
            ? `<div class="absolute w-8 h-8 rounded-full animate-ping opacity-35" style="background-color: ${color};"></div>`
            : ""
        }
        <div class="w-7 h-7 rounded-full border-2 border-white flex items-center justify-center shadow-lg text-white font-extrabold text-[11px] transition-transform duration-200" style="background-color: ${color}; transform: scale(1); pointer-events: auto;">
          ${letter}
        </div>
      </div>
    `;

    return L.divIcon({
      className: "custom-leaflet-marker",
      html: html,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  };

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Create Leaflet Map centered at user's current location (coords)
    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView([center.lat, center.lng], 13);

    // Use OpenStreetMap tile layer
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);

    // Create a layer group to hold incident markers
    const markersLayer = L.layerGroup().addTo(map);

    mapRef.current = map;
    markersLayerRef.current = markersLayer;

    // Cleanup on unmount
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Sync center / panning
  useEffect(() => {
    if (mapRef.current && center) {
      mapRef.current.setView([center.lat, center.lng], mapRef.current.getZoom());
    }
  }, [center]);

  // Sync issues and user location markers
  useEffect(() => {
    if (!mapRef.current || !markersLayerRef.current) return;

    // Clear previous markers
    markersLayerRef.current.clearLayers();

    // 1. Add User's Current Location Marker (Geolocator target)
    if (center) {
      const userIcon = L.divIcon({
        className: "user-location-marker",
        html: `
          <div class="relative flex items-center justify-center" style="width: 24px; height: 24px;">
            <div class="absolute w-6 h-6 rounded-full bg-blue-500 animate-pulse opacity-40"></div>
            <div class="w-4 h-4 rounded-full border-2 border-white bg-blue-600 shadow-md"></div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      L.marker([center.lat, center.lng], { icon: userIcon })
        .addTo(markersLayerRef.current)
        .bindTooltip("<div class='text-xs font-bold text-slate-800 px-1'>Your Location (Geolocator GPS)</div>", {
          permanent: false,
          direction: "top",
        });
    }

    // 2. Add Issue markers
    const coordCounts: { [key: string]: number } = {};

    issues.forEach((issue) => {
      if (typeof issue.latitude !== "number" || typeof issue.longitude !== "number") return;

      const coordKey = `${issue.latitude.toFixed(6)},${issue.longitude.toFixed(6)}`;
      const occurrence = coordCounts[coordKey] || 0;
      coordCounts[coordKey] = occurrence + 1;

      let finalLat = issue.latitude;
      let finalLng = issue.longitude;

      if (occurrence > 0) {
        // Apply slight offset in a circle around the original coordinates so overlapping issues are all fully visible
        const angle = (occurrence * 2 * Math.PI) / 8;
        const radius = 0.00018 * (1 + Math.floor(occurrence / 8) * 0.5);
        finalLat += radius * Math.sin(angle);
        finalLng += radius * Math.cos(angle);
      }

      const marker = L.marker([finalLat, finalLng], {
        icon: getMarkerIcon(issue.severity, issue.category),
      });

      // Bind click handler
      marker.on("click", () => {
        onMarkerClick(issue);
      });

      // Add simple tooltip showing categories and status
      marker.bindTooltip(
        `<div class="text-xs font-sans p-1">
          <p class="font-extrabold text-slate-800">${issue.category}</p>
          <p class="text-[10px] text-slate-500 mt-0.5">Status: <span class="font-bold text-emerald-600">${issue.status}</span></p>
         </div>`,
        { direction: "top", offset: [0, -10] }
      );

      marker.addTo(markersLayerRef.current!);
    });
  }, [issues, center]);

  return <div ref={mapContainerRef} className="w-full h-full z-0" />;
}
