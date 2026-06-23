import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Swal from 'sweetalert2';
import { api, formatRmb, formatTwd, setStateVersion, type BuyInData } from '../lib/api';

export function BuyIn() {
  const [data, setData] = useState<BuyInData | null>(null);
  const [page] = useState(1);
  const [channelId, setChannelId] = useState('');
  const [channelManual, setChannelManual] = useState('');
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [depositAccountId, setDepositAccountId] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'unpaid'>('paid');
  const [rmbAmount, setRmbAmount] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');

  const load = useCallback(async () => {
    const d = await api.buyIn(page);
    setData(d);
    setStateVersion(d.version);
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  const twdCost = Math.ceil((parseFloat(rmbAmount) || 0) * (parseFloat(exchangeRate) || 0));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.createPurchase({
        paymentAccountId: paymentStatus === 'paid' ? Number(paymentAccountId) : null,
        depositAccountId: Number(depositAccountId),
        rmbAmount: parseFloat(rmbAmount),
        exchangeRate: parseFloat(exchangeRate),
        channelId: channelId ? Number(channelId) : undefined,
        channelNameManual: channelManual || undefined,
        paymentStatus,
      });
      await Swal.fire({ icon: 'success', title: '買入成功' });
      setRmbAmount('');
      setExchangeRate('');
      load();
    } catch (err) {
      await Swal.fire({ icon: 'error', title: err instanceof Error ? err.message : '失敗' });
      load();
    }
  };

  const cancelPurchase = async (id: number, channel: string, amount: number) => {
    const r = await Swal.fire({
      title: '確認取消買入？',
      text: `${channel} ¥${amount}`,
      icon: 'warning',
      showCancelButton: true,
    });
    if (!r.isConfirmed) return;
    try {
      await api.reversePurchase(id);
      await load();
      await Swal.fire({ icon: 'success', title: '已取消' });
    } catch (err) {
      await Swal.fire({ icon: 'error', title: err instanceof Error ? err.message : '取消失敗' });
    }
  };

  if (!data) return <div className="text-center p-5"><div className="spinner-border" /></div>;

  return (
    <div className="row g-4">
      <div className="col-lg-5">
        <div className="card border-0 shadow-sm h-100">
          <div className="card-header bg-primary text-white">
            <h5 className="mb-0"><i className="bi bi-keyboard-fill me-2" />建立一筆買入交易</h5>
          </div>
          <div className="card-body p-4">
            <form onSubmit={onSubmit}>
              <div className="mb-3">
                <label className="form-label"><strong>步驟 1:</strong> 選擇或輸入購買渠道</label>
                <select className="form-select mb-2" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
                  <option value="">從常用列表選擇...</option>
                  {data.channels.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <div className="input-group">
                  <input
                    type="text"
                    className="form-control"
                    placeholder="輸入新渠道名稱..."
                    value={channelManual}
                    onChange={(e) => setChannelManual(e.target.value)}
                  />
                </div>
              </div>
              <hr className="my-4" />

              <div className="mb-3">
                <label className="form-label"><strong>步驟 2:</strong> 選擇資金帳戶</label>
                <div className="p-3 mb-3 border rounded bg-light">
                  <h6 className="text-primary">從哪個 TWD 帳戶付款</h6>
                  <select
                    className="form-select"
                    value={paymentAccountId}
                    onChange={(e) => setPaymentAccountId(e.target.value)}
                    disabled={paymentStatus === 'unpaid'}
                  >
                    <option value="">--- 請選擇付款帳戶 ---</option>
                    {data.ownerTwdAccountsGrouped.map((g) => (
                      <optgroup key={g.holderId} label={g.holderName}>
                        {g.accounts.map((a) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div className="p-3 mb-3 border rounded bg-warning bg-opacity-10">
                  <h6 className="fw-bold">付款狀態</h6>
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="radio"
                      checked={paymentStatus === 'paid'}
                      onChange={() => setPaymentStatus('paid')}
                    />
                    <label className="form-check-label"><strong className="text-primary">已付款</strong></label>
                  </div>
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="radio"
                      checked={paymentStatus === 'unpaid'}
                      onChange={() => setPaymentStatus('unpaid')}
                    />
                    <label className="form-check-label"><strong className="text-danger">未付款</strong></label>
                  </div>
                </div>
                <div className="p-3 mb-3 border rounded bg-light">
                  <h6 className="text-success">將 RMB 存入哪個帳戶</h6>
                  <select
                    className="form-select"
                    value={depositAccountId}
                    onChange={(e) => setDepositAccountId(e.target.value)}
                    required
                  >
                    <option value="">--- 請選擇入庫帳戶 ---</option>
                    {data.ownerRmbAccountsGrouped.map((g) => (
                      <optgroup key={g.holderId} label={g.holderName}>
                        {g.accounts.map((a) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              </div>

              <hr className="my-4" />
              <div className="row g-2">
                <div className="col-md-6">
                  <label className="form-label">買入金額 (RMB)</label>
                  <input
                    type="text"
                    className="form-control"
                    value={rmbAmount}
                    onChange={(e) => setRmbAmount(e.target.value)}
                    required
                  />
                </div>
                <div className="col-md-6">
                  <label className="form-label">買入匯率</label>
                  <input
                    type="text"
                    className="form-control"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="alert alert-info text-center mt-3">
                預計花費成本 (TWD): <strong>{formatTwd(twdCost)}</strong>
              </div>
              <div className="d-grid mt-4">
                <button type="submit" className="btn btn-primary btn-lg">
                  <i className="bi bi-check-circle-fill me-2" />確認執行交易
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <div className="col-lg-7">
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-light">
            <h5 className="mb-0 fw-normal"><i className="bi bi-clock-history me-2" />買入紀錄</h5>
          </div>
          <div className="card-body p-2">
            <div className="table-responsive">
              <table className="table table-sm table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>渠道</th>
                    <th>付款帳戶</th>
                    <th className="text-end">買入RMB</th>
                    <th className="text-end">匯率</th>
                    <th className="text-end">成本TWD</th>
                    <th className="text-center">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentPurchases.length === 0 ? (
                    <tr><td colSpan={7} className="text-center p-4 text-muted">尚無買入紀錄。</td></tr>
                  ) : (
                    data.recentPurchases.map((r) => (
                      <tr key={r.id}>
                        <td><small>{r.purchaseDate.slice(0, 10)}</small></td>
                        <td>{r.channel?.name || 'N/A'}</td>
                        <td><small>{r.paymentAccount?.name || '未付款'}</small></td>
                        <td className="text-end text-success">{formatRmb(r.rmbAmount)}</td>
                        <td className="text-end text-info">{r.exchangeRate.toFixed(4)}</td>
                        <td className="text-end text-danger fw-bold">{formatTwd(r.twdCost)}</td>
                        <td className="text-center">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => cancelPurchase(r.id, r.channel?.name || 'N/A', r.rmbAmount)}
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
          </div>
        </div>
      </div>
    </div>
  );
}
