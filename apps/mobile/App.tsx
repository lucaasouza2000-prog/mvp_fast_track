import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
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
  deliveryDirectionsUrl,
  type Delivery,
  type Profile,
  type Route,
  type ArrivalEstimate,
} from "@fasttrack/core";
import { backend, configured } from "./src/backend";
import { mobileErrorMessage } from "./src/secure-session";
import DriverWorkspace from "./src/workspace";
import { deliveryForecast } from "./src/forecast";
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
  captureTrackingPosition,
  LOCATION_INTERVAL_MS,
} from "./src/tracking";
function Text({ style, ...props }: TextProps) {
  return (
    <NativeText
      {...props}
      style={[{ fontFamily: "Inter_400Regular" }, style]}
    />
  );
}
function BrandMark() {
  return (
    <Image
      source={require("./assets/fast-track-logo.png")}
      accessibilityLabel="FAST TRACK"
      style={s.logo}
      resizeMode="cover"
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
    [notice, setNotice] = useState(""),
    [operation, setOperation] = useState<{
      route: Route;
      delivery: Delivery;
      kind: "check_in" | "check_out";
    } | null>(null),
    [code, setCode] = useState(""),
    [camera, setCamera] = useState(false),
    [permission, requestPermission] = useCameraPermissions();
  const [estimates, setEstimates] = useState<Record<string, ArrivalEstimate>>(
    {},
  );
  const estimateTargets = JSON.stringify(
    routes
      .filter((r) => r.status === "ativa")
      .flatMap((r) =>
        r.deliveries
          .filter((d) => d.status === "em_transporte")
          .map((d) => [r.id, d.id]),
      ),
  );
  const currentUser = useRef(user);
  const refreshing = useRef(new Map<string, Promise<void>>());
  currentUser.current = user;
  useEffect(() => {
    if (!user || !online || estimateTargets === "[]") {
      setEstimates({});
      return;
    }
    let active = true;
    let version = 0;
    const targets = JSON.parse(estimateTargets) as [string, string][];
    async function load() {
      const current = ++version;
      const values = await Promise.all(
        targets.map(
          async ([route, delivery]) =>
            [delivery, await deliveryForecast(route, delivery)] as const,
        ),
      );
      if (active && current === version && currentUser.current === user)
        setEstimates(Object.fromEntries(values));
    }
    void load();
    const timer = setInterval(() => void load(), 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [user, online, estimateTargets]);
  const refresh = useCallback(
    (id: string, connected: boolean): Promise<void> => {
      const pendingRefresh = refreshing.current.get(id);
      if (pendingRefresh) return pendingRefresh;
      const task = (async () => {
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
          if (!q.length)
            setNotice((current) =>
              current.startsWith("Registro salvo")
                ? "Registro confirmado no servidor. As alterações são sincronizadas automaticamente."
                : current,
            );
          const active = await activeTracking();
          const rs = await cached<Route[]>(id, "routes");
          if (
            active?.user === id &&
            rs?.some((r) => r.id === active.route && r.status === "concluida")
          )
            await stopTracking();
          setHealth(await trackingHealth());
        } catch (e) {
          if (currentUser.current === id) setError(mobileErrorMessage(e));
        }
      })();
      refreshing.current.set(id, task);
      void task.finally(() => refreshing.current.delete(id));
      return task;
    },
    [],
  );
  useEffect(() => {
    void (async () => {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await backend.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session) return;
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
      } catch (e) {
        setError(mobileErrorMessage(e));
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
    const channel = online
      ? backend
          .channel("mobile-workspace-" + user)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "routes",
              filter: "driver_id=eq." + user,
            },
            () => void refresh(user, true),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "deliveries" },
            () => void refresh(user, true),
          )
          .subscribe()
      : null;
    return () => {
      clearInterval(timer);
      listener.remove();
      if (channel) void backend.removeChannel(channel);
    };
  }, [user, online, refresh]);
  useEffect(() => {
    if (!user) return;
    let active = true;
    const capture = () => {
      void captureTrackingPosition(user)
        .then(async () => {
          const [nextHealth, items] = await Promise.all([
            trackingHealth(),
            queue(user),
          ]);
          if (active && currentUser.current === user) {
            setHealth(nextHealth);
            setPending(items.length);
          }
        })
        .catch((e) => {
          if (active && currentUser.current === user)
            setError(mobileErrorMessage(e));
        });
    };
    capture();
    const timer = setInterval(capture, LOCATION_INTERVAL_MS);
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") capture();
    });
    return () => {
      active = false;
      clearInterval(timer);
      listener.remove();
    };
  }, [user]);
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
      setError(mobileErrorMessage(e));
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
      if (operation.kind === "check_in" && online) {
        const updatedRoute = (await cached<Route[]>(user, "routes"))?.find(
          (r) => r.id === operation.route.id,
        );
        const updatedDelivery = updatedRoute?.deliveries.find(
          (d) => d.id === delivery.id,
        );
        if (updatedRoute && updatedDelivery?.status === "em_transporte")
          Alert.alert(
            "Carga confirmada",
            "A rota da entrega está disponível. Deseja abrir a navegação?",
            [
              { text: "Agora não", style: "cancel" },
              {
                text: "Ver rota da entrega",
                onPress: () =>
                  void openDirections(updatedRoute, updatedDelivery),
              },
            ],
          );
      }
    } catch (e) {
      setError(mobileErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function openDirections(route: Route, delivery: Delivery) {
    try {
      await Linking.openURL(deliveryDirectionsUrl(route, delivery));
    } catch (e) {
      setError(mobileErrorMessage(e));
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
              .catch((e) => setError(mobileErrorMessage(e)))
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  }
  async function logout() {
    setError("");
    try {
      await stopTracking();
      const { error: signOutError } = await backend.auth.signOut({
        scope: "local",
      });
      if (signOutError) throw signOutError;
      setNotice("");
    } catch (e) {
      setError(mobileErrorMessage(e));
    }
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
          <BrandMark />
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
      <DriverWorkspace
        profile={profile}
        routes={routes}
        online={online}
        busy={busy}
        pending={pending}
        health={health}
        error={error}
        notice={notice}
        estimates={estimates}
        onOperation={(route, delivery) => {
          setOperation({
            route,
            delivery,
            kind: delivery.status === "pendente" ? "check_in" : "check_out",
          });
          setCode("");
          setCamera(false);
          setError("");
        }}
        onDirections={(route, delivery) => void openDirections(route, delivery)}
        onTrack={track}
        onSync={() => void refresh(user, online)}
        onPause={() =>
          void stopTracking()
            .then(async () => setHealth(await trackingHealth()))
            .catch((e) => setError(mobileErrorMessage(e)))
        }
        onLogout={() =>
          Alert.alert(
            "Sair do FAST TRACK?",
            pending +
              " registro(s) pendente(s) permanecerão criptografados. Entre com a mesma conta para sincronizar. O GPS será interrompido.",
            [
              { text: "Cancelar", style: "cancel" },
              { text: "Sair", onPress: () => void logout() },
            ],
          )
        }
      />
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
    width: 210,
    height: 54,
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
