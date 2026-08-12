import { rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const defaultTargets = [
  "client/dist",
  "server/dist",
  "shared/dist",
  "release",
  "client/vite.config.js",
  "client/vite.config.d.ts",
  "client/tsconfig.node.tsbuildinfo"
];
const serverOnlyTargets = ["server/dist", "shared/dist"];
const argumentsList = process.argv.slice(2);

if (argumentsList.length > 1 || (argumentsList[0] && argumentsList[0] !== "--server-only")) {
  throw new Error("Usage: node scripts/clean.mjs [--server-only]");
}

const targets = argumentsList[0] === "--server-only" ? serverOnlyTargets : defaultTargets;

await Promise.all(
  targets.map((target) =>
    rm(path.join(root, target), {
      force: true,
      maxRetries: 5,
      recursive: true,
      retryDelay: 200
    })
  )
);
