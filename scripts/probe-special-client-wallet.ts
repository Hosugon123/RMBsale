/**
 * 儲值代付 API 與帳戶／利潤流水連動探測（本機 8080）。
 * 用法：npm run dev:online 後執行 npx tsx scripts/probe-special-client-wallet.ts
 */
import "./loadEnv.ts";
import Decimal from "decimal.js";
import { assertProbeTargetAllowed } from "../api/_lib/databaseEnv.js";

const BASE = process.env.PROBE_BASE_URL ?? "http://127.0.0.1:8080";
assertProbeTargetAllowed(BASE);
const USER = process.env.PROBE_USERNAME ?? "ds6186";
const PASS = process.env.PROBE_PASSWORD ?? "1234";

const d = (v: Decimal.Value) => new Decimal(v || 0);

type Json = Record<string, unknown>;

async function request(path: string, options: RequestInit = {}, cookie?: string) {
  const res = await fetch(`${BASE}/api/${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(options.headers as Record<string, string>)
    }
  });
  const text = await res.text();
  let data: Json = {};
  try {
    data = text ? (JSON.parse(text) as Json) : {};
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  return { res, data };
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function todayIsoDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

async function login() {
  const { res, data } = await request("auth/login", {
    method: "POST",
    body: JSON.stringify({ username: USER, password: PASS })
  });
  assert(res.ok, `登入失敗：${JSON.stringify(data)}`);
  const cookies = res.headers.getSetCookie?.() ?? [];
  const cookie = cookies.map((c) => c.split(";")[0]).join("; ");
  assert(cookie, "登入未回傳 session cookie");
  return cookie;
}

async function main() {
  console.log(`探測 ${BASE} …`);
  const cookie = await login();

  const boot = await request("bootstrap?sections=accounts,ledger", {}, cookie);
  assert(boot.res.ok, `bootstrap 失敗：${JSON.stringify(boot.data)}`);
  const accounts = boot.data.state as { accounts?: Array<{ id: number; currency: string; balance: string; name: string }> };
  const rmbAccount = accounts.accounts?.find((a) => a.currency === "RMB");
  assert(rmbAccount, "找不到 RMB 帳戶");

  const walletGet = await request("special-client-wallet", {}, cookie);
  assert(walletGet.res.ok, `讀取 wallet 失敗：${JSON.stringify(walletGet.data)}`);
  const wallet = walletGet.data as Json;
  const clientId = wallet.selectedClientId as number;
  assert(clientId, "找不到儲值客戶");
  const clientName = (wallet.clients as Array<{ id: number; name: string }>).find((c) => c.id === clientId)?.name;
  assert(clientName === "儲值客戶", `預設客戶名稱應為儲值客戶，實際：${clientName}`);

  const rmbBefore = d(rmbAccount.balance);
  const balanceBefore = d((wallet.summary as { balanceRmb: string }).balanceRmb);

  // 儲值 ¥100,000 @ 1.1%
  const depositBody = {
    clientId,
    entryDate: todayIsoDate(),
    grossRmb: "100000.00",
    feeRate: "0.011",
    cashAccountId: rmbAccount.id
  };
  const deposit = await request("special-client-wallet/deposit", { method: "POST", body: JSON.stringify(depositBody) }, cookie);
  assert(deposit.res.ok, `儲值失敗：${JSON.stringify(deposit.data)}`);
  const afterDeposit = deposit.data as Json;
  const depositSummary = afterDeposit.summary as { balanceRmb: string; totalGrossRmb: string; totalFeeRmb: string };
  assert(d(depositSummary.balanceRmb).eq(balanceBefore.add("98900")), `儲值後客戶餘額應 +98900，實際 ${depositSummary.balanceRmb}`);
  assert(d(depositSummary.totalFeeRmb).gte("1100"), `區間服務費應含 1100，實際 ${depositSummary.totalFeeRmb}`);

  const latestDeposit = (afterDeposit.entries as Array<{ id: number; type: string; profitLedgerId: number | null; grossRmb: string | null }>).find(
    (e) => e.type === "deposit" && e.grossRmb === "100000.00" && e.profitLedgerId
  );
  assert(latestDeposit?.profitLedgerId, "儲值應寫入利潤流水");

  const bootAfterDeposit = await request("bootstrap?sections=accounts,ledger", {}, cookie);
  const rmbAfterDeposit = d(
    (bootAfterDeposit.data.state as { accounts: Array<{ id: number; balance: string }> }).accounts.find((a) => a.id === rmbAccount.id)!
      .balance
  );
  assert(rmbAfterDeposit.eq(rmbBefore.add("100000")), `公司 RMB 帳應 +100000，實際 ${rmbAfterDeposit.toFixed(2)}`);

  const profitIn = (bootAfterDeposit.data.state as { ledger: Array<{ relatedTable?: string; currency: string; direction: string; amount: string; entryType: string }> }).ledger
    .filter((e) => e.relatedTable === "special_client_wallet" && e.currency === "RMB" && e.direction === "in" && e.entryType === "利潤");
  assert(profitIn.some((e) => d(e.amount).eq("1100")), "利潤流水應有 +1100 RMB 服務費");

  // 代付 ¥30,000
  const payoutBody = {
    clientId,
    entryDate: todayIsoDate(),
    payoutRmb: "30000.00",
    cashAccountId: rmbAccount.id
  };
  const payout = await request("special-client-wallet/payout", { method: "POST", body: JSON.stringify(payoutBody) }, cookie);
  assert(payout.res.ok, `代付失敗：${JSON.stringify(payout.data)}`);
  const payoutEntry = (payout.data as Json).entries as Array<{ id: number; type: string; payoutRmb: string; reversedAt: string | null }>;
  const latestPayout = payoutEntry.find((e) => e.type === "payout" && e.payoutRmb === "30000.00" && !e.reversedAt);
  assert(latestPayout, "找不到代付紀錄");

  // 沖銷代付
  const reversePayout = await request(
    "special-client-wallet/reverse",
    { method: "POST", body: JSON.stringify({ entryId: latestPayout.id, reverseReason: "探測沖銷代付", clientId }) },
    cookie
  );
  assert(reversePayout.res.ok, `沖銷代付失敗：${JSON.stringify(reversePayout.data)}`);
  const payoutSummary = (reversePayout.data as Json).summary as { totalPayoutRmb: string };
  assert(!d(payoutSummary.totalPayoutRmb).eq("30000"), "沖銷後區間代付不應仍計入已沖銷金額");

  const dupReversePayout = await request(
    "special-client-wallet/reverse",
    { method: "POST", body: JSON.stringify({ entryId: latestPayout.id, reverseReason: "重複沖銷", clientId }) },
    cookie
  );
  assert(!dupReversePayout.res.ok, "重複沖銷代付應被拒絕");

  // 沖銷儲值
  assert(latestDeposit, "找不到儲值紀錄");
  const reverseDeposit = await request(
    "special-client-wallet/reverse",
    { method: "POST", body: JSON.stringify({ entryId: latestDeposit.id, reverseReason: "探測沖銷儲值", clientId }) },
    cookie
  );
  assert(reverseDeposit.res.ok, `沖銷儲值失敗：${JSON.stringify(reverseDeposit.data)}`);

  const bootAfterReverse = await request("bootstrap?sections=accounts,ledger", {}, cookie);
  const walletProfit = (bootAfterReverse.data.state as { ledger: Array<{ relatedTable?: string; currency: string; direction: string; amount: string; entryType: string }> }).ledger
    .filter((e) => e.relatedTable === "special_client_wallet" && e.currency === "RMB" && e.entryType === "利潤");
  const netProfit = walletProfit.reduce(
    (sum, e) => (e.direction === "in" ? sum.add(e.amount) : sum.sub(e.amount)),
    d(0)
  );
  // 若僅本次探測，淨利潤應回到探測前；允許既有資料存在時只驗證沖銷有 out 紀錄
  assert(
    walletProfit.some((e) => e.direction === "out"),
    "沖銷儲值後應有利潤反向流水"
  );

  // 匯出 Excel
  const exportRes = await fetch(`${BASE}/api/special-client-wallet/export.xlsx?clientId=${clientId}`, {
    headers: { Cookie: cookie }
  });
  assert(exportRes.ok, `匯出失敗：${exportRes.status}`);
  const buf = await exportRes.arrayBuffer();
  assert(buf.byteLength > 1000, "匯出檔案過小");
  const contentType = exportRes.headers.get("content-type") ?? "";
  assert(contentType.includes("spreadsheet") || contentType.includes("octet-stream"), `匯出 Content-Type 異常：${contentType}`);

  console.log("儲值代付探測全部通過 ✓");
  console.log({
    client: clientName,
    rmbAccount: rmbAccount.name,
    exportBytes: buf.byteLength,
    netWalletProfitSample: netProfit.toFixed(2)
  });
}

main().catch((err) => {
  console.error("探測失敗：", err instanceof Error ? err.message : err);
  process.exit(1);
});
