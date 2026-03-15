import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { FiArrowRight, FiEye, FiEyeOff } from 'react-icons/fi';

export default function Register() {
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', password: '', confirmPassword: '', phone: '', address: '', city: '' });
  const [showPasswords, setShowPasswords] = useState({ password: false, confirmPassword: false });
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) { toast.error('Passwords do not match'); return; }
    if (form.password.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setLoading(true);
    try {
      const data = await register(form);
      if (data.needs_verification) {
        toast.success('Account created. Enter the verification code sent to your email.');
        navigate(`/verify-email?email=${encodeURIComponent(data.email || form.email)}`);
        return;
      }
      toast.success('Account created successfully!');
      navigate('/');
    } catch (err) {
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
          <div className="absolute top-20 left-20 w-96 h-96 bg-primary-500 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-20 w-72 h-72 bg-accent-500 rounded-full blur-3xl"></div>
        </div>
        <div className="relative text-center px-12">
          <div className="w-20 h-20 bg-accent-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <span className="text-white font-extrabold text-2xl">SR-5</span>
          </div>
          <h2 className="text-4xl font-bold text-white mb-4">Join SR-5 Trading</h2>
          <p className="text-gray-400 text-lg max-w-md">Create an account to browse our inventory, book services, and place orders online.</p>
        </div>
      </div>

      {/* Right - Form */}
      <div className="flex-1 flex items-center justify-center py-12 px-4 sm:px-8 bg-gray-50">
        <div className="w-full max-w-lg">
          <div className="lg:hidden text-center mb-6">
            <div className="w-14 h-14 bg-accent-500 rounded-xl flex items-center justify-center mx-auto mb-3">
              <span className="text-white font-extrabold text-lg">SR-5</span>
            </div>
          </div>

          <div className="mb-8">
            <h1 className="text-3xl font-bold text-navy-900">Create Account</h1>
            <p className="text-gray-500 mt-1">Fill in your details to get started</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-navy-900 mb-1.5">First Name *</label>
                <input name="first_name" value={form.first_name} onChange={handleChange} className="input-field" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-900 mb-1.5">Last Name *</label>
                <input name="last_name" value={form.last_name} onChange={handleChange} className="input-field" required />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-navy-900 mb-1.5">Email Address *</label>
              <input type="email" name="email" value={form.email} onChange={handleChange} className="input-field" required />
            </div>

            <div>
              <label className="block text-sm font-medium text-navy-900 mb-1.5">Phone Number</label>
              <input name="phone" value={form.phone} onChange={handleChange} className="input-field" placeholder="+63 9XX XXX XXXX" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-navy-900 mb-1.5">Address</label>
                <input name="address" value={form.address} onChange={handleChange} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-900 mb-1.5">City</label>
                <input name="city" value={form.city} onChange={handleChange} className="input-field" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-navy-900 mb-1.5">Password *</label>
                <div className="relative">
                  <input
                    type={showPasswords.password ? 'text' : 'password'}
                    name="password"
                    value={form.password}
                    onChange={handleChange}
                    className="input-field pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords(prev => ({ ...prev, password: !prev.password }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showPasswords.password ? 'Hide password' : 'Show password'}
                  >
                    {showPasswords.password ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-900 mb-1.5">Confirm Password *</label>
                <div className="relative">
                  <input
                    type={showPasswords.confirmPassword ? 'text' : 'password'}
                    name="confirmPassword"
                    value={form.confirmPassword}
                    onChange={handleChange}
                    className="input-field pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords(prev => ({ ...prev, confirmPassword: !prev.confirmPassword }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showPasswords.confirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  >
                    {showPasswords.confirmPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                  </button>
                </div>
              </div>
            </div>

            <button type="submit" disabled={loading} className="w-full bg-navy-900 text-white py-3 rounded-xl font-semibold hover:bg-navy-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
              {loading ? 'Creating Account...' : <><span>Create Account</span> <FiArrowRight /></>}
            </button>

            <p className="text-center text-sm text-gray-500">
              Already have an account? <Link to="/login" className="text-accent-600 font-semibold hover:underline">Sign In</Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
