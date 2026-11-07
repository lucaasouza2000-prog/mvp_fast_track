import { z } from "zod";
import { newRouteSchema, type Route } from "@fasttrack/core";
export type ManagedRoute = Route & { management_version?: number };
export const routeEditSchema = newRouteSchema.extend({
  deliveries: z
    .array(
      newRouteSchema.shape.deliveries.element.extend({ id: z.string().uuid() }),
    )
    .min(1)
    .max(100),
});
export const updateRouteRequest = z.object({
  id: z.string().uuid(),
  version: z.number().int().nonnegative(),
  data: routeEditSchema,
});
export const archiveRoutesRequest = z.object({
  routes: z
    .array(
      z.object({
        id: z.string().uuid(),
        version: z.number().int().nonnegative(),
      }),
    )
    .min(1)
    .max(100),
});
export function managementError(error: { code?: string; message?: string }) {
  if (error.code === "PGRST202" || error.code === "42883")
    return "Ative a atualização de gestão de rotas no Supabase antes de continuar.";
  if (error.code === "23505")
    return "Já existe uma rota ou carga com essa identificação.";
  if (error.code === "P0001")
    return error.message ?? "A operação foi recusada.";
  return "Não foi possível salvar a alteração. Atualize a lista e tente novamente.";
}
