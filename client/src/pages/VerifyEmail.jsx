import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { FiArrowRight, FiMail, FiRefreshCw } from 'react-icons/fi';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { verifyEmail, resendVerificationCode } = useAuth();

  const initialEmail = useMemo(() => searchParams.get('email') || '', [searchParams]);
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!email) {
      toast.error('Email is required.');
      return;
    }
    if (!code || code.trim().length < 6) {
      toast.error('Please enter your 6-digit verification code.');
      return;
    }

    setVerifying(true);
    try {
      const data = await verifyEmail(email, code.trim());
      toast.success(data.message || 'Email verified successfully.');
      navigate(data.user?.role === 'admin' ? '/admin' : '/');
    } catch (err) {
      toast.error(err.message || 'Failed to verify email.');
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!email) {
      toast.error('Please enter your email first.');
      return;
    }

    setResending(true);
    try {
      const data = await resendVerificationCode(email);
      toast.success(data.message || 'Verification code sent.');
    } catch (err) {
      toast.error(err.message || 'Failed to resend code.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-navy-900 mb-1">Verify Your Email</h1>
        <p className="text-sm text-gray-500 mb-6">Enter the verification code sent to your email address.</p>

        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-navy-900 mb-1.5">Email Address</label>
            <div className="relative">
              <FiMail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field pl-11"
                placeholder="you@example.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-navy-900 mb-1.5">Verification Code</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="input-field tracking-[0.3em] text-center font-semibold"
              placeholder="123456"
              inputMode="numeric"
              required
            />
          </div>

          <button
            type="submit"
            disabled={verifying}
            className="w-full bg-navy-900 text-white py-3 rounded-xl font-semibold hover:bg-navy-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {verifying ? 'Verifying...' : <><span>Verify Email</span> <FiArrowRight /></>}
          </button>
        </form>

        <button
          type="button"
          onClick={handleResend}
          disabled={resending}
          className="w-full mt-3 border border-gray-200 text-gray-700 py-2.5 rounded-xl font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {resending ? 'Sending...' : <><FiRefreshCw size={14} /> Resend Code</>}
        </button>

        <p className="text-center text-sm text-gray-500 mt-5">
          Already verified? <Link to="/login" className="text-accent-600 font-semibold hover:underline">Sign In</Link>
        </p>
      </div>
    </div>
  );
}
