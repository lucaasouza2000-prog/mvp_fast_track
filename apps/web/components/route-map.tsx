"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "../lib/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  LocateFixed,
  Route as RouteIcon,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import type { Position, Route } from "@fasttrack/core";
import {
  routeCoordinates,
  orderedMapPositions,
  gpsHistorySegments,
  normalizeRoadRoute,
  type Coordinate,
} from "../lib/tracking-map";

type Controls = { update: () => void; driver: () => void; route: () => void };
const empty = () => ({ type: "FeatureCollection" as const, features: [] });
function line(coordinates: Coordinate[]) {
  return {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "LineString" as const, coordinates },
  };
}
function pointsFor(route: Route): Coordinate[] {
  try {
    return routeCoordinates(route);
  } catch {
    return [];
  }
}
export default function RouteMap({
  route,
  positions,
  simulation = false,
}: {
  route: Route;
  positions: Position[];
  simulation?: boolean;
}) {
  const sorted = useMemo(() => orderedMapPositions(positions), [positions]);
  const latest = sorted.at(-1);
  const container = useRef<HTMLDivElement>(null);
  const controls = useRef<Controls | null>(null);
  const data = useRef({ route, positions: sorted, simulation });
  const [error, setError] = useState("");
  const [road, setRoad] = useState("Consultando trajeto pelas ruas…");
  const [following, setFollowing] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    data.current = { route, positions: sorted, simulation };
    controls.current?.update();
  }, [route, sorted, simulation]);

  useEffect(() => {
    if (!container.current) return;
    let disposed = false;
    let ready = false;
    let follow = true;
    let first = true;
    let driverSeen = false;
    let historyKey = "";
    let driverKey = "";
    let markersKey = "";
    let roadKey = "";
    let request: AbortController | null = null;
    let plannedMarkers: maplibregl.Marker[] = [];
    let driverMarker: maplibregl.Marker | null = null;
    setError("");
    setRoad("Consultando trajeto pelas ruas…");
    setFollowing(true);
    const initial = data.current;
    const initialPoints = pointsFor(initial.route);
    const initialPosition = initial.positions.at(-1);
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
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
        center: initialPosition
          ? [initialPosition.longitude, initialPosition.latitude]
          : (initialPoints[0] ?? [-51.9, -14.2]),
        zoom: initialPosition ? 14 : 12,
        pitch: 0,
      });
    } catch {
      setError("Não foi possível abrir o mapa neste navegador.");
      return;
    }
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }));

    function fitRoute(duration = 400) {
      const points = pointsFor(data.current.route);
      if (!points.length) return;
      const bounds = new maplibregl.LngLatBounds();
      points.forEach((point) => bounds.extend(point));
      map.fitBounds(bounds, { padding: 45, maxZoom: 15, duration });
    }
    function focusDriver() {
      const last = data.current.positions.at(-1);
      if (!last) return;
      follow = true;
      setFollowing(true);
      map.easeTo({
        center: [last.longitude, last.latitude],
        zoom: 14,
        duration: 400,
      });
    }
    function updateRoad(points: Coordinate[]) {
      const key = JSON.stringify([data.current.simulation, points]);
      if (key === roadKey) return;
      roadKey = key;
      request?.abort();
      const source = map.getSource("planned") as maplibregl.GeoJSONSource;
      source.setData(empty());
      if (points.length < 2) {
        setRoad(
          "Confira os pontos dos endereços da rota para exibir o trajeto.",
        );
        return;
      }
      if (data.current.simulation) {
        source.setData(line(points));
        setRoad("Percurso ilustrativo e posições fictícias para apresentação.");
        return;
      }
      setRoad("Consultando trajeto pelas ruas…");
      const pending = new AbortController();
      request = pending;
      void fetch(
        "/api/trajeto?rota=" + encodeURIComponent(data.current.route.id),
        { signal: pending.signal },
      )
        .then(async (response) => {
          if (!response.ok) throw new Error("Route unavailable");
          const result = normalizeRoadRoute({
            code: "Ok",
            routes: [await response.json()],
          });
          if (!result) throw new Error("Invalid geometry");
          if (disposed || pending.signal.aborted) return;
          source.setData({
            type: "Feature",
            properties: {},
            geometry: result.geometry,
          });
          setRoad(
            "Trajeto planejado pelas ruas · " +
              (result.distance / 1000).toFixed(1) +
              " km.",
          );
        })
        .catch(() => {
          if (!disposed && !pending.signal.aborted)
            setRoad(
              "Trajeto pelas ruas indisponível no momento. Os pontos e a posição do motorista continuam visíveis.",
            );
        });
    }
    function draw() {
      if (!ready || disposed) return;
      const current = data.current;
      const points = pointsFor(current.route);
      const stops = [...current.route.stops].sort(
        (a, b) => a.sequence - b.sequence,
      );
      const nextMarkersKey = JSON.stringify([
        points,
        current.route.origin,
        stops.map((s) => s.address),
      ]);
      if (nextMarkersKey !== markersKey) {
        markersKey = nextMarkersKey;
        plannedMarkers.forEach((marker) => marker.remove());
        plannedMarkers = points.map((point, index) =>
          new maplibregl.Marker({ color: index === 0 ? "#2563eb" : "#64748b" })
            .setLngLat(point)
            .setPopup(
              new maplibregl.Popup().setText(
                index === 0 ? current.route.origin : stops[index - 1].address,
              ),
            )
            .addTo(map),
        );
      }
      const history = gpsHistorySegments(current.positions);
      const nextHistoryKey = JSON.stringify(history);
      if (nextHistoryKey !== historyKey) {
        historyKey = nextHistoryKey;
        (map.getSource("history") as maplibregl.GeoJSONSource).setData({
          type: "FeatureCollection",
          features: history.map(line),
        });
      }
      const last = current.positions.at(-1);
      if (last) {
        const key = JSON.stringify([
          last.id,
          last.longitude,
          last.latitude,
          last.captured_at,
        ]);
        if (key !== driverKey) {
          driverKey = key;
          if (!driverMarker) {
            driverMarker = new maplibregl.Marker({ color: "#0a9b78" })
              .setLngLat([last.longitude, last.latitude])
              .addTo(map);
            driverMarker
              .getElement()
              .setAttribute("aria-label", "Última posição do motorista");
          }
          driverMarker
            .setLngLat([last.longitude, last.latitude])
            .setPopup(
              new maplibregl.Popup().setText(
                current.route.profiles.name +
                  " · " +
                  (current.simulation
                    ? "Posição simulada: "
                    : "Última captura: ") +
                  new Date(last.captured_at).toLocaleString("pt-BR"),
              ),
            );
          if (follow)
            map.easeTo({
              center: [last.longitude, last.latitude],
              ...(driverSeen ? {} : { zoom: 14 }),
              duration: driverSeen ? 400 : 0,
            });
          driverSeen = true;
        }
      } else {
        driverMarker?.remove();
        driverMarker = null;
        driverKey = "";
        if (first) fitRoute(0);
      }
      updateRoad(points);
      first = false;
    }
    const currentControls: Controls = {
      update: draw,
      driver: focusDriver,
      route() {
        follow = false;
        setFollowing(false);
        fitRoute();
      },
    };
    controls.current = currentControls;
    map.on("dragstart", () => {
      follow = false;
      setFollowing(false);
    });
    map.on("error", (event) => {
      const sourceId = (event as { sourceId?: unknown }).sourceId;
      if (!disposed && (!sourceId || sourceId === "osm"))
        setError(
          "Algumas partes do mapa não carregaram. Tente recarregar o mapa.",
        );
    });
    // Style readiness does not depend on every raster tile loading successfully.
    map.once("style.load", () => {
      if (disposed) return;
      map.addSource("history", { type: "geojson", data: empty() });
      map.addLayer({
        id: "history",
        type: "line",
        source: "history",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#0a9b78",
          "line-width": 3,
          "line-opacity": 0.8,
        },
      });
      map.addSource("planned", { type: "geojson", data: empty() });
      map.addLayer({
        id: "planned",
        type: "line",
        source: "planned",
        paint: {
          "line-color": "#2563eb",
          "line-width": 4,
          "line-opacity": 0.75,
          "line-dasharray": [2, 2],
        },
      });
      ready = true;
      draw();
    });
    const resize = new ResizeObserver(() => {
      if (!disposed) map.resize();
    });
    resize.observe(container.current);
    return () => {
      disposed = true;
      request?.abort();
      resize.disconnect();
      if (controls.current === currentControls) controls.current = null;
      plannedMarkers.forEach((marker) => marker.remove());
      driverMarker?.remove();
      map.remove();
    };
  }, [route.id, revision, simulation]);

  const externalPoint: Coordinate | undefined = latest
    ? [latest.longitude, latest.latitude]
    : pointsFor(route)[0];
  return (
    <div className="map-wrap">
      <div className="map-tools">
        <button
          type="button"
          className="map-tool"
          aria-pressed={following && !!latest}
          disabled={!latest}
          onClick={() => controls.current?.driver()}
        >
          <LocateFixed size={15} /> Focar motorista
        </button>
        <button
          type="button"
          className="map-tool"
          aria-pressed={!following || !latest}
          disabled={!pointsFor(route).length}
          onClick={() => controls.current?.route()}
        >
          <RouteIcon size={15} /> Ver rota
        </button>
      </div>
      <div
        className="map"
        ref={container}
        aria-label={"Mapa da rota " + route.code}
      />
      <div className="map-caption">
        <span>
          <i className="dot blue" />{" "}
          {simulation ? "Percurso ilustrativo" : "Trajeto planejado"}
        </span>
        <span>
          <i className="dot green" />{" "}
          {simulation ? "Posição simulada" : "Motorista · histórico GPS"}
        </span>
      </div>
      {error && (
        <div className="map-error" role="status">
          <span>{error}</span>
          <button
            type="button"
            className="map-tool"
            onClick={() => setRevision((value) => value + 1)}
          >
            <RefreshCw size={14} /> Recarregar mapa
          </button>
        </div>
      )}
      <p className="map-note">{road}</p>
      {externalPoint && (
        <a
          className="map-external"
          href={
            "https://www.openstreetmap.org/?mlat=" +
            externalPoint[1] +
            "&mlon=" +
            externalPoint[0] +
            "#map=16/" +
            externalPoint[1] +
            "/" +
            externalPoint[0]
          }
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={13} /> Abrir local no OpenStreetMap
        </a>
      )}
    </div>
  );
}
