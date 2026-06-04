import "./loadEnv.ts";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const vercel = process.platform === "win32" ? "npx.cmd" : "npx";
const base = ["--yes", "vercel@latest"];

const adminUsername = process.env.ADMIN_USERNAME ?? "ds001";
const adminPassword = process.env.ADMIN_PASSWORD ?? "1234";
const jwtSecret =
  process.env.JWT_SECRET ?? randomBytes(48).toString("base64");

const vars: Array<{ name: string; value: string; sensitive: boolean }> = [
  { name: "JWT_SECRET", value: jwtSecret, sensitive: true },
  { name: "ADMIN_USERNAME", value: adminUsername, sensitive: false },
  { name: "ADMIN_PASSWORD", value: adminPassword, sensitive: true },
  { name: "OPERATOR_USERNAME", value: "operator", sensitive: false },
  { name: "OPERATOR_PASSWORD", value: "operator123", sensitive: true }
];

function vercelEnvAdd(name: string, env: string, value: string, sensitive: boolean) {
  const args = ["env", "add", name, env, "--yes", "--value", value];
  if (sensitive) args.push("--sensitive");
  else args.push("--no-sensitive");

  let result = spawnSync(vercel, [...base, ...args], {
    encoding: "utf8",
    cwd: root,
    shell: true
  });
  const out = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.status !== 0 && /already exists/i.test(out)) {
    console.log(`skip ${name} @ ${env} (exists)`);
    return;
  }
  if (result.status !== 0) {
    spawnSync(vercel, [...base, "env", "remove", name, env, "--yes"], { cwd: root, shell: true });
    result = spawnSync(vercel, [...base, ...args], { encoding: "utf8", cwd: root, shell: true });
  }
  if (result.status !== 0) {
    throw new Error(`vercel env add ${name}@${env} failed: ${out}`);
  }
  console.log(`OK ${name} @ ${env}`);
}

// 正式環境先上線；preview 需指定 git branch，略過以免卡住
for (const { name, value, sensitive } of vars) {
  try {
    vercelEnvAdd(name, "production", value, sensitive);
  } catch {
    if (name !== "JWT_SECRET") throw new Error(`Failed to set ${name} on production`);
    console.log("skip JWT_SECRET @ production (exists)");
  }
}

process.env.ADMIN_USERNAME = adminUsername;
process.env.ADMIN_PASSWORD = adminPassword;
process.env.OPERATOR_USERNAME = "operator";
process.env.OPERATOR_PASSWORD = "operator123";

const seed = spawnSync("npm.cmd", ["run", "db:seed"], { stdio: "inherit", cwd: root, shell: true });
if (seed.status !== 0) process.exit(seed.status ?? 1);

const creds = `登入資訊（請妥善保存，勿公開）

管理員：${adminUsername} / ${adminPassword}
操作員：operator / operator123
`;
writeFileSync(resolve(import.meta.dirname, ".setup-result.txt"), creds, "utf8");
console.log("帳密已寫入 scripts/.setup-result.txt");
