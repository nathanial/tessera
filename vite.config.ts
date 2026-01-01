import { defineConfig } from "vite";

export default defineConfig({
  root: "dev",
  base: "/tessera/",
  server: {
    open: true,
  },
  build: {
    outDir: "../dist-demo",
    emptyOutDir: true,
  },
});
