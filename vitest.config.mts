import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Resolves the "@/…" import alias from tsconfig.json.
    tsconfigPaths: true,
  },
  test: {
    // Domain logic runs in plain Node. Component tests opt into a browser-like
    // environment per file with a `// @vitest-environment jsdom` comment.
    environment: "node",
    // Worker threads start noticeably faster than forked processes on Windows.
    pool: "threads",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
