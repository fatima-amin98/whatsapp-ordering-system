import { Routes, Route, Navigate, Link } from 'react-router-dom';
import StoreFront from './pages/public/StoreFront';
import OrderConfirmation from './pages/public/OrderConfirmation';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import DashboardLayout from './pages/dashboard/DashboardLayout';
import DashboardHome from './pages/dashboard/DashboardHome';
import OrdersPage from './pages/dashboard/OrdersPage';
import ProductManagement from './pages/dashboard/ProductManagement';
import StoreSettings from './pages/dashboard/StoreSettings';
import ProtectedRoute from './components/ProtectedRoute';

export default function App() {
  return (
    <Routes>
      <Route path="/store/:slug" element={<StoreFront />} />
      <Route path="/confirm/:orderId" element={<OrderConfirmation />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardHome />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="products" element={<ProductManagement />} />
        <Route path="settings" element={<StoreSettings />} />
      </Route>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-800 mb-2">404</h1>
            <p className="text-gray-600">Page not found</p>
            <Link to="/" className="text-blue-600 underline mt-4 inline-block">Go home</Link>
          </div>
        </div>
      } />
    </Routes>
  );
}
