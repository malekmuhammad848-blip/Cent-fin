import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  root: "www", // جذر المشروع الآن هو www
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "www/src"),
    },
  },
  css: {
    postcss: "./www/postcss.config.mjs",
  },
  build: {
    outDir: "www/dist", // سيخرج البناء هنا
    emptyOutDir: true,
  },
});
