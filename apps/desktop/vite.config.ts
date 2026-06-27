import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  root: "src/renderer",
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../../dist/renderer",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "src/renderer/index.html"),
        manual: path.resolve(__dirname, "src/renderer/manual.html"),
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/renderer")
    }
  }
});
