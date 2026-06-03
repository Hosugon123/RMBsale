import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatRmb, formatTwd, type DashboardData } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    api.dashboard().then(setData).catch(console.error);
  }, []);

  if (!data) {
    return <div className="text-center p-5"><div className="spinner-border" /></div>;
  }

  return (
    <>
      <div className="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-4 border-bottom">
        <h1 className="h2">儀表板總覽</h1>
        <small className="text-muted">歡迎回來，{user?.username}！</small>
      </div>

      <div className="row">
        <div className="col-lg-3 col-md-6 mb-4">
          <div className="card h-100 metric-card">
            <div className="card-body d-flex align-items-center">
              <div className="icon-circle bg-primary-subtle text-primary">
                <i className="bi bi-wallet2 fs-3" />
              </div>
              <div>
                <p className="text-muted mb-1 small">台幣資產 (TWD)</p>
                <h3 className="fw-bold mb-0 currency-twd">{formatTwd(data.totalTwd)}</h3>
              </div>
            </div>
            <Link to="/cash-management" className="card-footer text-decoration-none text-muted d-block">
              查看現金 <i className="bi bi-arrow-right-circle float-end" />
            </Link>
          </div>
        </div>

        <div className="col-lg-3 col-md-6 mb-4">
          <div className="card h-100 metric-card">
            <div className="card-body d-flex align-items-center">
              <div className="icon-circle bg-success-subtle text-success">
                <i className="bi bi-currency-yen fs-3" />
              </div>
              <div>
                <p className="text-muted mb-1 small">人民幣資產 (RMB)</p>
                <h3 className="fw-bold mb-0 currency-rmb">{formatRmb(data.totalRmb)}</h3>
              </div>
            </div>
            <Link to="/fifo-inventory" className="card-footer text-decoration-none text-muted d-block">
              管理庫存 <i className="bi bi-arrow-right-circle float-end" />
            </Link>
          </div>
        </div>

        <div className="col-lg-3 col-md-6 mb-4">
          <div className="card h-100 metric-card">
            <div className="card-body d-flex align-items-center">
              <div className="icon-circle bg-danger-subtle text-danger">
                <i className="bi bi-receipt-cutoff fs-3" />
              </div>
              <div>
                <p className="text-muted mb-1 small">應收帳款 (TWD)</p>
                <h3 className="fw-bold mb-0 text-danger">{formatTwd(data.totalReceivables)}</h3>
              </div>
            </div>
            <Link to="/cash-management" className="card-footer text-decoration-none text-muted d-block">
              查看帳款 <i className="bi bi-arrow-right-circle float-end" />
            </Link>
          </div>
        </div>

        <div className="col-lg-3 col-md-6 mb-4">
          <div className="card h-100 metric-card">
            <div className="card-body d-flex align-items-center">
              <div className="icon-circle bg-warning-subtle text-warning">
                <i className="bi bi-cash-stack fs-3" />
              </div>
              <div>
                <p className="text-muted mb-1 small">總利潤 (TWD)</p>
                <h3 className="fw-bold mb-0">{formatTwd(data.totalProfitTwd)}</h3>
              </div>
            </div>
            <Link to="/fifo-inventory" className="card-footer text-decoration-none text-muted d-block">
              查看利潤分析 <i className="bi bi-arrow-right-circle float-end" />
            </Link>
          </div>
        </div>

        <div className="col-lg-3 col-md-6 mb-4">
          <div className="card h-100 metric-card">
            <div className="card-body d-flex align-items-center">
              <div className="icon-circle bg-info-subtle text-info">
                <i className="bi bi-lightning-charge fs-3" />
              </div>
              <div>
                <p className="text-muted mb-1 small">快速操作</p>
                <h3 className="fw-bold mb-0">開始工作</h3>
              </div>
            </div>
            <div className="card-footer">
              <div className="d-grid gap-2">
                <Link to="/buy-in" className="btn btn-sm btn-outline-primary">
                  <i className="bi bi-bag-plus me-1" />買入
                </Link>
                <Link to="/sales-entry" className="btn btn-sm btn-outline-success">
                  <i className="bi bi-cash-coin me-1" />銷售
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
