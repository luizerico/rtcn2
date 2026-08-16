"use client";

import { useEffect } from 'react';
import { CircleMarker, GeoJSON, MapContainer, TileLayer, useMap } from 'react-leaflet';
import L, { type LatLngExpression } from 'leaflet';
import type { GeoJsonObject } from 'geojson';
import 'leaflet/dist/leaflet.css';

const BRAZIL_CENTER: LatLngExpression = [-14.235, -51.925];

function accentColor(): string {
  if (typeof window === 'undefined') return '#0f766e';
  return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#0f766e';
}

function FitGeoJson({ data }: { data: GeoJsonObject }) {
  const map = useMap();

  useEffect(() => {
    const layer = L.geoJSON(data);
    const bounds = layer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [20, 20], maxZoom: 12 });
    }
    const timer = window.setTimeout(() => map.invalidateSize(), 80);
    return () => window.clearTimeout(timer);
  }, [data, map]);

  return null;
}

export default function GeoBoundaryMap({
  data,
  marker,
}: {
  data: GeoJsonObject;
  marker?: { lat?: number; long?: number };
}) {
  const color = accentColor();
  const hasMarker =
    marker != null && Number.isFinite(marker.lat) && Number.isFinite(marker.long);

  return (
    <MapContainer
      center={BRAZIL_CENTER}
      zoom={4}
      scrollWheelZoom
      className="z-0 h-80 w-full"
      style={{ height: '20rem', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <GeoJSON
        data={data}
        style={{
          color,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.18,
        }}
      />
      <FitGeoJson data={data} />
      {hasMarker ? (
        <CircleMarker
          center={[marker.lat as number, marker.long as number]}
          radius={6}
          pathOptions={{ color, fillColor: color, fillOpacity: 1 }}
        />
      ) : null}
    </MapContainer>
  );
}
