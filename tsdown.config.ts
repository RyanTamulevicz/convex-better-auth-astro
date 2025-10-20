import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  outDir: "dist",
  sourcemap: true,
  clean: true,
  dts: true,
  minify: false,
  target: "es2022",
  external: [
    "astro",
    "better-auth",
    "better-auth/cookies",
    "convex",
    "@better-fetch/fetch",
  ],
});
