// scripts/build-server-deploy.mjs
// 组装并打包 Windows 服务器部署包 XiaoELong-server-<version>.zip。
// 依赖：先构建 shared 与 server（根目录 npm run server:deploy 会自动处理）。
// 产物 zip 写入 deploy/ 下，已被 .gitignore 忽略；部署内容全部在临时目录组装，不污染 git 工作区。

import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptPath), "..");

async function assertBuilt(filePath, hint) {
  let isFile = false;
  try {
    isFile = (await stat(filePath)).isFile();
  } catch {
    isFile = false;
  }
  if (!isFile) {
    throw new Error(`${hint}缺失：${filePath}。请先构建 shared 与 server。`);
  }
}

const version = JSON.parse(
  await readFile(path.join(repositoryRoot, "package.json"), "utf8")
).version;
const zipName = `XiaoELong-server-${version}.zip`;
const zipPath = path.join(repositoryRoot, "deploy", zipName);

// 前置检查：server 与 shared 的构建产物必须存在
await assertBuilt(path.join(repositoryRoot, "server", "dist", "index.js"), "server 构建产物");
await assertBuilt(path.join(repositoryRoot, "shared", "dist", "index.js"), "shared 构建产物");

// 在临时目录组装部署包，避免污染 git 工作区
const staging = await mkdtemp(path.join(os.tmpdir(), "xiaoelong-server-deploy-"));
try {
  // 1. 拷贝 git 中维护的发布配置：README、部署包根 package.json/lock、server 发布专用文件
  await cp(path.join(repositoryRoot, "deploy", "server"), staging, {
    recursive: true,
    filter: (src) => !path.basename(src).startsWith(".DS_Store")
  });

  // 2. 拷贝 server 构建产物与依赖清单（版本号随源码自动同步）
  await cp(
    path.join(repositoryRoot, "server", "dist"),
    path.join(staging, "server", "dist"),
    { recursive: true }
  );
  await cp(
    path.join(repositoryRoot, "server", "package.json"),
    path.join(staging, "server", "package.json")
  );

  // 3. 拷贝 shared 构建产物与依赖清单
  await cp(
    path.join(repositoryRoot, "shared", "dist"),
    path.join(staging, "shared", "dist"),
    { recursive: true }
  );
  await cp(
    path.join(repositoryRoot, "shared", "package.json"),
    path.join(staging, "shared", "package.json")
  );

  // 4. 保证 updates 目录存在（客户端更新文件静态目录），用占位文件确保被 zip 收录
  await mkdir(path.join(staging, "updates"), { recursive: true });
  await writeFile(path.join(staging, "updates", ".gitkeep"), "");

  // 5. 打包 zip（zip 根即部署包根，解压后应看到 package.json/server/shared/updates）
  await rm(zipPath, { force: true });
  execFileSync("zip", ["-r", "-y", "-q", zipPath, "."], {
    cwd: staging,
    stdio: "inherit"
  });
} finally {
  await rm(staging, { recursive: true, force: true });
}

console.log(`已生成服务器部署包：${zipPath}`);
