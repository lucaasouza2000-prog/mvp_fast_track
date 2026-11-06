"use client";
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Position, Route } from "@fasttrack/core";
export default function RouteMap({
  route,
  positions,
}: {
  route: Route;
  positions: Position[];
}) {
  const container = useRef<HTMLDivElement>(null),
    [error, setError] = useState(""),
    [road, setRoad] = useState("Consultando trajeto pelas vias…");
  useEffect(() => {
    if (!container.current) return;
    let disposed = false;
    const stops = [...route.stops].sort((a, b) => a.sequence - b.sequence);
    const points: [number, number][] = [
      [route.origin_lng, route.origin_lat],
      ...stops.map((s) => [s.longitude, s.latitude] as [number, number]),
    ];
    const map = new maplibregl.Map({
      container: container.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }],
      },
      center: points[0],
      zoom: 10,
      pitch: 25,
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }));
    points.forEach((p, i) =>
      new maplibregl.Marker({ color: i === 0 ? "#2563eb" : "#64748b" })
        .setLngLat(p)
        .setPopup(
          new maplibregl.Popup().setText(
            i === 0 ? route.origin : stops[i - 1].address,
          ),
        )
        .addTo(map),
    );
    const latest = positions.at(-1);
    if (latest)
      new maplibregl.Marker({ color: "#0a9b78" })
        .setLngLat([latest.longitude, latest.latitude])
        .setPopup(
          new maplibregl.Popup().setText(
            `Última posição: ${new Date(latest.captured_at).toLocaleString("pt-BR")}`,
          ),
        )
        .addTo(map);
    const bounds = new maplibregl.LngLatBounds();
    points.forEach((p) => bounds.extend(p));
    positions.forEach((p) => bounds.extend([p.longitude, p.latitude]));
    map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 0 });
    const abort = new AbortController();
    map.on("error", () => {
      if (!disposed)
        setError(
          "Não foi possível carregar uma camada do mapa. Verifique a conexão.",
        );
    });
    map.on("load", () => {
      if (positions.length > 1) {
        map.addSource("history", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: positions.map((p) => [p.longitude, p.latitude]),
            },
          },
        });
        map.addLayer({
          id: "history",
          type: "line",
          source: "history",
          paint: { "line-color": "#0a9b78", "line-width": 4 },
        });
      }
      const base =
        process.env.NEXT_PUBLIC_ROUTING_URL ??
        "https://router.project-osrm.org";
      void fetch(
        `${base}/route/v1/driving/${points.map((p) => p.join(",")).join(";")}?overview=full&geometries=geojson`,
        { signal: abort.signal },
      )
        .then((r) => {
          if (!r.ok) throw new Error();
          return r.json();
        })
        .then((data) => {
          const result = data.routes?.[0];
          if (disposed) return;
          if (data.code !== "Ok" || !result) throw new Error();
          map.addSource("planned", {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: result.geometry,
            },
          });
          map.addLayer({
            id: "planned",
            type: "line",
            source: "planned",
            paint: {
              "line-color": "#2563eb",
              "line-width": 4,
              "line-opacity": 0.6,
              "line-dasharray": [2, 2],
            },
          });
          setRoad(
            `Trajeto planejado · ${(result.distance / 1000).toFixed(1)} km. Sem ETA em tempo real.`,
          );
        })
        .catch(() => {
          if (!disposed)
            setRoad(
              "Roteamento indisponível. Apenas pontos cadastrados e histórico GPS.",
            );
        });
    });
    return () => {
      disposed = true;
      abort.abort();
      map.remove();
    };
  }, [route, positions]);
  return (
    <div className="map-wrap">
      <div className="map" ref={container} />
      <div className="map-caption">
        <span>
          <i className="dot blue" /> Planejado
        </span>
        <span>
          <i className="dot green" /> Histórico GPS
        </span>
      </div>
      <p className="map-note">
        {error || road} Inclinação disponível; edifícios 3D dependem de uma
        fonte vetorial configurada.
      </p>
    </div>
  );
}
