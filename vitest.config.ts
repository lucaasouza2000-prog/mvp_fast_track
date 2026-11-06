import { defineConfig } from "vitest/config";
import { createRequire } from "node:module";
const requireFromWeb = createRequire(
  new URL("./apps/web/package.json", import.meta.url),
);
export default defineConfig({
  resolve: { alias: { "next/server": requireFromWeb.resolve("next/server") } },
  test: {
    include: [
      "packages/core/tests/**/*.test.ts",
      "tests/server/**/*.test.ts",
      "tests/mobile/**/*.test.ts",
    ],
  },
});
