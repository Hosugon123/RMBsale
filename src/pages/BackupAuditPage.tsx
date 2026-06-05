import * as React from "react";
import { Database, Download, RefreshCw, Shield } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/table";
import { serverApi, useServerDataMode } from "../lib/serverApi";
import { fmtMoney } from "../lib/utils";

type BackupRun = {
  id: number;
  type: string;
  status: string;
  startedAt: string;
  finishedAt?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  storageTarget: string;
  errorMessage?: string | null;
};

type Snapshot = {
  id: number;
  snapshotDate: string;
  totalTwdBalance: string;
  totalRmbBalance: string;
  totalReceivablesTwd: string;
  openSalesCount: number;
  openPurchasesCount: number;
  ledgerEntriesCount: number;
  checksum: string;
};

type AuditLog = {
  id: number;
  username?: string | null;
  action: string;
  targetType: string;
  targetId?: number | null;
  createdAt: string;
};

export function BackupAuditPage() {
  const serverMode = useServerDataMode();
  const [storageMode, setStorageMode] = React.useState("local");
  const [runs, setRuns] = React.useState<BackupRun[]>([]);
  const [snapshots, setSnapshots] = React.useState<Snapshot[]>([]);
  const [auditLogs, setAuditLogs] = React.useState<AuditLog[]>([]);
  const [compareFrom, setCompareFrom] = React.useState("");
  const [compareTo, setCompareTo] = React.useState("");
  const [comparison, setComparison] = React.useState<Record<string, unknown> | null>(null);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!serverMode) return;
    setError("");
    try {
      const [backupData, snapshotData, auditData] = await Promise.all([
        serverApi.listBackups(),
        serverApi.listSnapshots(),
        serverApi.listAuditLogs(50)
      ]);
      setStorageMode(backupData.storageMode);
      setRuns(backupData.runs);
      setSnapshots(snapshotData.snapshots);
      setAuditLogs(auditData.auditLogs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    }
  }, [serverMode]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (!serverMode) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>備份與稽核</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          此功能僅在連線資料庫模式（正式環境）可用。本機 demo 模式請改用資料匯出功能。
        </CardContent>
      </Card>
    );
  }

  const runBackup = async () => {
    setBusy(true);
    setError("");
    try {
      await serverApi.runBackup();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "備份失敗");
    } finally {
      setBusy(false);
    }
  };

  const createSnapshot = async () => {
    setBusy(true);
    setError("");
    try {
      await serverApi.createSnapshot();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "建立快照失敗");
    } finally {
      setBusy(false);
    }
  };

  const compareSnapshots = async () => {
    if (!compareFrom || !compareTo) return;
    setError("");
    try {
      const result = await serverApi.compareSnapshots(compareFrom, compareTo);
      setComparison(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "比較失敗");
    }
  };

  const lastRun = runs[0];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              備份與稽核
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              儲存模式：{storageMode === "gcs" ? "Google Cloud Storage" : "本機 /tmp（請盡快下載）"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              最後備份：{lastRun ? `${lastRun.type} / ${lastRun.status} / ${new Date(lastRun.startedAt).toLocaleString("zh-TW")}` : "尚無"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={busy}>
              <RefreshCw className="h-4 w-4" />
              重新整理
            </Button>
            <Button size="sm" onClick={() => void createSnapshot()} disabled={busy}>
              <Database className="h-4 w-4" />
              建立快照
            </Button>
            <Button size="sm" onClick={() => void runBackup()} disabled={busy}>
              <Download className="h-4 w-4" />
              手動備份
            </Button>
          </div>
        </CardHeader>
        {error ? <CardContent className="pt-0 text-sm text-destructive">{error}</CardContent> : null}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">備份列表</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>時間</TH>
                  <TH>類型</TH>
                  <TH>狀態</TH>
                  <TH className="text-right">操作</TH>
                </TR>
              </THead>
              <TBody>
                {runs.map((run) => (
                  <TR key={run.id}>
                    <TD className="text-muted-foreground">{new Date(run.startedAt).toLocaleString("zh-TW")}</TD>
                    <TD>{run.type}</TD>
                    <TD>{run.status}</TD>
                    <TD className="text-right">
                      {run.status === "success" ? (
                        <a className="text-sm text-primary hover:underline" href={serverApi.backupDownloadUrl(run.id)}>
                          下載
                        </a>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">每日快照</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>日期</TH>
                    <TH className="text-right">TWD</TH>
                    <TH className="text-right">RMB</TH>
                    <TH className="text-right">應收</TH>
                  </TR>
                </THead>
                <TBody>
                  {snapshots.map((row) => (
                    <TR key={row.id}>
                      <TD>{row.snapshotDate}</TD>
                      <TD className="text-right">{fmtMoney(row.totalTwdBalance)}</TD>
                      <TD className="text-right">{fmtMoney(row.totalRmbBalance, "RMB")}</TD>
                      <TD className="text-right">{fmtMoney(row.totalReceivablesTwd)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
            <div className="flex flex-wrap items-end gap-2 border-t pt-4">
              <label className="space-y-1 text-sm">
                <span>比較起日</span>
                <Input type="date" value={compareFrom} onChange={(e) => setCompareFrom(e.target.value)} />
              </label>
              <label className="space-y-1 text-sm">
                <span>比較迄日</span>
                <Input type="date" value={compareTo} onChange={(e) => setCompareTo(e.target.value)} />
              </label>
              <Button variant="outline" size="sm" onClick={() => void compareSnapshots()}>
                比較
              </Button>
            </div>
            {comparison ? (
              <pre className="max-h-48 overflow-auto rounded-md border bg-muted/20 p-3 text-xs">
                {JSON.stringify(comparison.delta, null, 2)}
              </pre>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">最近操作紀錄（Audit Log）</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH>時間</TH>
                <TH>使用者</TH>
                <TH>動作</TH>
                <TH>對象</TH>
              </TR>
            </THead>
            <TBody>
              {auditLogs.map((log) => (
                <TR key={log.id}>
                  <TD className="text-muted-foreground">{new Date(log.createdAt).toLocaleString("zh-TW")}</TD>
                  <TD>{log.username ?? "-"}</TD>
                  <TD>{log.action}</TD>
                  <TD>
                    {log.targetType}
                    {log.targetId ? ` #${log.targetId}` : ""}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
