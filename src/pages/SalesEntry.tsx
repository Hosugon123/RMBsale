import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Swal from 'sweetalert2';
import {
  api,
  formatRmb,
  formatTwd,
  setStateVersion,
  type SalesEntryData,
} from '../lib/api';

export function SalesEntry() {
  const [data, setData] = useState<SalesEntryData | null>(null);
  const [page, setPage] = useState(1);
  const [customerId, setCustomerId] = useState('');
  const [customerManual, setCustomerManual] = useState('');
  const [rmbAccountId, setRmbAccountId] = useState('');
  const [rmbAmount, setRmbAmount] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [twdReceivable, setTwdReceivable] = useState(0);
  const [profitPreview, setProfitPreview] = useState<{
    costTwd: number;
    profitTwd: number;
    profitMargin: number;
  } | null>(null);

  const load = useCallback(async (p = page) => {
    const d = await api.salesEntry(p);
    setData(d);
    setStateVersion(d.version);
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const r = parseFloat(rmbAmount) || 0;
    const e = parseFloat(exchangeRate) || 0;
    setTwdReceivable(Math.round(r * e * 100) / 100);
    if (r <= 0 || e <= 0) {
      setProfitPreview(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void api
        .calculateProfit(r, e)
        .then((preview) => {
          if (!cancelled) setProfitPreview(preview);
        })
        .catch(() => {
          if (!cancelled) setProfitPreview(null);
        });
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [rmbAmount, exchangeRate]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.createSale({
        customerId: customerId ? Number(customerId) : undefined,
        customerNameManual: customerManual || undefined,
        rmbAccountId: Number(rmbAccountId),
        rmbAmount: parseFloat(rmbAmount),
        exchangeRate: parseFloat(exchangeRate),
      });
      await Swal.fire({ icon: 'success', title: '訂單已建立' });
      setRmbAmount('');
      setExchangeRate('');
      setCustomerManual('');
      setCustomerId('');
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '建立失敗';
      if ((err as Error & { code?: string }).code === 'VERSION_CONFLICT') {
        await load();
      }
      await Swal.fire({ icon: 'error', title: msg });
    }
  };

  const cancelSale = async (saleId: number, name: string) => {
    const r = await Swal.fire({
      title: '確認取消銷售？',
      text: `客戶：${name}`,
      icon: 'warning',
      showCancelButton: true,
    });
    if (!r.isConfirmed) return;
    try {
      await api.reverseSale(saleId);
      await load();
      await Swal.fire({ icon: 'success', title: '已取消' });
    } catch (err) {
      await Swal.fire({ icon: 'error', title: err instanceof Error ? err.message : '取消失敗' });
      await load();
    }
  };

  const addCustomer = async () => {
    const name = customerManual.trim();
    if (!name) return;
    try {
      await api.addCustomer(name);
      const customers = await api.customers();
      setData((prev) => (prev ? { ...prev, customers } : prev));
      await Swal.fire({ icon: 'success', title: '已加入常用客戶' });
    } catch (err) {
      await Swal.fire({ icon: 'error', title: err instanceof Error ? err.message : '失敗' });
    }
  };

  if (!data) return <div className="text-center p-5"><div className="spinner-border" /></div>;

  return (
    <div className="row g-4">
      <div className="col-lg-5">
        <div className="card shadow-sm mb-4">
          <div className="card-header bg-primary text-white">
            <h4 className="mb-0 fw-light"><i className="bi bi-pencil-square me-2" />創建新訂單</h4>
          </div>
          <div className="card-body p-4">
            <form onSubmit={onSubmit}>
              <div className="mb-3">
                <label className="form-label fw-bold">客戶</label>
                <div className="row g-2">
                  <div className="col-md-6">
                    <select
                      className="form-select"
                      value={customerId}
                      onChange={(e) => setCustomerId(e.target.value)}
                    >
                      <option value="">--- 選擇常用客戶 ---</option>
                      {data.customers.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-4">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="輸入客戶名稱"
                      value={customerManual}
                      onChange={(e) => setCustomerManual(e.target.value)}
                    />
                  </div>
                  <div className="col-md-2">
                    <button type="button" className="btn btn-outline-primary w-100" onClick={addCustomer} title="新增到常用客戶">
                      <i className="bi bi-plus-circle" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="mb-3">
                <label className="form-label fw-bold">RMB 出貨帳戶</label>
                <select
                  className="form-select"
                  value={rmbAccountId}
                  onChange={(e) => setRmbAccountId(e.target.value)}
                  required
                >
                  <option value="" disabled>--- 請選擇出貨庫存 ---</option>
                  {data.ownerRmbAccountsGrouped.map((g) => (
                    <optgroup key={g.holderId} label={g.holderName}>
                      {g.accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} (庫存: {a.balance.toFixed(2)})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div className="row">
                <div className="col-md-6 mb-3">
                  <label className="form-label fw-bold">售出金額 (RMB)</label>
                  <input
                    type="text"
                    className="form-control"
                    value={rmbAmount}
                    onChange={(e) => setRmbAmount(e.target.value)}
                    required
                  />
                </div>
                <div className="col-md-6 mb-3">
                  <label className="form-label fw-bold">售出匯率</label>
                  <input
                    type="text"
                    className="form-control"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="alert alert-info text-center py-3">
                <h6 className="text-info-emphasis mb-1">應收帳款 (TWD)</h6>
                <h2 className="fw-bold mb-0">{formatTwd(twdReceivable)}</h2>
              </div>

              {profitPreview && (
                <div className="card border-success mb-3">
                  <div className="card-header bg-success text-white">
                    <h6 className="mb-0"><i className="bi bi-graph-up me-2" />利潤預覽</h6>
                  </div>
                  <div className="card-body p-3">
                    <div className="row text-center">
                      <div className="col-4">
                        <small className="text-muted d-block">庫存成本</small>
                        <span className="fw-bold text-danger">{formatTwd(profitPreview.costTwd)}</span>
                      </div>
                      <div className="col-4">
                        <small className="text-muted d-block">預估利潤</small>
                        <span className="fw-bold text-success">{formatTwd(profitPreview.profitTwd)}</span>
                      </div>
                      <div className="col-4">
                        <small className="text-muted d-block">利潤率</small>
                        <span className="fw-bold text-primary">{profitPreview.profitMargin.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="d-grid">
                <button type="submit" className="btn btn-primary btn-lg">
                  <i className="bi bi-plus-circle me-2" />確認創建訂單
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div className="col-lg-7">
        <div className="card shadow-sm">
          <div className="card-header bg-warning-subtle">
            <h4 className="mb-0 fw-light"><i className="bi bi-hourglass-split me-2" />近期訂單</h4>
          </div>
          <div className="card-body p-2">
            <div className="table-responsive">
              <table className="table table-hover table-sm align-middle mb-0">
                <thead>
                  <tr>
                    <th>客戶</th>
                    <th>售出 (RMB)</th>
                    <th className="text-end">應收 (TWD)</th>
                    <th className="text-end">預估利潤</th>
                    <th>日期</th>
                    <th className="text-center">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentUnsettledSales.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center text-muted py-5">
                        太棒了！所有訂單都已結清！
                      </td>
                    </tr>
                  ) : (
                    data.recentUnsettledSales.map((s) => (
                      <tr key={s.id}>
                        <td>{s.customer?.name}</td>
                        <td className="text-success">{formatRmb(s.rmbAmount)}</td>
                        <td className="fw-bold text-end text-danger">{formatTwd(s.twdAmount)}</td>
                        <td className="text-end">
                          <span className={`fw-bold ${s.profitInfo.profitTwd >= 0 ? 'text-success' : 'text-danger'}`}>
                            {formatTwd(s.profitInfo.profitTwd)}
                          </span>
                          <br />
                          <small className="text-muted">{s.profitInfo.profitMargin.toFixed(1)}%</small>
                        </td>
                        <td><small>{s.createdAt.slice(0, 10)}</small></td>
                        <td className="text-center">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => cancelSale(s.id, s.customer?.name || '')}
                          >
                            <i className="bi bi-x-circle" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {data.pagination.pages > 1 && (
              <div className="card-footer bg-light d-flex justify-content-between">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  disabled={!data.pagination.hasPrev}
                  onClick={() => setPage((p) => p - 1)}
                >
                  上一頁
                </button>
                <span className="text-muted small">
                  第 {data.pagination.page} / {data.pagination.pages} 頁
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  disabled={!data.pagination.hasNext}
                  onClick={() => setPage((p) => p + 1)}
                >
                  下一頁
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
