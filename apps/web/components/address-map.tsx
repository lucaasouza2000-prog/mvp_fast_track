"use client";
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
type Point = { latitude: number; longitude: number };
export default function AddressMap({
  initial,
  onPoint,
}: {
  initial: Point | null;
  onPoint: (point: Point) => void;
}) {
  const container = useRef<HTMLDivElement>(null),
    callback = useRef(onPoint),
    [error, setError] = useState("");
  callback.current = onPoint;
  useEffect(() => {
    if (!container.current) return;
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
        center: initial
          ? [initial.longitude, initial.latitude]
          : [-51.9, -14.2],
        zoom: initial ? 15 : 3,
      });
    } catch {
      setError(
        "Este navegador não conseguiu abrir o mapa. Confira o ponto pelo link abaixo; se não houver ponto, tente outro navegador.",
      );
      return;
    }
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }));
    let marker: maplibregl.Marker | null = null;
    function place(point: Point, notify: boolean) {
      if (!marker) {
        marker = new maplibregl.Marker({ draggable: true, color: "#2563eb" })
          .setLngLat([point.longitude, point.latitude])
          .addTo(map);
        marker.on("dragend", () => {
          const p = marker!.getLngLat();
          callback.current({ latitude: p.lat, longitude: p.lng });
        });
      } else marker.setLngLat([point.longitude, point.latitude]);
      if (notify) callback.current(point);
    }
    if (initial) place(initial, false);
    map.on("click", (event) =>
      place({ latitude: event.lngLat.lat, longitude: event.lngLat.lng }, true),
    );
    map.on("error", () =>
      setError(
        "Uma camada do mapa não carregou. Tente novamente ou confira o ponto pelo link do OpenStreetMap.",
      ),
    );
    return () => map.remove();
  }, [initial?.latitude, initial?.longitude]);
  return (
    <>
      <div
        ref={container}
        className="address-map"
        aria-label="Mapa para conferir o endereço"
      />
      {error && <p className="muted">{error}</p>}
    </>
  );
}
