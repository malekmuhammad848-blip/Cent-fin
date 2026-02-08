import path from "path";
import { fileURLToPath } from "url";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  root: 'www',          // ← هذا هو التعديل الأساسي
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: 'dist',      // هذا المجلد سينشأ بعد البناء
    emptyOutDir: true,
  },
});
