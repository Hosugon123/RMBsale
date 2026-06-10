import * as React from "react";
import { Boxes } from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { NumberPagination } from "../components/NumberPagination";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/table";
import { useAppStore } from "../features/AppStore";
import { profit, rmb, twd } from "../lib/currencyStyles";
import { fmtMoney, fmtRate } from "../lib/utils";

const INVENTORY_PAGE_SIZE = 8;

export function InventoryPage() {
  const { state } = useAppStore();
  const lots = React.useMemo(
    () =>
      state.rmbLots
        .filter((lot) => Number(lot.remainingRmb) > 0)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id),
    [state.rmbLots]
  );
  const allocations = React.useMemo(
    () =>
      state.saleAllocations
        .map((allocation) => ({
          ...allocation,
          sale: state.sales.find((sale) => sale.id === allocation.saleId)
        }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [state.saleAllocations, state.sales]
  );
  const [lotPage, setLotPage] = React.useState(1);
  const [allocationPage, setAllocationPage] = React.useState(1);
  const lotPageCount = Math.max(1, Math.ceil(lots.length / INVENTORY_PAGE_SIZE));
  const allocationPageCount = Math.max(1, Math.ceil(allocations.length / INVENTORY_PAGE_SIZE));

  React.useEffect(() => {
    if (lotPage > lotPageCount) setLotPage(lotPageCount);
  }, [lotPage, lotPageCount]);

  React.useEffect(() => {
    if (allocationPage > allocationPageCount) setAllocationPage(allocationPageCount);
  }, [allocationPage, allocationPageCount]);

  React.useEffect(() => {
    setLotPage(1);
  }, [lots.length]);

  React.useEffect(() => {
    setAllocationPage(1);
  }, [allocations.length]);

  const pagedLots = React.useMemo(
    () => lots.slice((lotPage - 1) * INVENTORY_PAGE_SIZE, lotPage * INVENTORY_PAGE_SIZE),
    [lots, lotPage]
  );

  const pagedAllocations = React.useMemo(
    () => allocations.slice((allocationPage - 1) * INVENTORY_PAGE_SIZE, allocationPage * INVENTORY_PAGE_SIZE),
    [allocations, allocationPage]
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>FIFO RMB 庫存</CardTitle></CardHeader>
        <CardContent className="space-y-3 overflow-x-auto sm:space-y-4">
          {lots.length === 0 ? <EmptyState icon={Boxes} title="目前沒有 RMB 庫存" /> : (
            <>
              <Table>
                <THead>
                  <TR>
                    <TH>買入日期</TH>
                    <TH>渠道</TH>
                    <TH className="text-right">原始 RMB</TH>
                    <TH className="text-right">已售 RMB</TH>
                    <TH className="text-right">剩餘 RMB</TH>
                    <TH className="text-right">成本匯率</TH>
                    <TH className="text-right">庫存價值</TH>
                  </TR>
                </THead>
                <TBody>
                  {pagedLots.map((lot) => {
                    const soldRmb = Number(lot.originalRmb) - Number(lot.remainingRmb);
                    return (
                      <TR key={lot.id}>
                        <TD>{new Date(lot.createdAt).toLocaleDateString("zh-TW")}</TD>
                        <TD>{lot.channelName}</TD>
                        <TD className={rmb.moneyCell}>{fmtMoney(lot.originalRmb, "RMB")}</TD>
                        <TD className="text-right text-muted-foreground">{fmtMoney(soldRmb, "RMB")}</TD>
                        <TD className={rmb.moneyCell}>{fmtMoney(lot.remainingRmb, "RMB")}</TD>
                        <TD className="text-right">{fmtRate(lot.unitCostTwd)}</TD>
                        <TD className={twd.moneyCell}>{fmtMoney(Number(lot.remainingRmb) * Number(lot.unitCostTwd))}</TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
              <NumberPagination page={lotPage} pageCount={lotPageCount} onPageChange={setLotPage} />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>售出 FIFO 分配紀錄</CardTitle></CardHeader>
        <CardContent className="space-y-3 overflow-x-auto sm:space-y-4">
          {allocations.length === 0 ? <EmptyState icon={Boxes} title="尚無售出分配紀錄" /> : (
            <>
              <Table>
                <THead>
                  <TR>
                    <TH>售出日期</TH>
                    <TH>客戶</TH>
                    <TH>來源批次</TH>
                    <TH className="text-right">分配 RMB</TH>
                    <TH className="text-right">成本匯率</TH>
                    <TH className="text-right">批次成本</TH>
                    <TH className="text-right">售出匯率</TH>
                    <TH className="text-right">分配利潤</TH>
                  </TR>
                </THead>
                <TBody>
                  {pagedAllocations.map((allocation) => {
                    const allocationProfit = allocation.sale
                      ? Number(allocation.allocatedRmb) * Number(allocation.sale.exchangeRate) - Number(allocation.costTwd)
                      : null;
                    return (
                      <TR key={allocation.id}>
                        <TD>{new Date(allocation.createdAt).toLocaleDateString("zh-TW")}</TD>
                        <TD>{allocation.sale?.customerName ?? "-"}</TD>
                        <TD>{allocation.channelName}</TD>
                        <TD className={rmb.moneyCell}>{fmtMoney(allocation.allocatedRmb, "RMB")}</TD>
                        <TD className="text-right">{fmtRate(allocation.unitCostTwd)}</TD>
                        <TD className={twd.moneyCell}>{fmtMoney(allocation.costTwd)}</TD>
                        <TD className="text-right">{allocation.sale ? fmtRate(allocation.sale.exchangeRate) : "-"}</TD>
                        <TD className={allocationProfit === null ? "text-right" : profit.moneyCell}>
                          {allocationProfit === null ? "-" : fmtMoney(allocationProfit)}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
              <NumberPagination page={allocationPage} pageCount={allocationPageCount} onPageChange={setAllocationPage} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
