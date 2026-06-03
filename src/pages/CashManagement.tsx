import { useCallback, useEffect, useState } from 'react';
import Swal from 'sweetalert2';
import {
  api,
  formatRmb,
  formatTwd,
  setStateVersion,
  type CashManagementData,
  type TransactionsData,
} from '../lib/api';

export function CashManagement() {
  const [data, setData] = useState<CashManagementData | null>(null);
  const [txData, setTxData] = useState<TransactionsData | null>(null);
  const [txPage, setTxPage] = useState(1);

  const load = useCallback(async () => {
    const d = await api.cashManagement();
    setData(d);
    setStateVersion(d.version);
    const tx = await api.transactions(txPage);
    setTxData(tx.data);
  }, [txPage]);

  useEffect(() => {
    load();
  }, [load]);

  const addHolder = async () => {
    const { value: name } = await Swal.fire({
      title: '新增持有人',
      input: 'text',
      showCancelButton: true,
    });
    if (!name) return;
    try {
      await api.cashAccountAction({ action: 'add_holder', name });
      await load();
    } catch (err) {
      await Swal.fire({ icon: 'error', title: err instanceof Error ? err.message : '失敗' });
    }
  };

  const addAccount = async () => {
    if (!data?.holders.length) {
      await Swal.fire({ icon: 'warning', title: '請先新增持有人' });
      return;
    }
    const { value: form } = await Swal.fire({
      title: '新增帳戶',
      html:
        '<select id="swal-holder" class="form-select mb-2">' +
        data.holders.map((h) => `<option value="${h.id}">${h.name}</option>`).join('') +
        '</select>' +
        '<input id="swal-name" class="form-control mb-2" placeholder="帳戶名稱">' +
        '<select id="swal-currency" class="form-select"><option value="TWD">TWD</option><option value="RMB">RMB</option></select>',
      showCancelButton: true,
      preConfirm: () => ({
        holder_id: (document.getElementById('swal-holder') as HTMLSelectElement).value,
        account_name: (document.getElementById('swal-name') as HTMLInputElement).value,
        currency: (document.getElementById('swal-currency') as HTMLSelectElement).value,
      }),
    });
    if (!form) return;
    try {
      await api.cashAccountAction({ action: 'add_account', ...form });
      await load();
    } catch (err) {
      await Swal.fire({ icon: 'error', title: err instanceof Error ? err.message : '失敗' });
    }
  };

  const settlement = async (customerId: number, name: string, max: number) => {
    const { value: form } = await Swal.fire({
      title: `銷帳 - ${name}`,
      html:
        `<p>應收：${formatTwd(max)}</p>` +
        '<input id="swal-amount" type="number" class="form-control mb-2" placeholder="銷帳金額">' +
        '<input id="swal-note" class="form-control" placeholder="備註">',
      showCancelButton: true,
      preConfirm: () => ({
        amount: Number((document.getElementById('swal-amount') as HTMLInputElement).value),
        note: (document.getElementById('swal-note') as HTMLInputElement).value,
      }),
    });
    if (!form?.amount) return;
    const twdAccounts = data?.accountsByHolder.flatMap((g) =>
      g.accounts.filter((a) => a.currency === 'TWD'),
    ) || [];
    if (!twdAccounts.length) {
      await Swal.fire({ icon: 'warning', title: '請先建立 TWD 帳戶' });
      return;
    }
    const accountId = twdAccounts[0].id;
    try {
      await api.settlement({ customerId, amount: form.amount, accountId, note: form.note });
      await load();
      await Swal.fire({ icon: 'success', title: '銷帳成功' });
    } catch (err) {
      await Swal.fire({ icon: 'error', title: err instanceof Error ? err.message : '失敗' });
    }
  };

  if (!data) return <div className="text-center p-5"><div className="spinner-border" /></div>;

  return (
    <div className="container-fluid">
      <div className="row mb-4">
        <div className="col-md-4">
          <div className="card text-center">
            <div className="card-body">
              <p className="text-muted mb-1">台幣總額</p>
              <h4 className="currency-twd" id="totalTwdDisplay">{formatTwd(data.totalTwd)}</h4>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card text-center">
            <div className="card-body">
              <p className="text-muted mb-1">人民幣總額</p>
              <h4 className="currency-rmb" id="totalRmbDisplay">{formatRmb(data.totalRmb)}</h4>
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card text-center">
            <div className="card-body">
              <p className="text-muted mb-1">應收帳款</p>
              <h4 className="text-danger">{formatTwd(data.totalReceivablesTwd)}</h4>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-3 d-flex gap-2 flex-wrap">
        <button type="button" className="btn btn-outline-primary btn-sm" onClick={addHolder}>
          <i className="bi bi-person-plus me-1" />新增持有人
        </button>
        <button type="button" className="btn btn-outline-primary btn-sm" onClick={addAccount}>
          <i className="bi bi-plus-circle me-1" />新增帳戶
        </button>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={load}>
          <i className="bi bi-arrow-clockwise me-1" />刷新
        </button>
      </div>

      <div className="row g-4">
        <div className="col-lg-6">
          <div className="card shadow-sm">
            <div className="card-header">持有人與帳戶</div>
            <div className="card-body" id="accounts-container">
              {data.accountsByHolder.map((g) => (
                <div key={g.holderId} className="mb-3">
                  <h6>{g.holderName}</h6>
                  <ul className="list-group list-group-flush">
                    {g.accounts.map((a) => (
                      <li key={a.id} className="list-group-item d-flex justify-content-between">
                        <span>{a.name} ({a.currency})</span>
                        <span className={a.currency === 'TWD' ? 'currency-twd' : 'currency-rmb'}>
                          {a.currency === 'TWD' ? formatTwd(a.balance) : formatRmb(a.balance)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="col-lg-6">
          <div className="card shadow-sm mb-3">
            <div className="card-header bg-danger-subtle">應收帳款</div>
            <div className="table-responsive">
              <table className="table table-sm mb-0">
                <thead><tr><th>客戶</th><th className="text-end">應收</th><th /></tr></thead>
                <tbody>
                  {data.customersWithReceivables.length === 0 ? (
                    <tr><td colSpan={3} className="text-center text-muted p-3">無應收帳款</td></tr>
                  ) : (
                    data.customersWithReceivables.map((c) => (
                      <tr key={c.id}>
                        <td>{c.name}</td>
                        <td className="text-end text-danger">{formatTwd(c.totalReceivablesTwd)}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-success settlement-btn"
                            onClick={() => settlement(c.id, c.name, c.totalReceivablesTwd)}
                          >
                            銷帳
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card shadow-sm">
            <div className="card-header bg-warning-subtle">待付款項</div>
            <div className="table-responsive">
              <table className="table table-sm mb-0">
                <thead><tr><th>ID</th><th className="text-end">待付 TWD</th></tr></thead>
                <tbody>
                  {data.pendingPayments.length === 0 ? (
                    <tr><td colSpan={2} className="text-center text-muted p-3">無待付款</td></tr>
                  ) : (
                    data.pendingPayments.map((p) => (
                      <tr key={p.id}>
                        <td>#{p.purchaseRecordId}</td>
                        <td className="text-end">{formatTwd(p.amountTwd)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="card shadow-sm mt-4">
        <div className="card-header">近期交易流水</div>
        <div className="table-responsive">
          <table className="table table-sm table-hover">
            <thead>
              <tr>
                <th>日期</th>
                <th>類型</th>
                <th>說明</th>
                <th className="text-end">TWD</th>
                <th className="text-end">RMB</th>
                <th className="text-end">累計 TWD</th>
              </tr>
            </thead>
            <tbody id="movements-tbody">
              {txData?.transactions.map((t) => (
                <tr key={t.id}>
                  <td><small>{t.date.slice(0, 10)}</small></td>
                  <td><small>{t.type}</small></td>
                  <td>{t.description}</td>
                  <td className={`text-end ${t.twdChange >= 0 ? 'text-primary' : 'text-danger'}`}>
                    {t.twdChange !== 0 ? formatTwd(t.twdChange) : '-'}
                  </td>
                  <td className={`text-end ${t.rmbChange >= 0 ? 'text-success' : 'text-warning'}`}>
                    {t.rmbChange !== 0 ? formatRmb(t.rmbChange) : '-'}
                  </td>
                  <td className="text-end">{formatTwd(t.runningTwdBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {txData && txData.pagination.pages > 1 && (
          <div className="card-footer d-flex justify-content-between">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={!txData.pagination.hasPrev}
              onClick={() => setTxPage((p) => p - 1)}
            >
              上一頁
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={!txData.pagination.hasNext}
              onClick={() => setTxPage((p) => p + 1)}
            >
              下一頁
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
