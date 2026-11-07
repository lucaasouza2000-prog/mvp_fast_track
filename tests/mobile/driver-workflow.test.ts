import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { createDemoState } from "@fasttrack/core/demo";
import type { Route } from "@fasttrack/core";
const hooks = vi.hoisted(() => ({
  cursor: 0,
  effectCursor: 0,
  state: [] as any[],
  effects: [] as { deps: unknown[]; cleanup?: () => void }[],
  back: null as null | (() => boolean),
}));
// Keep real React elements and exercise the actual component callbacks/state.
// Native rendering is replaced with host elements; no device or permissions are simulated here.
vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
      const n = hooks.effectCursor++;
      const previous = hooks.effects[n];
      if (!previous || deps.some((d, i) => !Object.is(d, previous.deps[i]))) {
        previous?.cleanup?.();
        hooks.effects[n] = { deps, cleanup: effect() || undefined };
      }
    },
    useState: (initial: unknown) => {
      const n = hooks.cursor++;
      if (!(n in hooks.state)) hooks.state[n] = initial;
      return [
        hooks.state[n],
        (value: unknown) => {
          hooks.state[n] =
            typeof value === "function" ? value(hooks.state[n]) : value;
        },
      ];
    },
  };
});
vi.mock("react-native", () => ({
  Pressable: "pressable",
  BackHandler: {
    addEventListener: (_event: string, listener: () => boolean) => {
      hooks.back = listener;
      return {
        remove: () => {
          if (hooks.back === listener) hooks.back = null;
        },
      };
    },
  },
  ScrollView: "scroll",
  Text: "text",
  View: "view",
  StyleSheet: { create: (s: unknown) => s },
}));
import Workspace from "../../apps/mobile/src/workspace";
function elements(node: any): ReactElement<any>[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  if (typeof node.type === "function") return elements(node.type(node.props));
  return [node, ...elements(node.props?.children)];
}
function text(node: any): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node.type === "function") return text(node.type(node.props));
  return text(node.props?.children);
}
let route: Route;
let props: Parameters<typeof Workspace>[0];
function render() {
  hooks.cursor = 0;
  hooks.effectCursor = 0;
  return elements(Workspace(props));
}
function button(label: string) {
  return render().find(
    (e) => e.type === "pressable" && text(e.props.children) === label,
  );
}
function press(label: string) {
  const b = button(label);
  expect(b, label).toBeDefined();
  if (!b!.props.disabled) b!.props.onPress();
}
beforeEach(() => {
  hooks.effects.forEach((e) => e.cleanup?.());
  hooks.effects = [];
  hooks.effectCursor = 0;
  hooks.back = null;
  hooks.cursor = 0;
  hooks.state = [];
  route = structuredClone(createDemoState().routes[0]);
  route.status = "planejada";
  route.deliveries.forEach((d) => {
    d.status = "pendente";
    d.checked_in_at = null;
    d.checked_out_at = null;
  });
  props = {
    profile: route.profiles,
    routes: [route],
    online: true,
    busy: false,
    pending: 0,
    health: "",
    error: "",
    notice: "",
    estimates: {},
    onOperation: vi.fn(),
    onDirections: vi.fn(),
    onTrack: vi.fn(),
    onSync: vi.fn(),
    onPause: vi.fn(),
    onLogout: vi.fn(),
  };
});
describe("fluxo do motorista com o design simplificado", () => {
  it("Confirmar abre diretamente o check-in da carga e não oferece check-out antes da validação", () => {
    press("Confirmar  →");
    expect(props.onOperation).toHaveBeenCalledWith(
      route,
      expect.objectContaining({ status: "pendente" }),
    );
    expect(button("Check-out")).toBeUndefined();
    expect(button("Ver rota da entrega")).toBeUndefined();
    // Cancelling or rejecting the fiscal validation cannot advance delivery status.
    expect(route.deliveries.every((d) => d.status === "pendente")).toBe(true);
    expect(button("Check-in")).toBeDefined();
  });
  it("após check-in mantém a entrega aberta, oferece a rota correta e só então permite check-out", () => {
    press("Confirmar  →");
    const d = vi.mocked(props.onOperation).mock.calls[0][1];
    d.status = "em_transporte";
    d.checked_in_at = new Date().toISOString();
    press("Ver rota da entrega");
    expect(props.onDirections).toHaveBeenCalledWith(route, d);
    press("Check-out");
    expect(props.onOperation).toHaveBeenLastCalledWith(route, d);
    expect(d.status).toBe("em_transporte");
  });
  it("carga já confirmada abre sua rota sem repetir check-in", () => {
    route.deliveries.forEach((d) => {
      d.status = "em_transporte";
    });
    expect(button("Confirmar  →")).toBeUndefined();
    press("Ver rota  →");
    expect(props.onOperation).not.toHaveBeenCalled();
    expect(button("Ver rota da entrega")).toBeDefined();
  });
  it("rota concluída não permite repetir coleta ou entrega e respeita operação em andamento", () => {
    props.busy = true;
    press("Confirmar  →");
    expect(props.onOperation).not.toHaveBeenCalled();
    props.busy = false;
    route.status = "concluida";
    route.deliveries.forEach((d) => {
      d.status = "concluida";
    });
    press("Ver entregas  →");
    expect(button("Check-in")).toBeUndefined();
    expect(button("Check-out")).toBeUndefined();
  });
});

