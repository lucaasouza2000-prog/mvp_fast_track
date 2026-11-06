"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Clock, MapPin, Phone, Truck } from "lucide-react";
import {
  labels,
  positionFresh,
  readArrivalEstimate,
  arrivalTime,
  type ArrivalEstimate,
  type Route,
  type Delivery,
  type Position,
} from "@fasttrack/core";
import { Modal } from "./ui";
import { supabase } from "../lib/supabase";
import { useDemo } from "../lib/demo";
const Map = dynamic(() => import("./route-map"), {
  ssr: false,
  loading: () => <div className="map-skeleton">Carregando mapa…</div>,
});
export function DeliveryDetail({
  route,
  delivery,
  onClose,
}: {
  route: Route;
  delivery: Delivery;
  onClose: () => void;
}) {
  const demo = useDemo();
  const [positions, setPositions] = useState<Position[]>([]),
    [error, setError] = useState(""),
    [events, setEvents] = useState<
      { id: string; kind: string; captured_at: string }[]
    >([]),
    [now, setNow] = useState(Date.now());
  const [estimate, setEstimate] = useState<ArrivalEstimate | undefined>();
  useEffect(() => {
    if (demo) {
      setEstimate({ status: "unavailable" });
      return;
    }
    if (delivery.status === "concluida") {
      setEstimate({ status: "completed" });
      return;
    }
    let active = true;
    const controller = new AbortController();
    async function loadEstimate() {
      try {
        const response = await fetch(
          "/api/trajeto?rota=" +
            encodeURIComponent(route.id) +
            "&entrega=" +
            encodeURIComponent(delivery.id),
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Forecast unavailable");
        const body = await response.json();
        if (active) setEstimate(readArrivalEstimate(body.eta));
      } catch {
        if (active) setEstimate({ status: "unavailable" });
      }
    }
    setEstimate(undefined);
    void loadEstimate();
    const timer = setInterval(() => void loadEstimate(), 20000);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
    };
  }, [route.id, delivery.id, delivery.status, demo]);
  useEffect(() => {
    if (demo) {
      setPositions(demo.state.positions[route.id] ?? []);
      setEvents(demo.state.events.filter((e) => e.delivery_id === delivery.id));
      setError("");
      setNow(Date.now());
      return;
    }
    let active = true;
    const db = supabase();
    async function load() {
      const [p, e] = await Promise.all([
        db
          .from("positions")
          .select("*")
          .eq("route_id", route.id)
          .order("captured_at", { ascending: false })
          .limit(1000),
        db
          .from("operational_events")
          .select("id,kind,captured_at")
          .eq("delivery_id", delivery.id)
          .order("captured_at"),
      ]);
      if (!active) return;
      setNow(Date.now());
      if (p.error || e.error) {
        setError("Não foi possível atualizar o histórico.");
        return;
      }
      setPositions((p.data ?? []).reverse() as Position[]);
      setEvents(e.data ?? []);
      setError("");
    }
    void load();
    const channel = db
      .channel(`route-${route.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "positions",
          filter: `route_id=eq.${route.id}`,
        },
        () => void load(),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "operational_events",
          filter: `route_id=eq.${route.id}`,
        },
        () => void load(),
      )
      .subscribe();
    const timer = setInterval(() => void load(), 20000);
    return () => {
      active = false;
      clearInterval(timer);
      void db.removeChannel(channel);
    };
  }, [route.id, delivery.id, demo]);
  const last = positions.at(-1),
    fresh = positionFresh(last, now),
    stop = route.stops.find((s) => s.id === delivery.stop_id);
  return (
    <Modal
      title={delivery.clients.name}
      subtitle={`${route.code} · ${delivery.cargo_code}`}
      onClose={onClose}
      wide
    >
      <div className="detail-grid">
        <Map route={route} positions={positions} simulation={!!demo} />
        <aside className="detail-info">
          <span className={`badge ${delivery.status}`}>
            {labels[delivery.status]}
          </span>
          <h3>Detalhes da entrega</h3>
          <dl>
            <dt>
              <Truck size={15} /> Motorista
            </dt>
            <dd>{route.profiles.name}</dd>
            <dt>
              <Phone size={15} /> Contato · veículo
            </dt>
            <dd>
              {route.profiles.phone ?? "Sem telefone"} · {route.vehicles.plate}
            </dd>
            <dt>
              <MapPin size={15} /> Destino
            </dt>
            <dd>{stop?.address}</dd>
            <dt>Documento fiscal</dt>
            <dd className="fiscal-code">
              {delivery.fiscal_documents.map((d) => d.code).join(", ")}
            </dd>
            <dt>Carga</dt>
            <dd>
              {delivery.description} · {delivery.weight_kg} kg
              {delivery.volume_m3 ? ` · ${delivery.volume_m3} m³` : ""}
            </dd>
            <dt>
              <Clock size={15} /> Última localização
            </dt>
            <dd>
              {last ? (
                <>
                  {new Date(last.captured_at).toLocaleString("pt-BR")}
                  <small>
                    {demo
                      ? "Posição fictícia de demonstração"
                      : fresh
                        ? "Registro recente"
                        : "Localização desatualizada"}{" "}
                    · precisão{" "}
                    {last.accuracy == null
                      ? "não informada"
                      : `${Math.round(last.accuracy)} m`}
                    <br />
                    {last.latitude.toFixed(5)}, {last.longitude.toFixed(5)}
                  </small>
                </>
              ) : (
                "Nenhuma posição recebida"
              )}
            </dd>
            <dt>Saída prevista</dt>
            <dd>
              {route.scheduled_at
                ? new Date(route.scheduled_at).toLocaleString("pt-BR")
                : "Não informada"}
            </dd>
            <dt>
              <Clock size={15} /> Previsão de chegada
            </dt>
            <dd className="arrival-estimate">
              {demo ? (
                "Exemplo sem previsão real"
              ) : arrivalTime(estimate, now) ? (
                <>
                  <strong>Por volta de {arrivalTime(estimate, now)}</strong>
                  <small>
                    Estimativa sem trânsito em tempo real ou tempo de parada.
                  </small>
                </>
              ) : estimate?.status === "completed" ? (
                "Entrega concluída"
              ) : estimate?.status === "stale" ||
                estimate?.status === "ready" ? (
                "Aguardando localização recente"
              ) : estimate?.status === "waiting" ? (
                "Aguardando início da rota e localização"
              ) : estimate ? (
                "Previsão indisponível no momento"
              ) : (
                "Calculando previsão…"
              )}
            </dd>
          </dl>
          <p className="muted">
            {demo
              ? "Todas as posições e horários deste exemplo são fictícios. Não há rastreamento real nem ETA."
              : "Localização conforme os pontos recebidos. A previsão é aproximada e depende de uma captura recente."}
          </p>
        </aside>
      </div>
      <section className="timeline">
        <h3>Histórico operacional</h3>
        {error && <p className="error">{error}</p>}
        {events.length ? (
          events.map((e) => (
            <div key={e.id}>
              <i className="dot green" />
              <strong>
                {e.kind === "check_in"
                  ? "Carga confirmada"
                  : "Entrega concluída"}
              </strong>
              <span>{new Date(e.captured_at).toLocaleString("pt-BR")}</span>
            </div>
          ))
        ) : (
          <p className="muted">Nenhum check-in ou check-out registrado.</p>
        )}
      </section>
    </Modal>
  );
}
