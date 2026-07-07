import { rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const targets = [
  "client/dist",
  "server/dist",
  "shared/dist",
  "release",
  "client/vite.config.js",
  "client/vite.config.d.ts"
];

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