function selectTab(name: string) {
  const target = render().find(
    (e) =>
      e.props.accessibilityRole === "tab" &&
      e.props.accessibilityLabel === name,
  );
  expect(target).toBeDefined();
  target!.props.onPress();
}
function openActiveRoute() {
  route.deliveries.forEach((d) => {
    d.status = "em_transporte";
  });
  press("Ver rota  →");
  render();
}
describe("voltar e comandos de navegação do motorista", () => {
  it("Suas rotas retorna à lista sem repetir check-in nem alterar a entrega", () => {
    openActiveRoute();
    press("‹ Suas rotas");
    expect(button("Ver rota  →")).toBeDefined();
    expect(button("Check-out")).toBeUndefined();
    expect(props.onOperation).not.toHaveBeenCalled();
    expect(route.deliveries[0].status).toBe("em_transporte");
    props.routes = [{ ...route }];
    expect(button("Ver rota  →")).toBeDefined();
  });
  it("a aba Rotas volta à lista mesmo quando a rota já está aberta", () => {
    openActiveRoute();
    selectTab("Rotas");
    expect(button("Ver rota  →")).toBeDefined();
    expect(button("Check-out")).toBeUndefined();
  });
  it("o voltar do Android fecha o detalhe antes de permitir sair na lista", () => {
    openActiveRoute();
    expect(hooks.back!()).toBe(true);
    render();
    expect(button("Ver rota  →")).toBeDefined();
    expect(hooks.back!()).toBe(false);
  });
  it("o voltar do Android retorna de outras abas e remove o listener ao desmontar", () => {
    selectTab("Conta");
    render();
    expect(hooks.back!()).toBe(true);
    render();
    expect(button("Confirmar  →")).toBeDefined();
    hooks.effects.forEach((e) => e.cleanup?.());
    expect(hooks.back).toBeNull();
  });
  it("as abas Resumo, Alertas e Conta respondem, e Rotas não reabre o detalhe antigo", () => {
    openActiveRoute();
    selectTab("Resumo");
    expect(text(WorkspaceRender())).toContain("Sua operação");
    selectTab("Alertas");
    expect(button("Tentar sincronizar")).toBeDefined();
    selectTab("Conta");
    expect(button("Sair")).toBeDefined();
    selectTab("Rotas");
    expect(button("Ver rota  →")).toBeDefined();
    expect(button("Check-out")).toBeUndefined();
  });
  it("os comandos de sincronizar, GPS, navegar, pausar e sair chamam as ações correspondentes", () => {
    openActiveRoute();
    selectTab("Alertas");
    press("Tentar sincronizar");
    expect(props.onSync).toHaveBeenCalledOnce();
    selectTab("Conta");
    press("Iniciar / retomar GPS");
    expect(props.onTrack).toHaveBeenCalledWith(route);
    const d = route.deliveries[0];
    press("Navegar · " + d.clients.name);
    expect(props.onDirections).toHaveBeenCalledWith(route, d);
    press("Pausar GPS");
    expect(props.onPause).toHaveBeenCalledOnce();
    press("Sair");
    expect(props.onLogout).toHaveBeenCalledOnce();
  });
});
function WorkspaceRender() {
  hooks.cursor = 0;
  hooks.effectCursor = 0;
  return Workspace(props);
}
