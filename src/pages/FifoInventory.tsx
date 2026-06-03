import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatRmb, formatTwd, type FifoData } from '../lib/api';

export function FifoInventory() {
  const [data, setData] = useState<FifoData | null>(null);

  useEffect(() => {
    api.fifoInventory().then(setData).catch(console.error);
    const t = setInterval(() => api.fifoInventory().then(setData).catch(() => {}), 30000);
    return () => clearInterval(t);
  }, []);

  if (!data) return <div className="text-center p-5"><div className="spinner-border" /></div>;

  return (
    <div className="container-fluid">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="mb-0"><i className="bi bi-boxes me-2" />FIFO庫存管理</h2>
        <div className="d-flex gap-2">
          <Link to="/buy-in" className="btn btn-primary">
            <i className="bi bi-plus-circle me-2" />新增買入
          </Link>
          <Link to="/cash-management" className="btn btn-outline-secondary">
            <i className="bi bi-cash-stack me-2" />現金管理
          </Link>
        </div>
      </div>

      <div className="row">
        <div className="col-lg-8">
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-light">
              <h5 className="mb-0">
                <i className="bi bi-list-ul me-2" />FIFO庫存明細
                <small className="text-muted">（按買入時間倒序，最多20條）</small>
              </h5>
            </div>
            <div className="card-body p-0">
              {data.inventoryData.length === 0 ? (
                <div className="text-center p-5 text-muted">
                  <i className="bi bi-boxes display-4" />
                  <p className="mt-3">尚無庫存記錄</p>
                  <Link to="/buy-in" className="btn btn-primary">開始買入</Link>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>買入日期</th>
                        <th>渠道</th>
                        <th>出款帳戶</th>
                        <th>入款帳戶</th>
                        <th className="text-end">原始數量</th>
                        <th className="text-end">剩餘數量</th>
                        <th className="text-end">已出帳</th>
                        <th className="text-end">單位成本</th>
                        <th className="text-end">匯率</th>
                        <th className="text-end">庫存價值</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.inventoryData.map((item, i) => (
                        <tr key={i}>
                          <td><small>{item.purchaseDate}</small></td>
                          <td>{item.channel}</td>
                          <td><small className="text-muted">{item.paymentAccount || 'N/A'}</small></td>
                          <td><small className="text-muted">{item.depositAccount || 'N/A'}</small></td>
                          <td className="text-end text-muted">{formatRmb(item.originalRmb)}</td>
                          <td className="text-end text-success fw-bold">{formatRmb(item.remainingRmb)}</td>
                          <td className="text-end text-warning">{formatRmb(item.soldRmb)}</td>
                          <td className="text-end text-info">NT$ {item.unitCostTwd.toFixed(4)}</td>
                          <td className="text-end text-muted">{item.exchangeRate.toFixed(4)}</td>
                          <td className="text-end text-primary fw-bold">{formatTwd(item.totalValueTwd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-lg-4">
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-light">
              <h5 className="mb-0"><i className="bi bi-graph-up me-2" />銷售利潤分析</h5>
            </div>
            <div className="card-body p-0">
              {data.salesWithProfit.length === 0 ? (
                <div className="text-center p-4 text-muted">尚無銷售記錄</div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-sm mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>客戶</th>
                        <th className="text-end">RMB</th>
                        <th className="text-end">利潤</th>
                        <th className="text-end">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.salesWithProfit.map((s, i) => (
                        <tr key={i}>
                          <td><small>{s.customerName}</small></td>
                          <td className="text-end text-success">{formatRmb(s.rmbAmount)}</td>
                          <td className={`text-end ${s.profitTwd >= 0 ? 'text-success' : 'text-danger'}`}>
                            {formatTwd(s.profitTwd)}
                          </td>
                          <td className="text-end">{s.profitMargin.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="card border-0 shadow-sm mt-3">
            <div className="card-header bg-info text-white">
              <h6 className="mb-0"><i className="bi bi-info-circle me-2" />FIFO原理說明</h6>
            </div>
            <div className="card-body small">
              <p>先進先出（FIFO）：銷售時依最早買入批次計算成本，確保利潤計算準確。</p>
              <p className="mb-0">目前庫存總量：<strong>{formatRmb(data.totalInventoryRmb)}</strong></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
