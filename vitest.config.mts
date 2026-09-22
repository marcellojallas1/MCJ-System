import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    exclude: ["**/node_modules/**", "**/.worktrees/**", "**/dist/**", "**/.next/**"],
    // Os arquivos compartilham um único banco local e alguns alteram estado
    // global (política de recomendação vigente) — rodar em série.
    fileParallelism: false,
  },
});
