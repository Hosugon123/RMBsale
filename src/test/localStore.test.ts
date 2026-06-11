import { describe, expect, it } from "vitest";
import { d } from "../lib/utils";
import {
  addAccount,
  addChannel,
  addCustomer,
  addHolder,
  renameChannel,
  renameCustomer,
  deleteChannel,
  deleteCustomer,
  addPurchase,
  addSale,
  updateSaleProfit,
  addSettlement,
  payPurchase,
  purchasePayableTwd,
  addTransfer,
  accountFifoRmb,
  reconcileLocalRmbLotInventory,
  previewSaleProfit,
  adjustAccount,
  createSeedState,
  createUser,
  getSessionUser,
  updateUser,
  deleteAccount,
  ledgerWithBalances,
  profitLedger,
  sortedCashLedgerWithBalances,
  sortedProfitLedgerWithBalances,
  ledgerOperationGroupKey,
  sortedPayableLedgerWithBalances,
  sortedReceivableLedgerWithBalances,
  renameAccount,
  renameHolder,
  reverseOperation,
  totals
} from "../lib/localStore";

describe("local demo store", () => {
  it("manages purchase channels", () => {
    const state = createSeedState();
    const created = addChannel(state, { name: "臨時換匯" });
    expect(created.channels.find((channel) => channel.name === "臨時換匯")?.isActive).toBe(true);

    const renamed = renameChannel(created, { channelId: created.channels.find((c) => c.name === "臨時換匯")!.id, name: "臨時渠道" });
    expect(renamed.channels.find((channel) => channel.name === "臨時渠道")?.isActive).toBe(true);

    const channelId = renamed.channels.find((channel) => channel.name === "臨時渠道")!.id;
    const removed = deleteChannel(renamed, { channelId });
    expect(removed.channels.find((channel) => channel.id === channelId)?.isActive).toBe(false);

    const readded = addChannel(removed, { name: "臨時渠道" });
    expect(readded.channels.find((channel) => channel.name === "臨時渠道")?.isActive).toBe(true);
  });

  it("removes preset channel without affecting purchases", () => {
    const state = createSeedState();
    const channel = state.channels.find((item) => item.name === "交易所 A")!;
    const next = deleteChannel(state, { channelId: channel.id });
    expect(next.channels.find((item) => item.id === channel.id)?.isActive).toBe(false);
    expect(next.purchases.some((purchase) => purchase.channelId === channel.id)).toBe(true);
  });

  it("manages sale customers", () => {
    const state = createSeedState();
    const created = addCustomer(state, { name: "新客戶甲" });
    const customer = created.customers.find((item) => item.name === "新客戶甲");
    expect(customer?.isActive).toBe(true);

    const renamed = renameCustomer(created, { customerId: customer!.id, name: "熟客甲" });
    expect(renamed.customers.find((item) => item.id === customer!.id)?.name).toBe("熟客甲");

    const removed = deleteCustomer(renamed, { customerId: customer!.id });
    expect(removed.customers.find((item) => item.id === customer!.id)?.isActive).toBe(false);

    const readded = addCustomer(removed, { name: "熟客甲" });
    expect(readded.customers.find((item) => item.name === "熟客甲")?.isActive).toBe(true);
  });

  it("removes preset customer without affecting sales or receivables", () => {
    const state = createSeedState();
    const customer = state.customers.find((item) => item.name === "阿明")!;
    const next = deleteCustomer(state, { customerId: customer.id });
    expect(next.customers.find((item) => item.id === customer.id)?.isActive).toBe(false);
    expect(next.sales.some((sale) => sale.customerId === customer.id)).toBe(true);
    expect(next.customers.find((item) => item.id === customer.id)?.receivableTwd).toBe("15800.05");
  });

  it("previews sale profit with fifo cost", () => {
    const state = createSeedState();
    const preview = previewSaleProfit(state, {
      rmbAccountId: 4,
      rmbAmount: "1000",
      exchangeRate: "4.5"
    });
    expect(preview).toMatchObject({ twdAmount: "4500.00", profitTwd: "80.00", profitError: null });
  });

  it("moves FIFO lots on RMB internal transfer", () => {
    const state = createSeedState();
    const fromFifoBefore = accountFifoRmb(state, 4);
    addTransfer(state, { fromAccountId: 4, toAccountId: 2, amount: "1000" });
    expect(accountFifoRmb(state, 4)).toBe(d(fromFifoBefore).sub(1000).toDecimalPlaces(2).toFixed(2));
    expect(accountFifoRmb(state, 2)).toBe("39000.00");
  });

  it("reconciles fifo inventory when account balance exceeds lots", () => {
    const state = createSeedState();
    const account = state.accounts.find((item) => item.id === 4)!;
    account.balance = "20000.00";
    state.rmbLots = state.rmbLots.filter((lot) => lot.accountId !== 4);
    reconcileLocalRmbLotInventory(state);
    expect(accountFifoRmb(state, 4)).toBe("20000.00");
    const preview = previewSaleProfit(state, {
      rmbAccountId: 4,
      rmbAmount: "3000",
      exchangeRate: "4.73"
    });
    expect(preview?.profitWarning).toBeNull();
  });

  it("creates a sale, reduces RMB, and increases receivable", () => {
    const state = createSeedState();
    const beforeReceivable = Number(state.customers[0].receivableTwd);
    const next = addSale(state, {
      customerName: "阿明",
      rmbAccountId: 4,
      rmbAmount: "1000",
      exchangeRate: "4.5"
    });
    const account = next.accounts.find((item) => item.id === 4);
    const customer = next.customers.find((item) => item.name === "阿明");
    expect(account?.balance).toBe("57500.00");
    expect(customer?.receivableTwd).toBe((beforeReceivable + 4500).toFixed(2));
    expect(next.sales[0].profitTwd).toBe("80.00");
    expect(next.sales[0].operatorName).toBe("系統管理員");
    expect(next.ledger.find((entry) => entry.entryType === "售出")?.operatorName).toBe("系統管理員");
    expect(next.ledger.find((entry) => entry.entryType === "利潤" && entry.relatedId === next.sales[0].id)).toMatchObject({
      direction: "in",
      currency: "TWD",
      amount: "80.00"
    });
  });

  it("updates sale profit and keeps the profit ledger in sync", () => {
    const state = createSeedState();
    const saleId = state.sales[0].id;
    const next = updateSaleProfit(state, { saleId, profitTwd: "888.88" });
    const profitEntry = next.ledger.find((entry) => entry.entryType === "利潤" && entry.relatedId === saleId);

    expect(next.sales[0].profitTwd).toBe("888.88");
    expect(profitEntry).toMatchObject({
      direction: "in",
      currency: "TWD",
      amount: "888.88"
    });
    expect(sortedProfitLedgerWithBalances(next)[0]).toMatchObject({
      entryType: "利潤",
      amount: "888.88"
    });
  });

  it("removes the profit ledger entry when sale profit is set to zero", () => {
    const state = createSeedState();
    const saleId = state.sales[0].id;
    const next = updateSaleProfit(state, { saleId, profitTwd: "0" });

    expect(next.sales[0].profitTwd).toBe("0.00");
    expect(next.ledger.some((entry) => entry.entryType === "利潤" && entry.relatedId === saleId)).toBe(false);
  });

  it("shows profit balance on ledger rows", () => {
    const state = createSeedState();
    const rows = ledgerWithBalances(state);
    const profitRow = rows.find((entry) => entry.entryType === "利潤");
    expect(profitRow).toMatchObject({
      subjectLabel: "累計利潤",
      balanceBefore: "0.00",
      balanceAfter: "330.05",
      balanceCurrency: "TWD"
    });
  });

  it("lists sale profit entries in sorted profit ledger", () => {
    const state = createSeedState();
    const rows = sortedProfitLedgerWithBalances(state);
    expect(rows.some((entry) => entry.entryType === "利潤" && entry.direction === "in")).toBe(true);
  });

  it("includes account and customer rows for settlement in receivable ledger", () => {
    const state = createSeedState();
    const customer = state.customers.find((item) => item.name === "阿明")!;
    addSettlement(state, { customerId: customer.id, accountId: 1, amountTwd: "1000" });
    const rows = sortedReceivableLedgerWithBalances(state).filter((entry) => entry.entryType === "收帳");
    expect(rows.some((entry) => entry.customerId === customer.id && entry.direction === "out")).toBe(true);
    expect(rows.some((entry) => entry.accountId === 1 && entry.direction === "in")).toBe(true);
  });

  it("records settlement in receivable ledger with balance context", () => {
    const state = createSeedState();
    const customer = state.customers.find((item) => item.name === "阿明")!;
    const account = state.accounts.find((item) => item.id === 1)!;
    const beforeReceivable = customer.receivableTwd;
    const beforeBalance = account.balance;

    addSettlement(state, { customerId: customer.id, accountId: account.id, amountTwd: "10000" });

    expect(customer.receivableTwd).toBe((Number(beforeReceivable) - 10000).toFixed(2));
    expect(account.balance).toBe((Number(beforeBalance) + 10000).toFixed(2));
    expect(
      state.ledger.some((entry) => entry.entryType === "收帳" && entry.customerId === customer.id && entry.direction === "out")
    ).toBe(true);
    expect(state.ledger.some((entry) => entry.entryType === "收帳" && entry.accountId === account.id && entry.direction === "in")).toBe(
      true
    );

    const receivableRow = sortedReceivableLedgerWithBalances(state).find(
      (entry) => entry.entryType === "收帳" && entry.customerId === customer.id
    );
    expect(receivableRow).toMatchObject({
      subjectLabel: "阿明",
      balanceCurrency: "TWD"
    });
    expect(receivableRow?.balanceAfter).toBe(customer.receivableTwd);
  });

  it("supports partial purchase payments", () => {
    const state = createSeedState();
    const purchase = {
      id: 99,
      channelId: 1,
      channelName: "測試渠道",
      depositAccountId: 2,
      rmbAmount: "1000.00",
      exchangeRate: "4.500000",
      twdCost: "4500.00",
      paidTwd: "0.00",
      paymentStatus: "unpaid" as const,
      operatorName: "admin",
      createdAt: new Date().toISOString()
    };
    state.purchases.unshift(purchase);

    payPurchase(state, { purchaseId: purchase.id, accountId: 1, amountTwd: "2000" });
    expect(state.purchases[0]).toMatchObject({ paidTwd: "2000.00", paymentStatus: "partial" });
    expect(purchasePayableTwd(state.purchases[0])).toBe("2500.00");

    payPurchase(state, { purchaseId: purchase.id, accountId: 1, amountTwd: "2500" });
    expect(state.purchases[0]).toMatchObject({ paidTwd: "4500.00", paymentStatus: "paid" });
    expect(purchasePayableTwd(state.purchases[0])).toBe("0.00");
  });

  it("rejects settlement above receivable balance", () => {
    const state = createSeedState();
    const customer = state.customers.find((item) => item.name === "阿明")!;
    expect(() =>
      addSettlement(state, { customerId: customer.id, accountId: 1, amountTwd: "999999" })
    ).toThrow("收款金額超過應收餘額");
  });

  it("groups ledger rows from the same sale operation", () => {
    const state = createSeedState();
    const saleId = state.sales[0].id;
    const keys = state.ledger
      .filter((entry) => entry.relatedTable === "sales" && entry.relatedId === saleId)
      .map((entry) => ledgerOperationGroupKey(entry));
    expect(new Set(keys)).toEqual(new Set([`sales:${saleId}`]));
    expect(keys.length).toBeGreaterThanOrEqual(2);
  });

  it("lists purchase payments in payable ledger", () => {
    const state = createSeedState();
    const rmbAccount = state.accounts.find((account) => account.currency === "RMB")!;

    addPurchase(state, {
      channelName: "測試渠道",
      depositAccountId: rmbAccount.id,
      rmbAmount: "1000",
      exchangeRate: "4.5",
      paymentStatus: "unpaid"
    });
    const purchase = state.purchases[0];
    payPurchase(state, { purchaseId: purchase.id, accountId: 1, amountTwd: "1000" });

    const rows = sortedPayableLedgerWithBalances(state);
    expect(rows.some((entry) => entry.entryType === "應付" && entry.direction === "in")).toBe(true);
    expect(rows.some((entry) => entry.entryType === "應付付款" && entry.direction === "out")).toBe(true);
  });

  it("records payable increase on purchase and offsets when paid immediately", () => {
    const state = createSeedState();
    const twdAccount = state.accounts.find((account) => account.currency === "TWD")!;
    const rmbAccount = state.accounts.find((account) => account.currency === "RMB")!;

    addPurchase(state, {
      channelName: "即付渠道",
      depositAccountId: rmbAccount.id,
      paymentAccountId: twdAccount.id,
      rmbAmount: "1000",
      exchangeRate: "4.5",
      paymentStatus: "paid"
    });

    const purchase = state.purchases[0];
    const rows = sortedPayableLedgerWithBalances(state).filter((entry) => entry.relatedId === purchase.id);
    const channelRows = rows.filter((entry) => entry.channelId && !entry.accountId);

    expect(channelRows.some((entry) => entry.entryType === "應付" && entry.direction === "in")).toBe(true);
    expect(channelRows.some((entry) => entry.entryType === "應付付款" && entry.direction === "out")).toBe(true);
    expect(channelRows.find((entry) => entry.entryType === "應付")?.subjectLabel).toBe("即付渠道");
    expect(new Set(channelRows.map((entry) => ledgerOperationGroupKey(entry)))).toEqual(
      new Set([`purchases:${purchase.id}`])
    );
  });

  it("records payable increase when purchase is unpaid", () => {
    const state = createSeedState();
    const rmbAccount = state.accounts.find((account) => account.currency === "RMB")!;

    addPurchase(state, {
      channelName: "賒帳渠道",
      depositAccountId: rmbAccount.id,
      rmbAmount: "2000",
      exchangeRate: "4.5",
      paymentStatus: "unpaid"
    });

    const purchase = state.purchases[0];
    const increase = sortedPayableLedgerWithBalances(state).find(
      (entry) => entry.entryType === "應付" && entry.direction === "in" && entry.relatedId === purchase.id
    );

    expect(increase).toMatchObject({
      amount: "9000.00",
      subjectLabel: "賒帳渠道"
    });
    expect(
      sortedPayableLedgerWithBalances(state).some(
        (entry) => entry.entryType === "應付付款" && entry.relatedId === purchase.id && !entry.accountId
      )
    ).toBe(false);
  });

  it("excludes profit and sale entries from receivable ledger", () => {
    const state = createSeedState();
    const rows = sortedReceivableLedgerWithBalances(state);
    expect(rows.some((entry) => entry.entryType === "利潤")).toBe(false);
    expect(rows.some((entry) => entry.entryType === "售出")).toBe(false);
    expect(rows.some((entry) => entry.entryType === "應收")).toBe(true);
  });

  it("excludes profit entries from cash ledger", () => {
    const state = createSeedState();
    const cashRows = sortedCashLedgerWithBalances(state);
    const profitRows = sortedProfitLedgerWithBalances(state);
    expect(cashRows.some((entry) => entry.entryType === "利潤")).toBe(false);
    expect(profitRows.some((entry) => entry.entryType === "利潤")).toBe(true);
  });

  it("includes receivable and payable entries in cash ledger for full detail", () => {
    const state = createSeedState();
    const rmbAccount = state.accounts.find((account) => account.currency === "RMB")!;

    expect(sortedCashLedgerWithBalances(state).some((entry) => entry.entryType === "應收")).toBe(true);

    addPurchase(state, {
      channelName: "流水詳細渠道",
      depositAccountId: rmbAccount.id,
      rmbAmount: "100",
      exchangeRate: "4.5",
      paymentStatus: "unpaid"
    });
    expect(sortedCashLedgerWithBalances(state).some((entry) => entry.entryType === "應付")).toBe(true);
  });

  it("allocates one sale across multiple RMB lots by FIFO", () => {
    const state = createSeedState();
    state.accounts.find((account) => account.id === 2)!.balance = "100000.00";
    state.rmbLots = [
      { id: 1, purchaseId: 1, accountId: 2, channelName: "第一批", originalRmb: "80000.00", remainingRmb: "80000.00", unitCostTwd: "4.630000", exchangeRate: "4.630000", createdAt: "2026-06-01T00:00:00.000Z" },
      { id: 2, purchaseId: 2, accountId: 2, channelName: "第二批", originalRmb: "20000.00", remainingRmb: "20000.00", unitCostTwd: "4.650000", exchangeRate: "4.650000", createdAt: "2026-06-02T00:00:00.000Z" }
    ];
    state.sales = [];
    state.saleAllocations = [];

    const next = addSale(state, {
      customerName: "測試客戶",
      rmbAccountId: 2,
      rmbAmount: "90000",
      exchangeRate: "4.7"
    });

    expect(next.rmbLots[0].remainingRmb).toBe("0.00");
    expect(next.rmbLots[1].remainingRmb).toBe("10000.00");
    expect(next.sales[0].costTwd).toBe("416900.00");
    expect(next.sales[0].profitTwd).toBe("6100.00");
    expect(next.saleAllocations).toHaveLength(2);
    expect(next.saleAllocations[0]).toMatchObject({ channelName: "第一批", allocatedRmb: "80000.00", costTwd: "370400.00" });
    expect(next.saleAllocations[1]).toMatchObject({ channelName: "第二批", allocatedRmb: "10000.00", costTwd: "46500.00" });
  });

  it("creates users with checkbox permissions", () => {
    const state = createSeedState();
    createUser(state, {
      username: "operator1",
      password: "1234",
      displayName: "操作員甲",
      permissions: ["dashboard", "sale", "ledger"]
    });
    expect(state.users).toHaveLength(2);
    const created = state.users.find((user) => user.username === "operator1");
    expect(created).toMatchObject({
      displayName: "操作員甲",
      role: "operator",
      isActive: true,
      permissions: ["dashboard", "sale", "ledger"]
    });
    expect(getSessionUser(state)?.username).toBe("ds001");
  });

  it("updates existing user profile and keeps password when omitted", () => {
    const state = createSeedState();
    createUser(state, {
      username: "operator1",
      password: "1234",
      displayName: "操作員甲",
      permissions: ["dashboard", "sale"]
    });
    const user = state.users.find((item) => item.username === "operator1")!;
    updateUser(state, user.id, {
      username: "operator01",
      displayName: "操作員小甲",
      permissions: ["dashboard", "sale", "ledger"]
    });
    expect(user.username).toBe("operator01");
    expect(user.displayName).toBe("操作員小甲");
    expect(user.password).toBe("1234");
    expect(user.permissions).toEqual(["dashboard", "sale", "ledger"]);

    updateUser(state, user.id, {
      username: "operator01",
      password: "5678",
      displayName: "操作員小甲",
      permissions: ["dashboard", "sale", "ledger"]
    });
    expect(user.password).toBe("5678");
  });

  it("supports account deposit and withdrawal with ledger entries", () => {
    const state = createSeedState();

    adjustAccount(state, { accountId: 1, direction: "in", amount: "5000", note: "測試入金" });
    expect(state.accounts.find((account) => account.id === 1)?.balance).toBe("125000.00");
    expect(state.ledger[0]).toMatchObject({ entryType: "入金", accountId: 1, direction: "in", currency: "TWD", amount: "5000.00", operatorName: "系統管理員" });

    adjustAccount(state, { accountId: 1, direction: "out", amount: "3000", note: "測試出金" });
    expect(state.accounts.find((account) => account.id === 1)?.balance).toBe("122000.00");
    expect(state.ledger[0]).toMatchObject({ entryType: "撤資", accountId: 1, direction: "out", currency: "TWD", amount: "3000.00" });
  });

  it("voids TWD deposit via reversal without deleting ledger history", () => {
    const state = createSeedState();
    adjustAccount(state, { accountId: 1, direction: "in", amount: "5000" });
    const depositEntry = state.ledger.find((entry) => entry.entryType === "入金" && entry.accountId === 1 && !entry.isReversal);
    expect(depositEntry).toBeTruthy();

    reverseOperation(state, { entityType: "adjustment", entityId: depositEntry!.id });
    expect(state.accounts.find((account) => account.id === 1)?.balance).toBe("120000.00");
    expect(state.ledger.some((entry) => entry.isReversal && entry.reversesLedgerId === depositEntry!.id)).toBe(true);
  });

  it("links RMB deposit to FIFO lots and withdraws by FIFO", () => {
    const state = createSeedState();
    const beforeLots = state.rmbLots.filter((lot) => lot.accountId === 2).reduce((sum, lot) => sum.add(lot.remainingRmb), d(0));

    adjustAccount(state, { accountId: 2, direction: "in", amount: "10000", exchangeRate: "4.50", note: "補庫" });
    expect(state.accounts.find((account) => account.id === 2)?.balance).toBe("48000.00");
    const depositLot = state.rmbLots.find((lot) => lot.channelName === "入金" && lot.accountId === 2);
    expect(depositLot).toMatchObject({ originalRmb: "10000.00", remainingRmb: "10000.00", unitCostTwd: "4.500000" });
    const depositPurchase = state.purchases.find((purchase) => purchase.channelName === "入金" && purchase.depositAccountId === 2);
    expect(depositPurchase).toBeTruthy();
    expect(purchasePayableTwd(depositPurchase!)).toBe("0.00");
    expect(state.ledger.some((entry) => entry.entryType === "應付" && entry.relatedId === depositPurchase!.id)).toBe(false);

    adjustAccount(state, { accountId: 2, direction: "out", amount: "5000", exchangeRate: "4.55" });
    expect(state.accounts.find((account) => account.id === 2)?.balance).toBe("43000.00");
    const afterLots = state.rmbLots.filter((lot) => lot.accountId === 2).reduce((sum, lot) => sum.add(lot.remainingRmb), d(0));
    expect(afterLots.toFixed(2)).toBe(beforeLots.add(10000).sub(5000).toFixed(2));
  });

  it("adds a new holder", () => {
    const state = createSeedState();
    const next = addHolder(state, { name: "新夥伴" });

    expect(next.holders.find((holder) => holder.name === "新夥伴")).toMatchObject({
      name: "新夥伴",
      isActive: true
    });
  });

  it("renames holder and account", () => {
    const state = createSeedState();
    renameHolder(state, { holderId: 1, name: "小許哥" });
    renameAccount(state, { accountId: 1, name: "現金台幣" });

    expect(state.holders.find((holder) => holder.id === 1)?.name).toBe("小許哥");
    expect(state.accounts.find((account) => account.id === 1)).toMatchObject({
      name: "現金台幣",
      holderName: "小許哥"
    });
  });

  it("blocks account delete when balance remains", () => {
    const state = createSeedState();
    expect(() => deleteAccount(state, { accountId: 1 })).toThrow("帳戶仍有餘額");
  });

  it("adds a new account under a holder", () => {
    const state = createSeedState();
    const next = addAccount(state, { holderId: 1, name: "備用台幣", currency: "TWD" });

    expect(next.accounts.find((account) => account.name === "備用台幣")).toMatchObject({
      holderId: 1,
      holderName: "小許",
      currency: "TWD",
      balance: "0.00",
      isActive: true
    });
  });

  it("derives account and receivable balances around each ledger entry", () => {
    const state = createSeedState();
    const rows = ledgerWithBalances(state);
    const saleEntry = rows.find((entry) => entry.entryType === "售出");
    const receivableEntry = rows.find((entry) => entry.entryType === "應收");

    expect(saleEntry).toMatchObject({
      subjectLabel: "團隊帳戶",
      balanceBefore: "62000.00",
      balanceAfter: "58500.00",
      balanceCurrency: "RMB"
    });
    expect(receivableEntry).toMatchObject({
      subjectLabel: "阿明",
      balanceBefore: "0.00",
      balanceAfter: "15800.05",
      balanceCurrency: "TWD"
    });
  });

  it("tracks profit withdrawals separately from capital withdrawals", () => {
    const state = createSeedState();

    expect(totals(state).profitEarned).toBe("330.05");
    expect(totals(state).profit).toBe("330.05");
    adjustAccount(state, { accountId: 1, direction: "out", amount: "100", withdrawType: "profit", note: "owner payout" });

    expect(state.accounts.find((account) => account.id === 1)?.balance).toBe("119900.00");
    expect(totals(state).twd).toBe("379900.00");
    expect(totals(state).profitEarned).toBe("330.05");
    expect(totals(state).profit).toBe("230.05");
    expect(state.ledger[0]).toMatchObject({ entryType: "分潤", relatedTable: "profit", accountId: 1, direction: "out", currency: "TWD", amount: "100.00" });
    expect(profitLedger(state).map((entry) => entry.direction)).toEqual(["out", "in"]);
  });
});
