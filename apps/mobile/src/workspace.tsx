import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text as NativeText,
  View,
  type TextProps,
} from "react-native";
import {
  arrivalTime,
  labels,
  type ArrivalEstimate,
  type Delivery,
  type Profile,
  type Route,
} from "@fasttrack/core";
function Text({ style, ...props }: TextProps) {
  return (
    <NativeText
      {...props}
      style={[{ fontFamily: "Inter_400Regular", color: "#142033" }, style]}
    />
  );
}
const clock = (value?: string | null) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Sao_Paulo",
      })
    : "—";
function duration(r: Route) {
  if (!r.started_at) return "—";
  const end = r.completed_at
    ? Date.parse(r.completed_at)
    : r.status === "concluida"
      ? Math.max(
          ...r.deliveries.map((d) =>
            Date.parse(d.checked_out_at ?? r.started_at!),
          ),
        )
      : Date.now();
  const m = Math.max(0, Math.floor((end - Date.parse(r.started_at)) / 60000));
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
function NavIcon({ name, color }: { name: string; color: string }) {
  if (name === "rotas")
    return (
      <Text style={{ fontSize: 27, color, transform: [{ rotate: "-35deg" }] }}>
        ➤
      </Text>
    );
  if (name === "resumo")
    return (
      <View
        style={{
          width: 25,
          height: 25,
          justifyContent: "space-around",
          paddingVertical: 3,
        }}
      >
        {[0, 1, 2].map((n) => (
          <View
            key={n}
            style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
          >
            <View
              style={{
                width: 3,
                height: 3,
                borderRadius: 2,
                backgroundColor: color,
              }}
            />
            <View style={{ width: 17, height: 2, backgroundColor: color }} />
          </View>
        ))}
      </View>
    );
  return (
    <View style={{ width: 26, height: 27 }}>
      {name === "conta" ? (
        <>
          <View
            style={{
              position: "absolute",
              left: 9,
              top: 0,
              width: 9,
              height: 9,
              borderWidth: 2,
              borderColor: color,
              borderRadius: 8,
            }}
          />
          <View
            style={{
              position: "absolute",
              left: 3,
              bottom: 0,
              width: 22,
              height: 13,
              borderWidth: 2,
              borderBottomWidth: 0,
              borderColor: color,
              borderTopLeftRadius: 14,
              borderTopRightRadius: 14,
            }}
          />
        </>
      ) : (
        <>
          <View
            style={{
              position: "absolute",
              left: 5,
              top: 1,
              width: 17,
              height: 20,
              borderWidth: 2,
              borderColor: color,
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              borderBottomLeftRadius: 3,
              borderBottomRightRadius: 3,
            }}
          />
          <View
            style={{
              position: "absolute",
              left: 11,
              bottom: 1,
              width: 5,
              height: 3,
              borderRadius: 2,
              backgroundColor: color,
            }}
          />
        </>
      )}
    </View>
  );
}
interface Props {
  profile: Profile | null;
  routes: Route[];
  online: boolean;
  busy: boolean;
  pending: number;
  health: string;
  error: string;
  notice: string;
  estimates: Record<string, ArrivalEstimate>;
  onOperation: (r: Route, d: Delivery) => void;
  onDirections: (r: Route, d: Delivery) => void;
  onTrack: (r: Route) => void;
  onSync: () => void;
  onPause: () => void;
  onLogout: () => void;
}
function Button({
  title,
  onPress,
  disabled = false,
  secondary = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        s.button,
        secondary && s.secondary,
        disabled && { opacity: 0.45 },
      ]}
    >
      <Text style={[s.buttonText, secondary && { color: "#102b48" }]}>
        {title}
      </Text>
    </Pressable>
  );
}
function Badge({ status }: { status: string }) {
  return (
    <View
      style={[
        s.badge,
        (status === "ativa" || status === "em_transporte") && s.amber,
        status === "concluida" && s.green,
      ]}
    >
      <Text style={s.badgeText}>{labels[status] ?? status}</Text>
    </View>
  );
}
export default function DriverWorkspace(p: Props) {
  const [tab, setTab] = useState("rotas"),
    [selected, setSelected] = useState<string | null>(null);
  const route = p.routes.find((r) => r.id === selected);
  const ordered = (r: Route) =>
    [...r.deliveries].sort(
      (a, b) =>
        (r.stops.find((x) => x.id === a.stop_id)?.sequence ?? 0) -
        (r.stops.find((x) => x.id === b.stop_id)?.sequence ?? 0),
    );
  const deliveries = p.routes.flatMap((r) => r.deliveries);
  return (
    <View style={s.root}>
      <View style={s.header}>
        {tab === "rotas" && route ? (
          <>
            <Pressable
              accessibilityRole="button"
              onPress={() => setSelected(null)}
              style={s.back}
            >
              <Text style={s.backText}>‹ Suas rotas</Text>
            </Pressable>
            <Text style={s.heading}>{route.code}</Text>
          </>
        ) : (
          <>
            <Text style={s.brand}>FAST TRACK</Text>
            {tab === "rotas" && (
              <Text style={s.greeting}>
                Olá, {p.profile?.name.split(" ")[0] ?? "Motorista"}
              </Text>
            )}
            <Text style={s.heading}>
              {tab === "rotas"
                ? "Suas rotas"
                : tab === "resumo"
                  ? "Resumo"
                  : tab === "alertas"
                    ? "Alertas"
                    : "Minha conta"}
            </Text>
          </>
        )}
      </View>
      <ScrollView contentContainerStyle={s.content}>
        {tab === "rotas" && route ? (
          ordered(route).map((d, i) => (
            <View
              key={d.id}
              style={[
                s.delivery,
                d.status === "em_transporte" && s.deliveryActive,
              ]}
            >
              <Text style={s.deliveryTitle}>Entrega {i + 1}</Text>
              <Text style={s.address}>
                {route.stops.find((x) => x.id === d.stop_id)?.address}
              </Text>
              <View style={s.tiles}>
                <View style={s.tile}>
                  <Text style={s.label}>Nota</Text>
                  <Text style={s.value}>
                    {d.fiscal_documents.map((f) => f.code).join(", ") || "—"}
                  </Text>
                </View>
                <View style={s.tile}>
                  <Text style={s.label}>Peso</Text>
                  <Text style={s.value}>{d.weight_kg} kg</Text>
                </View>
              </View>
              {d.status === "concluida" ? (
                <View style={s.completed}>
                  <Text style={s.completedText}>✓ Entrega concluída</Text>
                </View>
              ) : (
                <View style={s.operation}>
                  {d.status === "em_transporte" && (
                    <Button
                      title="Ver rota da entrega"
                      secondary
                      onPress={() => p.onDirections(route, d)}
                    />
                  )}
                  <Button
                    title={d.status === "pendente" ? "Check-in" : "Check-out"}
                    disabled={p.busy}
                    onPress={() => p.onOperation(route, d)}
                  />
                </View>
              )}
              {p.error ? <Text style={s.error}>{p.error}</Text> : null}
            </View>
          ))
        ) : tab === "rotas" ? (
          <>
            <View style={s.chip}>
              <Text style={s.chipText}>Minhas rotas</Text>
            </View>
            {p.routes.map((r) => {
              const stops = ordered(r),
                collecting = !stops.some((d) => d.status === "em_transporte")
                  ? stops.find((d) => d.status === "pendente")
                  : undefined,
                last = [...stops]
                  .reverse()
                  .find((d) => d.status === "em_transporte");
              return (
                <View key={r.id} style={s.card}>
                  <View style={s.row}>
                    <Text style={s.routeTitle}>{r.code}</Text>
                    <Badge status={r.status} />
                  </View>
                  <Text style={s.plate}>{r.vehicles.plate}</Text>
                  <View style={s.metrics}>
                    {[
                      ["Duração", duration(r)],
                      ["Saída", clock(r.started_at ?? r.scheduled_at)],
                      [
                        "Chegada",
                        r.status === "concluida"
                          ? clock(r.completed_at)
                          : p.online
                            ? (arrivalTime(
                                last ? p.estimates[last.id] : undefined,
                              ) ?? "—")
                            : "—",
                      ],
                    ].map(([label, value]) => (
                      <View key={label}>
                        <Text style={s.label}>{label}</Text>
                        <Text style={s.metric}>{value}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={s.tiles}>
                    <View style={s.tile}>
                      <Text style={s.number}>
                        {
                          r.deliveries.filter((d) => d.status === "concluida")
                            .length
                        }
                        /{r.deliveries.length}
                      </Text>
                      <Text style={s.label}>entregas</Text>
                    </View>
                    <View style={s.tile}>
                      <Text style={s.number}>
                        {r.deliveries.reduce((sum, d) => sum + d.weight_kg, 0)}{" "}
                        kg
                      </Text>
                      <Text style={s.label}>peso da rota</Text>
                    </View>
                  </View>
                  <Text style={s.address}>⌖ {r.destination}</Text>
                  <Button
                    title={
                      r.status === "concluida"
                        ? "Ver entregas  →"
                        : collecting
                          ? "Confirmar  →"
                          : "Ver rota  →"
                    }
                    disabled={p.busy}
                    onPress={() => {
                      setSelected(r.id);
                      if (collecting) p.onOperation(r, collecting);
                    }}
                  />
                </View>
              );
            })}
            {!p.routes.length && (
              <View style={s.card}>
                <Text>Nenhuma rota sincronizada.</Text>
                <Button title="Carregar rotas" onPress={p.onSync} />
              </View>
            )}
          </>
        ) : tab === "resumo" ? (
          <View style={s.card}>
            <Text style={s.deliveryTitle}>Sua operação</Text>
            {[
              ["Rotas", p.routes.length],
              ["Entregas", deliveries.length],
              [
                "Concluídas",
                deliveries.filter((d) => d.status === "concluida").length,
              ],
            ].map(([label, value]) => (
              <View style={s.row} key={label}>
                <Text>{label}</Text>
                <Text style={s.value}>{value}</Text>
              </View>
            ))}
          </View>
        ) : tab === "alertas" ? (
          <View style={s.card}>
            <Text style={s.deliveryTitle}>
              {p.online ? "Conectado" : "Sem internet"}
            </Text>
            <Text>{p.health}</Text>
            <Text>
              {p.pending
                ? `${p.pending} registros aguardando envio automático.`
                : "Todos os registros foram sincronizados."}
            </Text>
            {p.error ? <Text style={s.error}>{p.error}</Text> : null}
            {p.notice ? <Text>{p.notice}</Text> : null}
            <Button title="Tentar sincronizar" onPress={p.onSync} />
          </View>
        ) : (
          <View style={s.card}>
            <Text style={s.deliveryTitle}>
              {p.profile?.name ?? "Motorista"}
            </Text>
            <Text>{p.health}</Text>
            {p.routes
              .filter(
                (r) =>
                  r.status !== "concluida" &&
                  r.deliveries.some((d) => d.status === "em_transporte"),
              )
              .map((r) => (
                <View key={r.id} style={s.accountRoute}>
                  <Text style={s.value}>{r.code}</Text>
                  <Button
                    title="Iniciar / retomar GPS"
                    disabled={p.busy || !p.online || p.pending > 0}
                    onPress={() => p.onTrack(r)}
                  />
                  {ordered(r)
                    .filter((d) => d.status === "em_transporte")
                    .map((d) => (
                      <Button
                        key={d.id}
                        secondary
                        title={"Navegar · " + d.clients.name}
                        onPress={() => p.onDirections(r, d)}
                      />
                    ))}
                </View>
              ))}
            <Button title="Pausar GPS" secondary onPress={p.onPause} />
            <Button title="Sair" secondary onPress={p.onLogout} />
          </View>
        )}
      </ScrollView>
      <View style={s.nav}>
        {[
          ["rotas", "➤", "Rotas"],
          ["resumo", "☷", "Resumo"],
          ["alertas", "♧", "Alertas"],
          ["conta", "♙", "Conta"],
        ].map(([id, icon, label]) => (
          <Pressable
            key={id}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === id }}
            onPress={() => setTab(id)}
            style={s.navItem}
          >
            <NavIcon name={id} color={tab === id ? "#108238" : "#4b607b"} />
            <Text style={[s.navLabel, tab === id && s.navActive]}>
              {label}
              {id === "alertas" && p.pending > 0 ? " •" : ""}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#edf1f5" },
  header: {
    backgroundColor: "#102b48",
    padding: 20,
    paddingBottom: 26,
    gap: 6,
  },
  brand: {
    color: "white",
    fontFamily: "Inter_700Bold",
    fontStyle: "italic",
    fontSize: 23,
    marginBottom: 12,
  },
  greeting: { color: "#bdcee2", fontSize: 18, fontFamily: "Inter_600SemiBold" },
  heading: {
    color: "white",
    fontFamily: "Inter_700Bold",
    fontSize: 30,
    lineHeight: 35,
  },
  back: {
    alignSelf: "flex-start",
    borderRadius: 24,
    paddingHorizontal: 15,
    paddingVertical: 9,
    backgroundColor: "#1c4268",
    marginBottom: 12,
  },
  backText: { color: "white", fontFamily: "Inter_700Bold", fontSize: 16 },
  content: { padding: 16, gap: 16, paddingBottom: 28 },
  chip: {
    backgroundColor: "#108238",
    borderRadius: 28,
    alignSelf: "flex-start",
    paddingHorizontal: 22,
    paddingVertical: 13,
  },
  chipText: { color: "white", fontFamily: "Inter_700Bold", fontSize: 16 },
  card: {
    padding: 18,
    borderRadius: 22,
    backgroundColor: "white",
    gap: 16,
    elevation: 2,
    shadowColor: "#102b48",
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  routeTitle: {
    flex: 1,
    fontFamily: "Inter_700Bold",
    fontSize: 27,
    lineHeight: 31,
  },
  badge: {
    backgroundColor: "#d8e6ff",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    maxWidth: 112,
  },
  badgeText: { color: "#124277", fontFamily: "Inter_700Bold", fontSize: 13 },
  amber: { backgroundColor: "#ffe7a3" },
  green: { backgroundColor: "#dcf2e4" },
  plate: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    letterSpacing: 1,
    borderWidth: 1.5,
    borderColor: "#102b48",
    borderRadius: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 5,
    marginTop: -10,
  },
  metrics: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  label: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#4b607b" },
  metric: { fontFamily: "Inter_700Bold", fontSize: 19 },
  tiles: { flexDirection: "row", gap: 10 },
  tile: { flex: 1, backgroundColor: "#f0f4fa", borderRadius: 15, padding: 12 },
  number: { fontFamily: "Inter_700Bold", fontSize: 26 },
  value: { fontFamily: "Inter_700Bold", fontSize: 16 },
  address: { fontSize: 14, lineHeight: 20, color: "#33465f" },
  button: {
    backgroundColor: "#108238",
    minHeight: 55,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
  },
  buttonText: { color: "white", fontFamily: "Inter_700Bold", fontSize: 18 },
  secondary: {
    backgroundColor: "#edf2f8",
    borderWidth: 1,
    borderColor: "#c4d0e0",
  },
  delivery: {
    backgroundColor: "white",
    borderRadius: 21,
    padding: 16,
    gap: 16,
    borderWidth: 1,
    borderColor: "#dce3ec",
    elevation: 2,
  },
  deliveryActive: { borderWidth: 2, borderColor: "#108238" },
  deliveryTitle: { fontFamily: "Inter_700Bold", fontSize: 24 },
  operation: { alignSelf: "center", minWidth: 210, marginTop: 24, gap: 12 },
  completed: { backgroundColor: "#dcf2e4", padding: 16, borderRadius: 14 },
  completedText: { color: "#087535", fontFamily: "Inter_700Bold" },
  error: { color: "#b22d35", fontSize: 13, lineHeight: 18 },
  accountRoute: {
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  nav: {
    flexDirection: "row",
    backgroundColor: "white",
    paddingTop: 12,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: "#d8e0eb",
  },
  navItem: { flex: 1, alignItems: "center", gap: 3 },
  navIcon: { fontSize: 26, color: "#4b607b" },
  navLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#4b607b" },
  navActive: { color: "#108238" },
});
