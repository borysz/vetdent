import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

/**
 * Integration tests run against the real Supabase development project named
 * in `.env.local`. They create their own throw-away users and organizations
 * and delete them afterwards. Run with `npm run test:integration`.
 */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    pool: "threads",
    include: ["tests/integration/**/*.test.ts"],
    env: loadEnv("development", process.cwd(), ""),
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
