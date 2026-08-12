import { readdir, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const targets = [
  "client/dist",
  "server/dist",
  "shared/dist",
  "release",
  "client/vite.config.js",
  "client/vite.config.d.ts",
  "client/tsconfig.node.tsbuildinfo"
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

// 清理服务器部署包 zip（文件名带版本号，遍历 deploy/ 下所有 *.zip）
const deployDir = path.join(root, "deploy");
try {
  const entries = await readdir(deployDir);
  await Promise.all(
    entries
      .filter((name) => name.endsWith(".zip"))
      .map((name) =>
        rm(path.join(deployDir, name), {
          force: true,
          maxRetries: 5,
          recursive: true,
          retryDelay: 200
        })
      )
  );
} catch {
  // deploy/ 目录不存在时忽略
}
