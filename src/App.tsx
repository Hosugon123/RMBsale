import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { CashManagement } from './pages/CashManagement';
import { SalesEntry } from './pages/SalesEntry';
import { BuyIn } from './pages/BuyIn';
import { FifoInventory } from './pages/FifoInventory';
import { IndependentBalance } from './pages/IndependentBalance';
import { UserManagement } from './pages/UserManagement';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cash-management"
            element={
              <ProtectedRoute>
                <CashManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sales-entry"
            element={
              <ProtectedRoute>
                <SalesEntry />
              </ProtectedRoute>
            }
          />
          <Route
            path="/buy-in"
            element={
              <ProtectedRoute>
                <BuyIn />
              </ProtectedRoute>
            }
          />
          <Route
            path="/fifo-inventory"
            element={
              <ProtectedRoute>
                <FifoInventory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/independent-balance"
            element={
              <ProtectedRoute>
                <IndependentBalance />
              </ProtectedRoute>
            }
          />
          <Route
            path="/user-management"
            element={
              <ProtectedRoute>
                <UserManagement />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
