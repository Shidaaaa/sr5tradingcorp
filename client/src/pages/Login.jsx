import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { FiMail, FiLock, FiEye, FiEyeOff, FiArrowRight } from 'react-icons/fi';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await login(email, password);
      toast.success('Welcome back!');
      navigate(data.user.role === 'admin' ? '/admin' : '/');
    } catch (err) {
      if (err.needs_verification) {
        toast.error('Please verify your email before signing in.');
        navigate(`/verify-email?email=${encodeURIComponent(err.email || email)}`);
        return;
      }
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex">
      {/* Left - Brand Panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-navy-900 relative overflow-hidden items-center justify-center">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 right-20 w-96 h-96 bg-accent-500 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 left-20 w-72 h-72 bg-primary-500 rounded-full blur-3xl"></div>
        </div>
        <div className="relative text-center px-12">
          <div className="w-20 h-20 bg-accent-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <span className="text-white font-extrabold text-2xl">SR-5</span>
          </div>
          <h2 className="text-4xl font-bold text-white mb-4">Welcome Back</h2>
          <p className="text-gray-400 text-lg max-w-md">Sign in to access your account, manage orders, and explore our wide selection of Japan surplus products.</p>
        </div>
      </div>

      {/* Right - Form */}
      <div className="flex-1 flex items-center justify-center py-12 px-4 sm:px-8 bg-gray-50">
        <div className="w-full max-w-md">
          <div className="lg:hidden text-center mb-8">
            <div className="w-14 h-14 bg-accent-500 rounded-xl flex items-center justify-center mx-auto mb-3">
              <span className="text-white font-extrabold text-lg">SR-5</span>
            </div>
            <h1 className="text-2xl font-bold text-navy-900">Welcome Back</h1>
          </div>

          <div className="lg:block hidden mb-8">
            <h1 className="text-3xl font-bold text-navy-900">Sign In</h1>
            <p className="text-gray-500 mt-1">Enter your credentials to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-navy-900 mb-1.5">Email Address</label>
              <div className="relative">
                <FiMail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input-field pl-11" placeholder="you@example.com" required />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-navy-900 mb-1.5">Password</label>
              <div className="relative">
                <FiLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} className="input-field pl-11 pr-11" placeholder="••••••••" required />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="w-full bg-navy-900 text-white py-3 rounded-xl font-semibold hover:bg-navy-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
              {loading ? 'Signing in...' : <><span>Sign In</span> <FiArrowRight /></>}
            </button>

            <p className="text-center text-sm text-gray-500">
              Don't have an account? <Link to="/register" className="text-accent-600 font-semibold hover:underline">Register</Link>
            </p>
          </form>

          <div className="mt-6 p-4 bg-navy-900/5 rounded-xl border border-navy-100">
            <p className="font-semibold text-navy-900 text-xs mb-1.5">Demo Accounts:</p>
            <p className="text-xs text-gray-600">Admin: admin@sr5trading.com / admin123</p>
            <p className="text-xs text-gray-600">Customer: customer@test.com / customer123</p>
          </div>
        </div>
      </div>
    </div>
  );
}
