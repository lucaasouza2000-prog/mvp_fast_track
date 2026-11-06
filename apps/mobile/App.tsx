import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text as NativeText,
  type TextProps,
  TextInput,
  View,
} from "react-native";
import {
  useFonts,
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { StatusBar } from "expo-status-bar";
import { CameraView, useCameraPermissions } from "expo-camera";
import NetInfo from "@react-native-community/netinfo";
import * as Crypto from "expo-crypto";
import {
  labels,
  routeSelection,
  validateOperation,
  type Delivery,
  type Profile,
  type Route,
} from "@fasttrack/core";
import { backend, configured } from "./src/backend";
import {
  cached,
  enqueue,
  queue,
  saveProfile,
  saveRemoteRoutes,
  sync,
} from "./src/store";
import {
  activeTracking,
  startTracking,
  stopTracking,
  trackingHealth,
} from "./src/tracking";
function Text({ style, ...props }: TextProps) {
  return (
    <NativeText
      {...props}
      style={[{ fontFamily: "Inter_400Regular" }, style]}
    />
  );
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
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        (disabled || pressed) && { opacity: 0.5 },
      ]}
    >
      <Text style={[s.buttonText, secondary && { color: "#2563eb" }]}>
        {title}
      </Text>
    </Pressable>
  );
}
export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [user, setUser] = useState<string | null>(null),
    [profile, setProfile] = useState<Profile | null>(null),
    [routes, setRoutes] = useState<Route[]>([]),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [online, setOnline] = useState(true),
    [error, setError] = useState(""),
    [pending, setPending] = useState(0),
    [health, setHealth] = useState("Rastreamento não iniciado"),
    [expanded, setExpanded] = useState<string | null>(null),
    [notice, setNotice] = useState(""),
    [operation, setOperation] = useState<{
      route: Route;
      delivery: Delivery;
      kind: "check_in" | "check_out";
    } | null>(null),
    [code, setCode] = useState(""),
    [camera, setCamera] = useState(false),
    [permission, requestPermission] = useCameraPermissions();
  const currentUser = useRef(user);
  currentUser.current = user;
  const refresh = useCallback(async (id: string, connected: boolean) => {
    try {
      const local = await cached<Route[]>(id, "routes");
      if (currentUser.current !== id) return;
      if (local) setRoutes(local);
      const p = await cached<Profile>(id, "profile");
      if (currentUser.current !== id) return;
      if (p) setProfile(p);
      if (connected) {
        await sync(id);
        const result = await backend
          .from("routes")
          .select(routeSelection)
          .order("created_at", { ascending: false });
        if (result.error) throw result.error;
        await saveRemoteRoutes(id, result.data as unknown as Route[]);
        const latest = await cached<Route[]>(id, "routes");
        if (currentUser.current !== id) return;
        setRoutes(latest ?? []);
      }
      const q = await queue(id);
      if (currentUser.current !== id) return;
      setPending(q.length);
      if (q[0]?.error)
        setError(
          `Sincronização pendente: ${q[0].error}. O registro foi preservado.`,
        );
      else setError("");
      const active = await activeTracking();
      const rs = await cached<Route[]>(id, "routes");
      if (
        active?.user === id &&
        rs?.some((r) => r.id === active.route && r.status === "concluida")
      )
        await stopTracking();
      setHealth(await trackingHealth());
    } catch (e) {
      if (currentUser.current === id) setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void (async () => {
      const {
        data: { session },
      } = await backend.auth.getSession();
      if (!session) return;
      try {
        let p = await cached<Profile>(session.user.id, "profile");
        if (!p) {
          const result = await backend
            .from("profiles")
            .select("*")
            .eq("id", session.user.id)
            .single();
          p = result.data as Profile | null;
        }
        if (p?.role === "motorista") {
          await saveProfile(p);
          setProfile(p);
          setUser(session.user.id);
        } else {
          await backend.auth.signOut({ scope: "local" });
        }
      } catch {
        setError("Conecte-se para carregar seu perfil de motorista.");
      }
    })();
    const { data } = backend.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setUser(null);
        setProfile(null);
        setRoutes([]);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(
    () =>
      NetInfo.addEventListener((state) =>
        setOnline(!!state.isConnected && state.isInternetReachable !== false),
      ),
    [],
  );
  useEffect(() => {
    if (!user) return;
    void refresh(user, online);
    const timer = setInterval(() => void refresh(user, online), 15000);
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh(user, online);
    });
    return () => {
      clearInterval(timer);
      listener.remove();
    };
  }, [user, online, refresh]);
  async function login() {
    setBusy(true);
    setError("");
    try {
      if (!configured)
        throw new Error(
          "Configure as variáveis EXPO_PUBLIC_SUPABASE_* antes de gerar o aplicativo.",
        );
      const { data, error: e } = await backend.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (e) throw e;
      const { data: p, error: pe } = await backend
        .from("profiles")
        .select("*")
        .eq("id", data.user.id)
        .single();
      if (pe || p?.role !== "motorista") {
        await backend.auth.signOut();
        throw new Error(
          "Este aplicativo é exclusivo para motoristas cadastrados.",
        );
      }
      await saveProfile(p as Profile);
      setProfile(p as Profile);
      setUser(data.user.id);
      setPassword("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!operation || !user) return;
    setBusy(true);
    setError("");
    try {
      const local = await cached<Route[]>(user, "routes");
      const delivery = local
        ?.find((r) => r.id === operation.route.id)
        ?.deliveries.find((d) => d.id === operation.delivery.id);
      if (!delivery)
        throw new Error(
          "Entrega não sincronizada. Conecte-se antes de confirmar.",
        );
      const value = validateOperation(delivery, operation.kind, code);
      await enqueue(user, "operation", {
        id: Crypto.randomUUID(),
        route_id: operation.route.id,
        delivery_id: delivery.id,
        kind: operation.kind,
        code: value,
        captured_at: new Date().toISOString(),
      });
      const updated = await cached<Route[]>(user, "routes");
      if (
        updated?.find((r) => r.id === operation.route.id)?.status ===
        "concluida"
      )
        await stopTracking();
      setOperation(null);
      setNotice(
        online
          ? "Registro salvo no aparelho. Aguarde confirmação da sincronização."
          : "Registro salvo offline. Será enviado quando a conexão retornar.",
      );
      await refresh(user, online);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function track(r: Route) {
    Alert.alert(
      "Localização durante a rota",
      "O FastTrack registra seu GPS, inclusive com a tela bloqueada, enquanto esta rota estiver ativa. A notificação permanece visível. A frequência é aproximada e depende do Android. O gestor da sua empresa terá acesso às posições. Permita localização precisa e, na próxima tela, “Permitir o tempo todo”.",
      [
        { text: "Agora não", style: "cancel" },
        {
          text: "Permitir e iniciar",
          onPress: () => {
            setBusy(true);
            void startTracking(user!, r.id)
              .then(() => refresh(user!, online))
              .catch((e) => setError(e.message))
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  }
  async function logout() {
    await stopTracking();
    await backend.auth.signOut({ scope: "local" });
    setNotice("");
    setError("");
  }
  if (!fontsLoaded && !fontError)
    return (
      <SafeAreaView style={s.screen}>
        <ActivityIndicator color="#2563eb" />
      </SafeAreaView>
    );
  if (!user)
    return (
      <SafeAreaView style={s.screen}>
        <StatusBar style="dark" />
        <ScrollView contentContainerStyle={s.login}>
          <Text style={s.logo}>↗ FastTrack.</Text>
          <Text style={s.eyebrow}>FAST ARIAM + NOSTRA VIA</Text>
          <Text style={s.title}>Sua próxima entrega começa aqui.</Text>
          <Text style={s.subtitle}>Acesse sua conta de motorista.</Text>
          <TextInput
            accessibilityLabel="E-mail"
            style={s.input}
            placeholder="E-mail"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            accessibilityLabel="Senha"
            style={s.input}
            placeholder="Senha"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          {!!error && <Text style={s.error}>{error}</Text>}
          <Button
            title={busy ? "Entrando…" : "Entrar"}
            onPress={() => void login()}
            disabled={busy}
          />
        </ScrollView>
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={s.screen}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.header}>
          <Text style={s.logo}>↗ FastTrack.</Text>
          <Text style={{ color: online ? "#059669" : "#aa7a22", fontSize: 12 }}>
            {online ? "● Conectado" : "● Sem internet"}
          </Text>
        </View>
        <Text style={s.eyebrow}>
          OLÁ, {profile?.name.split(" ")[0].toUpperCase() ?? "MOTORISTA"}
        </Text>
        <Text style={s.title}>Suas rotas.</Text>
        <Text style={s.subtitle}>Cada entrega, um novo destino.</Text>
        <View style={s.notice}>
          <Text style={s.bold}>{health}</Text>
          <Text style={s.small}>
            {pending} registro(s) aguardando confirmação do servidor. GPS
            continua tentando capturar mesmo sem internet.
          </Text>
        </View>
        {!!error && <Text style={s.error}>{error}</Text>}
        {!!notice && <Text style={s.success}>{notice}</Text>}
        {!profile && (
          <Text style={s.subtitle}>
            Perfil indisponível. Conecte-se para sincronizar seu cadastro.
          </Text>
        )}
        {routes.length === 0 && (
          <View style={s.card}>
            <Text style={s.bold}>Nenhuma rota sincronizada</Text>
            <Text style={s.subtitle}>
              Conecte-se para receber as rotas atribuídas pelo gestor.
            </Text>
          </View>
        )}
        {routes.map((r) => (
          <View key={r.id} style={s.card}>
            <View style={s.header}>
              <Text style={s.bold}>{r.code}</Text>
              <Text style={s.badge}>{labels[r.status]}</Text>
            </View>
            <Text style={s.route}>● {r.origin}</Text>
            <Text style={s.route}>↳ {r.destination}</Text>
            <Text style={s.small}>
              {r.deliveries.filter((d) => d.status === "concluida").length}/
              {r.deliveries.length} entregas · {r.vehicles.plate}
            </Text>
            <Button
              secondary
              title={expanded === r.id ? "Recolher entregas" : "Ver entregas"}
              onPress={() => setExpanded(expanded === r.id ? null : r.id)}
            />
            {r.status !== "concluida" && (
              <Button
                title="Iniciar / retomar GPS"
                disabled={busy || !online || pending > 0}
                onPress={() => track(r)}
              />
            )}
            {expanded === r.id &&
              [...r.deliveries]
                .sort(
                  (a, b) =>
                    (r.stops.find((s) => s.id === a.stop_id)?.sequence ?? 0) -
                    (r.stops.find((s) => s.id === b.stop_id)?.sequence ?? 0),
                )
                .map((d) => (
                  <View style={s.delivery} key={d.id}>
                    <Text style={s.bold}>{d.clients.name}</Text>
                    <Text style={s.small}>
                      {d.cargo_code} · {d.weight_kg} kg
                    </Text>
                    <Text style={s.small}>
                      {r.stops.find((stop) => stop.id === d.stop_id)?.address}
                    </Text>
                    <Text style={s.badge}>{labels[d.status]}</Text>
                    {d.status !== "concluida" && (
                      <Button
                        title={
                          d.status === "pendente"
                            ? "Confirmar carga · check-in"
                            : "Concluir entrega · check-out"
                        }
                        secondary
                        onPress={() => {
                          setOperation({
                            route: r,
                            delivery: d,
                            kind:
                              d.status === "pendente"
                                ? "check_in"
                                : "check_out",
                          });
                          setCode("");
                          setCamera(false);
                          setError("");
                        }}
                      />
                    )}
                  </View>
                ))}
          </View>
        ))}
        <Button
          secondary
          title="Sincronizar agora"
          onPress={() => void refresh(user, online)}
        />
        <Button
          secondary
          title="Pausar coleta GPS"
          onPress={() => {
            void stopTracking().then(async () =>
              setHealth(await trackingHealth()),
            );
          }}
        />
        <Text style={s.small}>
          Pausar interrompe a coleta no aparelho. A rota permanece ativa e pode
          ser retomada com internet. O Android não garante execução após
          encerramento forçado.
        </Text>
        <Text style={s.footer}>{profile?.name}</Text>
        <Button
          secondary
          title="Sair"
          onPress={() =>
            Alert.alert(
              "Sair do FastTrack?",
              `${pending} registro(s) pendente(s) permanecerão criptografados neste aparelho. Entre com a mesma conta para sincronizar. O GPS será interrompido.`,
              [
                { text: "Cancelar", style: "cancel" },
                { text: "Sair", onPress: () => void logout() },
              ],
            )
          }
        />
      </ScrollView>
      <Modal
        visible={!!operation}
        animationType="slide"
        onRequestClose={() => setOperation(null)}
      >
        <SafeAreaView style={s.screen}>
          <ScrollView contentContainerStyle={s.content}>
            <Text style={s.title}>
              {operation?.kind === "check_in"
                ? "Confirmar carga"
                : "Concluir entrega"}
            </Text>
            <Text style={s.subtitle}>{operation?.delivery.clients.name}</Text>
            {camera && permission?.granted && (
              <CameraView
                style={{ height: 280, borderRadius: 12 }}
                facing="back"
                barcodeScannerSettings={{
                  barcodeTypes: ["qr", "code128", "ean13", "ean8", "pdf417"],
                }}
                onBarcodeScanned={({ data }) => {
                  setCode(data);
                  setCamera(false);
                }}
              />
            )}
            <Button
              secondary
              title={camera ? "Fechar câmera" : "Ler nota fiscal com a câmera"}
              onPress={() => {
                void (async () => {
                  if (camera) {
                    setCamera(false);
                    return;
                  }
                  const p = permission?.granted
                    ? permission
                    : await requestPermission();
                  if (p.granted) setCamera(true);
                  else
                    setError(
                      "Sem permissão de câmera. Digite o código manualmente.",
                    );
                })();
              }}
            />
            <TextInput
              style={s.input}
              accessibilityLabel="Código fiscal"
              placeholder="Chave NF-e ou código cadastrado"
              value={code}
              onChangeText={setCode}
              multiline
              autoCapitalize="characters"
            />
            <Text style={s.small}>
              Confere o documento cadastrado nesta entrega. Não consulta a
              situação fiscal na SEFAZ.
            </Text>
            {!!error && <Text style={s.error}>{error}</Text>}
            <Button
              title={busy ? "Salvando…" : "Confirmar registro"}
              disabled={busy || !code}
              onPress={() => void confirm()}
            />
            <Button
              secondary
              title="Cancelar"
              onPress={() => setOperation(null)}
            />
            {busy && <ActivityIndicator color="#2563eb" />}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f7f9fc" },
  content: { padding: 24, paddingTop: 36, gap: 16 },
  login: { padding: 28, paddingTop: 80, gap: 22 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  logo: {
    fontSize: 25,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    color: "#2563eb",
    letterSpacing: -1,
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.5,
    color: "#8997ac",
    marginTop: 22,
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    color: "#18243b",
    letterSpacing: -1,
  },
  subtitle: { fontSize: 13, color: "#8391a6", lineHeight: 22 },
  input: {
    backgroundColor: "white",
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#dee6f1",
    fontSize: 14,
    color: "#18243b",
  },
  button: {
    backgroundColor: "#2563eb",
    padding: 15,
    borderRadius: 9,
    alignItems: "center",
    marginVertical: 4,
  },
  secondary: {
    backgroundColor: "#eff5ff",
    borderWidth: 1,
    borderColor: "#e0eaff",
  },
  buttonText: {
    color: "white",
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  card: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e9edf3",
    gap: 13,
  },
  bold: {
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#263954",
  },
  small: { fontSize: 11, color: "#8796ac", lineHeight: 19 },
  route: { fontSize: 14, color: "#526883", lineHeight: 22 },
  badge: {
    fontSize: 10,
    color: "#3974dc",
    backgroundColor: "#eff5ff",
    padding: 7,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  notice: { padding: 17, backgroundColor: "#eff5ff", borderRadius: 10, gap: 8 },
  error: {
    fontSize: 12,
    color: "#b52d38",
    padding: 14,
    backgroundColor: "#fff0f0",
    borderRadius: 8,
    lineHeight: 20,
  },
  success: {
    fontSize: 12,
    color: "#16835e",
    padding: 14,
    backgroundColor: "#eaf8f2",
    borderRadius: 8,
    lineHeight: 20,
  },
  delivery: {
    borderTopWidth: 1,
    borderColor: "#edf0f5",
    paddingTop: 18,
    gap: 9,
  },
  footer: {
    fontSize: 12,
    color: "#8391a6",
    textAlign: "center",
    marginTop: 20,
  },
});
