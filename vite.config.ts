import { defineConfig } from "vite";

export default defineConfig({
  root: "dev",
  base: "/tessera/",
  envDir: "..",  // Load .env files from project root
  server: {
    open: true,
  },
  build: {
    outDir: "../dist-demo",
    emptyOutDir: true,
  },
});
