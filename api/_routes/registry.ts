import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handler as accounts } from "./accounts";
import { handler as adjustments } from "./adjustments";
import { handler as dashboard } from "./dashboard";
import { handler as customers } from "./customers";
import { handler as ledger } from "./ledger";
import { handler as purchases } from "./purchases";
import { handler as receivables } from "./receivables";
import { handler as sales } from "./sales";
import { handler as settlements } from "./settlements";
import { handler as transfers } from "./transfers";
import { handler as authLogin } from "./auth-login";
import { handler as authLogout } from "./auth-logout";
import { handler as authMe } from "./auth-me";
import { handler as adminUsers } from "./admin-users";
import { handler as adminChannels } from "./admin-channels";
import { handler as adminHolders } from "./admin-holders";
import { handler as adminAuditLogs } from "./admin-audit-logs";
import { handler as inventoryFifo } from "./inventory-fifo";
import { handler as reportsExportCsv } from "./reports-export-csv";
import { handler as transactionReverse } from "./transaction-reverse";
import { handler as bootstrap } from "./bootstrap";
import { handler as holders } from "./holders";
import { handler as purchasesPay } from "./purchases-pay";

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
  purchases,
  receivables,
  sales,
  settlements,
  transfers,
  "auth/login": authLogin,
  "auth/logout": authLogout,
  "auth/me": authMe,
  "admin/users": adminUsers,
  "admin/channels": adminChannels,
  "admin/holders": adminHolders,
  "admin/audit-logs": adminAuditLogs,
  "inventory/fifo": inventoryFifo,
  "reports/export.csv": reportsExportCsv,
};

export const transactionReverseHandler = transactionReverse;
