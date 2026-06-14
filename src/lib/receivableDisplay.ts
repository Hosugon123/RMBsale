import Decimal from "decimal.js";
import { d, fmtMoney } from "./utils";

export type ReceivableStatusTone = "pending" | "settled" | "overpaid";

export type ReceivableDisplay = {
  balance: string;
  statusLabel: string;
  statusTone: ReceivableStatusTone;
  /** 待收或多付的顯示金額（皆為正數） */
  displayAmount: string;
};

export function receivableBalance(value: Decimal.Value) {
  return d(value);
}

export function describeReceivable(value: Decimal.Value): ReceivableDisplay {
  const balance = receivableBalance(value);
  if (balance.gt(0)) {
    return {
      balance: balance.toFixed(2),
      statusLabel: "待收",
      statusTone: "pending",
      displayAmount: balance.toFixed(2)
    };
  }
  if (balance.lt(0)) {
    return {
      balance: balance.toFixed(2),
      statusLabel: "多付",
      statusTone: "overpaid",
      displayAmount: balance.abs().toFixed(2)
    };
  }
  return {
    balance: "0.00",
    statusLabel: "已結清",
    statusTone: "settled",
    displayAmount: "0.00"
  };
}

export function fmtReceivableBalance(value: Decimal.Value) {
  const info = describeReceivable(value);
  if (info.statusTone === "overpaid") {
    return `多付 ${fmtMoney(info.displayAmount)}`;
  }
  if (info.statusTone === "settled") {
    return fmtMoney(0);
  }
  return fmtMoney(info.displayAmount);
}

export function sumPendingReceivable(customers: Array<{ receivableTwd: string }>) {
  return customers
    .reduce((sum, customer) => {
      const balance = receivableBalance(customer.receivableTwd);
      return balance.gt(0) ? sum.add(balance) : sum;
    }, d(0))
    .toFixed(2);
}

export function settlementReceivablePreview(receivableBefore: Decimal.Value, payment: Decimal.Value) {
  const before = receivableBalance(receivableBefore);
  const pay = receivableBalance(payment);
  const after = before.sub(pay);
  const overpayAmount = pay.gt(before) ? pay.sub(before) : d(0);
  return {
    before,
    payment: pay,
    after,
    overpayAmount,
    isOverpay: overpayAmount.gt(0)
  };
}

export function isReceivableFullySettled(value: Decimal.Value) {
  return receivableBalance(value).lte(0);
}
