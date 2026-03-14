import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout/Layout';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import Products from './pages/Products';
import ProductDetail from './pages/ProductDetail';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import Orders from './pages/Orders';
import OrderDetail from './pages/OrderDetail';
import Bookings from './pages/Bookings';
import Profile from './pages/Profile';
import Feedback from './pages/Feedback';
import Receipt from './pages/Receipt';
import PaymentSuccess from './pages/PaymentSuccess';
import Services from './pages/Services';
import AdminLayout from './pages/admin/AdminLayout';
import Dashboard from './pages/admin/Dashboard';
import AdminProducts from './pages/admin/AdminProducts';
import AdminOrders from './pages/admin/AdminOrders';
import AdminBookings from './pages/admin/AdminBookings';
import AdminInventory from './pages/admin/AdminInventory';
import AdminSales from './pages/admin/AdminSales';
import AdminCustomers from './pages/admin/AdminCustomers';
import AdminFeedback from './pages/admin/AdminFeedback';
import AdminReports from './pages/admin/AdminReports';
import AdminReturns from './pages/admin/AdminReturns';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-500"></div></div>;
  return user ? children : <Navigate to="/login" />;
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-500"></div></div>;
  return user?.role === 'admin' ? children : <Navigate to="/" />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="verify-email" element={<VerifyEmail />} />
        <Route path="products" element={<Products />} />
        <Route path="vehicles" element={<Products filterType="vehicle" />} />
        <Route path="services" element={<Services />} />
        <Route path="browse/trucks" element={<Products browseCategory="trucks" />} />
        <Route path="browse/tractors" element={<Products browseCategory="tractors" />} />
        <Route path="browse/vans" element={<Products browseCategory="vans" />} />
        <Route path="browse/other-units" element={<Products browseCategory="other-units" />} />
        <Route path="browse" element={<Products />} />
        <Route path="products/:id" element={<ProductDetail />} />
        <Route path="cart" element={<ProtectedRoute><Cart /></ProtectedRoute>} />
        <Route path="checkout" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />
        <Route path="orders" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
        <Route path="orders/:id" element={<ProtectedRoute><OrderDetail /></ProtectedRoute>} />
        <Route path="bookings" element={<ProtectedRoute><Bookings /></ProtectedRoute>} />
        <Route path="profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
        <Route path="feedback" element={<ProtectedRoute><Feedback /></ProtectedRoute>} />
        <Route path="receipt/:receiptNumber" element={<ProtectedRoute><Receipt /></ProtectedRoute>} />
        <Route path="payment/success" element={<ProtectedRoute><PaymentSuccess /></ProtectedRoute>} />
      </Route>

      <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="products" element={<AdminProducts />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="bookings" element={<AdminBookings />} />
        <Route path="inventory" element={<AdminInventory />} />
        <Route path="sales" element={<AdminSales />} />
        <Route path="customers" element={<AdminCustomers />} />
        <Route path="feedback" element={<AdminFeedback />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="returns" element={<AdminReturns />} />
      </Route>
    </Routes>
  );
}
