import React, { useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as NativeText,
  View,
  type TextProps,
  type DimensionValue,
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
      style={[{ fontFamily: "Inter_400Regular" }, style]}
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
function duration(route: Route) {
  if (!route.started_at) return "—";
  const endings = route.deliveries
    .map((d) => Date.parse(d.checked_out_at ?? ""))
    .filter(Number.isFinite);
  const end = route.completed_at
    ? Date.parse(route.completed_at)
    : route.status === "concluida" && endings.length
      ? Math.max(...endings)
      : Date.now();
  const minutes = Math.max(
    0,
    Math.floor((end - Date.parse(route.started_at)) / 60000),
  );
  return (
    Math.floor(minutes / 60) +
    "h " +
    String(minutes % 60).padStart(2, "0") +
    "m"
  );
}
function Pill({ status }: { status: string }) {
  return (
    <View
      style={[
        s.pill,
        status === "concluida" && s.pillDone,
        status === "ativa" || status === "em_transporte" ? s.pillActive : null,
      ]}
    >
      <Text style={s.pillText}>{labels[status] ?? status}</Text>
    </View>
  );
}
function Action({
  title,
  onPress,
  secondary = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={[
        s.action,
        secondary && s.actionSecondary,
        disabled && { opacity: 0.45 },
      ]}
    >
      <Text style={[s.actionText, secondary && { color: "#245e90" }]}>
        {title}
      </Text>
    </Pressable>
  );
}
function Progress({ route }: { route: Route }) {
  const done = route.deliveries.filter((d) => d.status === "concluida").length;
  const pct = route.deliveries.length
    ? Math.round((done / route.deliveries.length) * 100)
    : 0;
  return (
    <View>
      <View style={s.progressHeading}>
        <Text style={s.caption}>PROGRESSO DAS ENTREGAS</Text>
        <Text style={s.percent}>{pct}%</Text>
      </View>
      <View style={s.progressTrack}>
        <View
          style={[s.progressFill, { width: (pct + "%") as DimensionValue }]}
        />
      </View>
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
  onOperation: (route: Route, delivery: Delivery) => void;
  onDirections: (route: Route, delivery: Delivery) => void;
  onTrack: (route: Route) => void;
  onSync: () => void;
  onPause: () => void;
  onLogout: () => void;
}
export default function DriverWorkspace(props: Props) {
  const {
    profile,
    routes,
    online,
    busy,
    pending,
    health,
    error,
    notice,
    estimates,
  } = props;
  const [tab, setTab] = useState("rotas");
  const [filter, setFilter] = useState("todas");
  const [selected, setSelected] = useState<string | null>(null);
  const route = routes.find((r) => r.id === selected);
  const filters = [
    ["todas", "Todas"],
    ["ativa", "Ativas"],
    ["planejada", "Pendentes"],
    ["concluida", "Finalizadas"],
  ];
  const deliveries = routes.flatMap((r) => r.deliveries);
  const done = deliveries.filter((d) => d.status === "concluida").length;
  const arrival = (r: Route, d?: Delivery) => {
    if (d?.status === "concluida")
      return "Entregue às " + clock(d.checked_out_at);
    const eta = d ? estimates[d.id] : undefined;
    const time = online ? arrivalTime(eta) : null;
    if (time) return "Chegada aprox. " + time;
    if (!online) return "Previsão disponível online";
    if (d?.status === "pendente") return "Aguardando coleta";
    if (r.status !== "ativa") return "Aguardando início";
    return eta?.status === "unavailable"
      ? "Previsão indisponível"
      : "Aguardando GPS recente";
  };
  const ordered = (r: Route) =>
    [...r.deliveries].sort(
      (a, b) =>
        (r.stops.find((s) => s.id === a.stop_id)?.sequence ?? 0) -
        (r.stops.find((s) => s.id === b.stop_id)?.sequence ?? 0),
    );
  return (
    <View style={s.root}>
      <View style={s.top}>
        <Image
          source={require("../assets/fast-track-logo.png")}
          style={s.logo}
          resizeMode="cover"
          accessibilityLabel="FAST TRACK"
        />
        <Text style={[s.connection, { color: online ? "#129b83" : "#b28124" }]}>
          ● {online ? "Conectado" : "Sem internet"}
        </Text>
      </View>
      <ScrollView contentContainerStyle={s.content}>
        {tab === "rotas" && route ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Voltar para rotas"
              onPress={() => setSelected(null)}
            >
              <Text style={s.back}>‹ Suas rotas</Text>
            </Pressable>
            <View style={s.row}>
              <View>
                <Text style={s.title}>{route.code}</Text>
                <Text style={s.subtitle}>
                  {route.vehicles.plate} · {route.deliveries.length} entrega(s)
                </Text>
              </View>
              <Pill status={route.status} />
            </View>
            <Progress route={route} />
            <View style={s.health}>
              <Text style={s.healthTitle}>{health}</Text>
              <Text style={s.small}>
                {pending} registro(s) aguardando confirmação
              </Text>
            </View>
            {error ? <Text style={s.error}>{error}</Text> : null}
            {notice ? <Text style={s.notice}>{notice}</Text> : null}
            <View style={s.timelineRow}>
              <View style={s.rail}>
                <View style={s.railLine} />
                <View style={[s.circle, s.circleStart]}>
                  <Text style={s.circleText}>↑</Text>
                </View>
              </View>
              <View style={s.stopCard}>
                <Text style={s.stopTitle}>Ponto de partida</Text>
                <Text style={s.address}>{route.origin}</Text>
                <Text style={s.small}>
                  Saída {clock(route.started_at ?? route.scheduled_at)}
                </Text>
              </View>
            </View>
            {ordered(route).map((d, index) => (
              <View key={d.id} style={s.timelineRow}>
                <View style={s.rail}>
                  <View style={s.railLine} />
                  <View
                    style={[
                      s.circle,
                      d.status === "concluida" && s.circleDone,
                      d.status === "em_transporte" && s.circleStart,
                    ]}
                  >
                    <Text
                      style={[
                        s.circleText,
                        d.status === "pendente" && { color: "#63809a" },
                      ]}
                    >
                      {d.status === "concluida" ? "✓" : index + 1}
                    </Text>
                  </View>
                </View>
                <View
                  style={[
                    s.stopCard,
                    d.status === "em_transporte" && s.stopActive,
                  ]}
                >
                  <Text style={s.eta}>{arrival(route, d)}</Text>
                  <Text style={s.stopTitle}>{d.clients.name}</Text>
                  <Text style={s.address}>
                    {route.stops.find((p) => p.id === d.stop_id)?.address}
                  </Text>
                  <Text style={s.small}>
                    {d.cargo_code} · {d.weight_kg} kg
                  </Text>
                  <Pill status={d.status} />
                  {d.checked_in_at ? (
                    <Text style={s.small}>
                      Coleta confirmada às {clock(d.checked_in_at)}
                    </Text>
                  ) : null}
                  {d.status === "em_transporte" ? (
                    <Action
                      title="Ver rota da entrega"
                      onPress={() => props.onDirections(route, d)}
                    />
                  ) : null}
                  {d.status !== "concluida" ? (
                    <Action
                      secondary
                      disabled={busy}
                      title={
                        d.status === "pendente"
                          ? "Confirmar carga · check-in"
                          : "Concluir entrega · check-out"
                      }
                      onPress={() => props.onOperation(route, d)}
                    />
                  ) : null}
                </View>
              </View>
            ))}
            <Text style={s.disclaimer}>
              Previsão aproximada, sem trânsito em tempo real ou tempo de
              parada.
            </Text>
            {route.status !== "concluida" ? (
              <Action
                title="Iniciar / retomar GPS"
                disabled={busy || !online || pending > 0}
                onPress={() => props.onTrack(route)}
              />
            ) : null}
            <Action
              title="Sincronizar agora"
              secondary
              onPress={props.onSync}
            />
          </>
        ) : tab === "rotas" ? (
          <>
            <Text style={s.eyebrow}>
              OLÁ, {profile?.name.split(" ")[0].toUpperCase() ?? "MOTORISTA"}
            </Text>
            <Text style={s.title}>Suas rotas</Text>
            <Text style={s.subtitle}>
              Sua operação organizada, parada por parada.
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.filters}
            >
              {filters.map(([value, label]) => (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  onPress={() => setFilter(value)}
                  style={[s.filter, filter === value && s.filterSelected]}
                >
                  <Text
                    style={[
                      s.filterText,
                      filter === value && { color: "#245e90" },
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={s.health}>
              <Text style={s.healthTitle}>{health}</Text>
              <Text style={s.small}>
                {pending} registro(s) aguardando confirmação do servidor
              </Text>
            </View>
            {error ? <Text style={s.error}>{error}</Text> : null}
            {notice ? <Text style={s.notice}>{notice}</Text> : null}
            {routes
              .filter((r) => filter === "todas" || r.status === filter)
              .map((r) => {
                const stops = ordered(r);
                const last = [...stops]
                  .reverse()
                  .find((d) => d.status === "em_transporte");
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={"Abrir rota " + r.code}
                    key={r.id}
                    style={s.routeCard}
                    onPress={() => setSelected(r.id)}
                  >
                    <View style={s.row}>
                      <View>
                        <Text style={s.routeTitle}>{r.code}</Text>
                        <Text style={s.small}>{r.vehicles.plate}</Text>
                      </View>
                      <Pill status={r.status} />
                    </View>
                    <Progress route={r} />
                    <View style={s.metrics}>
                      <View>
                        <Text style={s.caption}>DURAÇÃO</Text>
                        <Text style={s.metric}>{duration(r)}</Text>
                      </View>
                      <View>
                        <Text style={s.caption}>SAÍDA</Text>
                        <Text style={s.metric}>
                          {clock(r.started_at ?? r.scheduled_at)}
                        </Text>
                      </View>
                      <View>
                        <Text style={s.caption}>CHEGADA</Text>
                        <Text style={s.metric}>
                          {r.status === "concluida"
                            ? clock(r.completed_at)
                            : (arrivalTime(
                                last ? estimates[last.id] : undefined,
                              ) ?? "—")}
                        </Text>
                      </View>
                    </View>
                    <View style={s.cardFooter}>
                      <View style={s.stat}>
                        <Text style={s.statNumber}>
                          {
                            r.deliveries.filter((d) => d.status === "concluida")
                              .length
                          }
                          /{r.deliveries.length}
                        </Text>
                        <Text style={s.small}>entregas</Text>
                      </View>
                      <View style={s.stat}>
                        <Text style={s.statNumber}>
                          {r.deliveries.reduce(
                            (sum, d) => sum + d.weight_kg,
                            0,
                          )}{" "}
                          kg
                        </Text>
                        <Text style={s.small}>peso da rota</Text>
                      </View>
                      <Text style={s.openRoute}>Ver rota ›</Text>
                    </View>
                    <Text numberOfLines={2} style={s.destination}>
                      {r.destination}
                    </Text>
                  </Pressable>
                );
              })}
            {!routes.length ? (
              <View style={s.routeCard}>
                <Text style={s.stopTitle}>Nenhuma rota sincronizada</Text>
                <Text style={s.address}>
                  Conecte-se e sincronize para carregar suas entregas.
                </Text>
              </View>
            ) : null}
            <Action
              title="Sincronizar agora"
              secondary
              onPress={props.onSync}
            />
          </>
        ) : tab === "resumo" ? (
          <>
            <Text style={s.title}>Resumo da operação</Text>
            <Text style={s.subtitle}>
              Dados das rotas atribuídas à sua conta.
            </Text>
            <View style={s.routeCard}>
              {[
                [
                  "Rotas em andamento",
                  routes.filter((r) => r.status === "ativa").length,
                ],
                [
                  "Rotas finalizadas",
                  routes.filter((r) => r.status === "concluida").length,
                ],
                ["Entregas concluídas", done],
                ["Entregas restantes", deliveries.length - done],
                ["Registros aguardando envio", pending],
              ].map(([label, value]) => (
                <View key={label} style={s.summaryRow}>
                  <Text style={s.address}>{label}</Text>
                  <Text style={s.statNumber}>{value}</Text>
                </View>
              ))}
            </View>
          </>
        ) : tab === "alertas" ? (
          <>
            <Text style={s.title}>Alertas do aplicativo</Text>
            <View style={s.routeCard}>
              <Text style={s.stopTitle}>{health}</Text>
              <Text style={s.address}>
                {pending} registro(s) pendente(s) de sincronização.
              </Text>
              <Text style={s.address}>
                {online
                  ? "Conexão disponível."
                  : "Sem internet. Registros permanecem no aparelho."}
              </Text>
              {error ? <Text style={s.error}>{error}</Text> : null}
            </View>
            <Action title="Sincronizar agora" onPress={props.onSync} />
            <Action
              title="Pausar coleta GPS"
              secondary
              onPress={props.onPause}
            />
          </>
        ) : (
          <>
            <Text style={s.title}>Sua conta</Text>
            <View style={s.routeCard}>
              <Text style={s.stopTitle}>{profile?.name}</Text>
              <Text style={s.address}>Motorista</Text>
              <Text style={s.address}>
                {profile?.phone ?? "Telefone não informado"}
              </Text>
            </View>
            <Action
              title="Sair do FAST TRACK"
              secondary
              onPress={props.onLogout}
            />
          </>
        )}
      </ScrollView>
      <View style={s.nav}>
        {[
          ["rotas", "↗", "Rotas"],
          ["resumo", "▥", "Resumo"],
          ["alertas", "◷", "Alertas"],
          ["conta", "●", "Conta"],
        ].map(([value, icon, label]) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            onPress={() => {
              setTab(value);
              setSelected(null);
            }}
            style={s.navItem}
          >
            <Text style={[s.navIcon, tab === value && s.navSelected]}>
              {icon}
            </Text>
            <Text style={[s.navLabel, tab === value && s.navSelected]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f5f8fb" },
  top: {
    paddingHorizontal: 22,
    paddingTop: 30,
    paddingBottom: 8,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logo: { width: 205, height: 53 },
  connection: { fontSize: 11 },
  content: { padding: 20, paddingBottom: 28, gap: 16 },
  eyebrow: { fontSize: 10, letterSpacing: 1.5, color: "#8a99aa" },
  title: { fontSize: 27, fontFamily: "Inter_700Bold", color: "#18344d" },
  subtitle: { fontSize: 12, color: "#8293a5", lineHeight: 19 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  back: { fontSize: 15, color: "#2b6b98", fontFamily: "Inter_600SemiBold" },
  routeTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#1e3b54" },
  routeCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e1e9f0",
    borderRadius: 15,
    padding: 18,
    gap: 16,
  },
  pill: {
    alignSelf: "flex-start",
    backgroundColor: "#edf2f6",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 6,
  },
  pillDone: { backgroundColor: "#e6f6f1" },
  pillActive: { backgroundColor: "#e5f0fa" },
  pillText: { fontSize: 10, color: "#2d668e", fontFamily: "Inter_600SemiBold" },
  progressHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 7,
  },
  caption: { fontSize: 8, color: "#98a6b3", letterSpacing: 0.5 },
  percent: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#43748e" },
  progressTrack: {
    height: 5,
    backgroundColor: "#edf2f6",
    borderRadius: 8,
    overflow: "hidden",
  },
  progressFill: { height: 5, backgroundColor: "#387fa7", borderRadius: 8 },
  metrics: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  metric: {
    fontSize: 11,
    color: "#29465e",
    fontFamily: "Inter_600SemiBold",
    marginTop: 5,
  },
  cardFooter: {
    flexDirection: "row",
    gap: 22,
    alignItems: "center",
    paddingTop: 4,
  },
  stat: { borderLeftWidth: 3, borderLeftColor: "#26bca5", paddingLeft: 8 },
  statNumber: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#2f536e" },
  small: { fontSize: 10, color: "#8495a7", lineHeight: 16 },
  openRoute: {
    marginLeft: "auto",
    color: "#2e729c",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  destination: { fontSize: 11, color: "#8091a2", lineHeight: 17 },
  filters: { gap: 8, paddingVertical: 2 },
  filter: {
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e0e8ee",
    backgroundColor: "#fff",
  },
  filterSelected: { backgroundColor: "#e5f0f6", borderColor: "#82b0c6" },
  filterText: { fontSize: 11, color: "#8a99a8" },
  health: { backgroundColor: "#eaf2f9", borderRadius: 12, padding: 13, gap: 5 },
  healthTitle: {
    fontSize: 12,
    color: "#385a76",
    fontFamily: "Inter_600SemiBold",
  },
  notice: {
    padding: 12,
    backgroundColor: "#e8f7f1",
    color: "#258f78",
    borderRadius: 10,
    fontSize: 11,
    lineHeight: 18,
  },
  error: {
    padding: 12,
    backgroundColor: "#fff0f0",
    color: "#be3b45",
    borderRadius: 10,
    fontSize: 12,
    lineHeight: 18,
  },
  timelineRow: { flexDirection: "row", gap: 10 },
  rail: { width: 28, alignItems: "center", position: "relative" },
  railLine: {
    position: "absolute",
    width: 2,
    top: 0,
    bottom: -16,
    backgroundColor: "#9ed1d1",
  },
  circle: {
    width: 25,
    height: 25,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: "#a4c0cf",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  circleStart: { borderColor: "#2f87a6", backgroundColor: "#2f87a6" },
  circleDone: { borderColor: "#24b4a1", backgroundColor: "#24b4a1" },
  circleText: { fontSize: 12, fontFamily: "Inter_700Bold", color: "#fff" },
  stopCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e1eaf0",
    padding: 15,
    gap: 9,
  },
  stopActive: { borderColor: "#75b9c4", borderWidth: 1.5 },
  stopTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#24455d" },
  address: { fontSize: 12, color: "#7c8fa1", lineHeight: 19 },
  eta: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#3c829c" },
  action: {
    borderRadius: 9,
    padding: 12,
    backgroundColor: "#2f80aa",
    alignItems: "center",
    justifyContent: "center",
  },
  actionSecondary: {
    backgroundColor: "#edf4f9",
    borderWidth: 1,
    borderColor: "#dfebf3",
  },
  actionText: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  disclaimer: { fontSize: 10, color: "#91a0af", lineHeight: 16 },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#edf2f5",
  },
  nav: {
    flexDirection: "row",
    paddingTop: 10,
    paddingBottom: 18,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e3ebf1",
  },
  navItem: { flex: 1, alignItems: "center", gap: 3 },
  navIcon: { fontSize: 18, color: "#9baab8" },
  navLabel: { fontSize: 10, color: "#9baab8" },
  navSelected: { color: "#2f7da2", fontFamily: "Inter_600SemiBold" },
});
