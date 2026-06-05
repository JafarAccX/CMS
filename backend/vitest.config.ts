import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Run tests serially — each test touches the real DB and a real Socket.IO server
    pool: "threads",
    threads: { singleThread: true },
    // Give integration tests enough time (real DB + socket round-trips)
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
  resolve: {
    // Map the .js extensions the TS source uses back to .ts files so Vitest
    // can transpile them directly without a build step.
    extensionAlias: {
      ".js": [".ts", ".js"],
    },
  },
});
