import { useCallback, useEffect, useState } from 'react';
import Swal from 'sweetalert2';
import { api, type IndependentBalanceData } from '../lib/api';

export function IndependentBalance() {
  const [data, setData] = useState<IndependentBalanceData | null>(null);
  const [rmbAmount, setRmbAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');

  const load = useCallback(async () => {
    const d = await api.independentBalance();
    setData(d);
    if (!accountId && d.rmbAccounts[0]) {
      setAccountId(String(d.rmbAccounts[0].id));
    }
  }, [accountId]);

  useEffect(() => {
    load();
  }, [load]);

  const amount = parseFloat(rmbAmount) || 0;
  const fee = Math.round(amount * 0.01 * 100) / 100;
  const net = amount - fee;

  const deposit = async () => {
    if (!accountId) {
      await Swal.fire({ icon: 'warning', title: '請選擇入庫帳戶' });
      return;
    }
    try {
      await api.independentDeposit(parseFloat(rmbAmount), Number(accountId));
      await Swal.fire({ icon: 'success', title: '儲值成功' });
      setRmbAmount('');
      load();
    } catch (err) {
      await Swal.fire({ icon: 'error', title: err instanceof Error ? err.message : '失敗' });
    }
  };

  const expense = async () => {
    try {
      await api.independentExpense(parseFloat(expenseAmount), Number(accountId));
      await Swal.fire({ icon: 'success', title: '已扣除' });
      setExpenseAmount('');
      load();
    } catch (err) {
      await Swal.fire({ icon: 'error', title: err instanceof Error ? err.message : '失敗' });
    }
  };

  if (!data) return <div className="text-center p-5"><div className="spinner-border" /></div>;

  return (
    <div className="container-fluid">
      <div className="row mb-4">
        <div className="col-12">
          <h2 className="text-primary"><i className="bi bi-wallet2 me-2" />儲值客戶與餘額</h2>
          <p className="text-muted mb-0">獨立儲值管理系統</p>
        </div>
      </div>

      <div className="row g-4">
        <div className="col-12 col-lg-6">
          <div className="card shadow-sm h-100">
            <div className="card-header bg-primary text-white">
              <h5 className="mb-0"><i className="bi bi-cash-stack me-2" />人民幣儲值</h5>
            </div>
            <div className="card-body">
              <div className="mb-3">
                <label className="form-label fw-semibold">人民幣金額 (RMB)</label>
                <input
                  type="text"
                  className="form-control form-control-lg"
                  value={rmbAmount}
                  onChange={(e) => setRmbAmount(e.target.value)}
                  placeholder="例如 7250"
                />
              </div>
              <div className="mb-3">
                <label className="form-label fw-semibold">
                  利潤入庫帳戶（RMB）<span className="text-danger">*</span>
                </label>
                <select
                  className="form-select form-select-lg"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  required
                >
                  <option value="">請選擇儲值利潤入庫帳戶</option>
                  {data.rmbAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.holder?.name} - {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" className="btn btn-success btn-lg w-100 mb-4" onClick={deposit}>
                <i className="bi bi-cash-stack me-2" />儲值並入帳
              </button>
              <div className="row g-3 mb-4">
                <div className="col-md-6">
                  <div className="card border-0 bg-light">
                    <div className="card-body text-center">
                      <div className="text-muted small mb-2">儲值金額</div>
                      <div className="fs-2 fw-bold text-primary" id="rmbConverted">{net.toFixed(2)}</div>
                    </div>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="card border-0 bg-light">
                    <div className="card-body text-center">
                      <div className="text-muted small mb-2">手續費 1% 扣除</div>
                      <div className="fs-2 fw-bold text-warning" id="feeDeducted">{fee.toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="border-top pt-4">
                <h6 className="text-muted mb-3">支出管理</h6>
                <div className="row g-3">
                  <div className="col-md-8">
                    <input
                      type="text"
                      className="form-control form-control-lg"
                      value={expenseAmount}
                      onChange={(e) => setExpenseAmount(e.target.value)}
                      placeholder="支出金額"
                    />
                  </div>
                  <div className="col-md-4">
                    <button type="button" className="btn btn-outline-danger btn-lg w-100" onClick={expense}>
                      扣除支出
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-6">
          <div className="card shadow-sm h-100">
            <div className="card-header bg-success text-white">
              <h5 className="mb-0"><i className="bi bi-graph-up me-2" />帳戶統計</h5>
            </div>
            <div className="card-body d-flex flex-column gap-4">
              <div className="card border-0 bg-success text-white">
                <div className="card-body text-center">
                  <div className="text-white-50 small mb-2">帳戶人民幣餘額</div>
                  <div className="fs-1 fw-bold" id="rmbBalance">{data.rmbBalance.toFixed(2)}</div>
                </div>
              </div>
              <div className="card border-0 bg-warning text-dark">
                <div className="card-body text-center">
                  <div className="small mb-2">手續費利潤總計</div>
                  <div className="fs-1 fw-bold" id="totalFees">{data.feeProfitTotal.toFixed(2)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="row mt-4">
        <div className="col-12">
          <div className="card shadow-sm">
            <div className="card-header bg-info text-white">
              <h5 className="mb-0"><i className="bi bi-clock-history me-2" />交易歷史</h5>
            </div>
            <div className="table-responsive">
              <table className="table table-hover mb-0" id="historyTable">
                <thead className="table-light">
                  <tr>
                    <th>時間</th>
                    <th>類型</th>
                    <th className="text-end">金額</th>
                    <th className="text-end">手續費</th>
                    <th className="text-end">淨額</th>
                  </tr>
                </thead>
                <tbody>
                  {data.logs.map((log) => (
                    <tr key={log.id}>
                      <td><small>{log.createdAt.slice(0, 16).replace('T', ' ')}</small></td>
                      <td>{log.type === 'deposit' ? '儲值' : '支出'}</td>
                      <td className="text-end">¥ {log.rmbAmount.toFixed(2)}</td>
                      <td className="text-end">¥ {log.feeAmount.toFixed(2)}</td>
                      <td className="text-end">¥ {log.netRmb.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
