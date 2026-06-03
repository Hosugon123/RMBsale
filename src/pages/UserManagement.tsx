import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import { api, type UserRow } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export function UserManagement() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);

  const load = () => api.users().then(setUsers).catch(console.error);

  useEffect(() => {
    load();
  }, []);

  if (!user?.isAdmin) return <Navigate to="/dashboard" replace />;

  const addUser = async () => {
    const { value: form } = await Swal.fire({
      title: '新增使用者',
      html:
        '<input id="swal-user" class="form-control mb-2" placeholder="用戶名">' +
        '<input id="swal-pass" type="password" class="form-control mb-2" placeholder="密碼">' +
        '<select id="swal-role" class="form-select"><option value="operator">操作員</option><option value="admin">管理員</option></select>',
      showCancelButton: true,
      preConfirm: () => ({
        username: (document.getElementById('swal-user') as HTMLInputElement).value,
        password: (document.getElementById('swal-pass') as HTMLInputElement).value,
        role: (document.getElementById('swal-role') as HTMLSelectElement).value,
      }),
    });
    if (!form?.username) return;
    try {
      await api.addUser(form.username, form.password, form.role);
      load();
      await Swal.fire({ icon: 'success', title: '已新增' });
    } catch (err) {
      await Swal.fire({ icon: 'error', title: err instanceof Error ? err.message : '失敗' });
    }
  };

  const deleteUser = async (userId: number, username: string) => {
    const r = await Swal.fire({
      title: `停用 ${username}？`,
      icon: 'warning',
      showCancelButton: true,
    });
    if (!r.isConfirmed) return;
    try {
      await api.deleteUser(userId);
      load();
    } catch (err) {
      await Swal.fire({ icon: 'error', title: err instanceof Error ? err.message : '失敗' });
    }
  };

  return (
    <div className="container-fluid">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2><i className="bi bi-person-badge me-2" />使用者管理</h2>
        <button type="button" className="btn btn-primary" onClick={addUser}>
          <i className="bi bi-person-plus me-1" />新增使用者
        </button>
      </div>
      <div className="card shadow-sm">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th>ID</th>
                <th>用戶名</th>
                <th>角色</th>
                <th>狀態</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td>{u.username}</td>
                  <td>{u.role === 'admin' ? '管理員' : '操作員'}</td>
                  <td>
                    <span className={`badge ${u.isActive ? 'bg-success' : 'bg-secondary'}`}>
                      {u.isActive ? '啟用' : '停用'}
                    </span>
                  </td>
                  <td>
                    {u.isActive && u.id !== user.id && (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => deleteUser(u.id, u.username)}
                      >
                        停用
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
