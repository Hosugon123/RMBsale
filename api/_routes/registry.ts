import type { HttpRequest as VercelRequest, HttpResponse as VercelResponse } from "../_lib/request.js";
import { handler as accounts } from "./accounts.js";
import { handler as adjustments } from "./adjustments.js";
import { handler as dashboard } from "./dashboard.js";
import { handler as customers } from "./customers.js";
import { handler as ledger } from "./ledger.js";
import { handler as purchases } from "./purchases.js";
import { handler as profit } from "./profit.js";
import { handler as receivables } from "./receivables.js";
import { handler as sales } from "./sales.js";
import { handler as settlements } from "./settlements.js";
import { handler as transfers } from "./transfers.js";
import { handler as authLogin } from "./auth-login.js";
import { handler as authLogout } from "./auth-logout.js";
import { handler as authMe } from "./auth-me.js";
import { handler as adminUsers } from "./admin-users.js";
import { handler as adminChannels } from "./admin-channels.js";
import { handler as adminHolders } from "./admin-holders.js";
import { handler as adminAccounts } from "./admin-accounts.js";
import { handler as adminClearBusiness } from "./admin-clear-business.js";
import { handler as adminImport } from "./admin-import.js";
import { handler as adminAuditLogs } from "./admin-audit-logs.js";
import { handler as adminSnapshots } from "./admin-snapshots.js";
import { handler as adminBackups } from "./admin-backups.js";
import { handler as inventoryFifo } from "./inventory-fifo.js";
import { handler as reportsExportCsv } from "./reports-export-csv.js";
import { handler as reversals } from "./reversals.js";
import { handler as transactionReverse } from "./transaction-reverse.js";
import { handler as bootstrap } from "./bootstrap.js";
import { handler as holders } from "./holders.js";
import { handler as purchasesPay } from "./purchases-pay.js";
import { handler as specialClientWallet } from "./special-client-wallet.js";
import { handler as specialClientWalletDeposit } from "./special-client-wallet-deposit.js";
import { handler as specialClientWalletPayout } from "./special-client-wallet-payout.js";
import { handler as specialClientWalletReverse } from "./special-client-wallet-reverse.js";
import { handler as specialClientWalletExport } from "./special-client-wallet-export.js";

export type RouteHandler = (
  req: VercelRequest,
  res: VercelResponse,
) => Promise<unknown>;

export const routes: Record<string, RouteHandler> = {
  bootstrap,
  accounts,
  adjustments,
  dashboard,
  holders,
  "purchases/pay": purchasesPay,
  customers,
  ledger,
  profit,
  purchases,
  receivables,
  "special-client-wallet": specialClientWallet,
  "special-client-wallet/deposit": specialClientWalletDeposit,
  "special-client-wallet/payout": specialClientWalletPayout,
  "special-client-wallet/reverse": specialClientWalletReverse,
  "special-client-wallet/export.xlsx": specialClientWalletExport,
  sales,
  settlements,
  transfers,
  "auth/login": authLogin,
  "auth/logout": authLogout,
  "auth/me": authMe,
  "admin/users": adminUsers,
  "admin/channels": adminChannels,
  "admin/holders": adminHolders,
  "admin/accounts": adminAccounts,
  "admin/clear-business": adminClearBusiness,
  "admin/import": adminImport,
  "admin/snapshots/create": adminSnapshots,
  "admin/snapshots": adminSnapshots,
  "admin/backups/scheduled": adminBackups,
  "admin/backups/run": adminBackups,
  "admin/backups/download": adminBackups,
  "admin/backups": adminBackups,
  "admin/audit-logs": adminAuditLogs,
  "inventory/fifo": inventoryFifo,
  "reports/export.csv": reportsExportCsv,
  reversals,
};

export const transactionReverseHandler = transactionReverse;
