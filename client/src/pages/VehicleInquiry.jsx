import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { FiArrowLeft, FiCheck, FiDollarSign, FiFileText, FiTruck } from 'react-icons/fi';

const formatPrice = (price) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(price || 0);

const INSTALLMENT_PLAN = {
  downpaymentRate: 0.5,
  months: 12,
  interestRate: 0.01,
  label: '50% Downpayment • 12 Months • 1% Monthly Interest',
};

function computeBreakdown(price) {
  const round = (v) => Math.round(v * 100) / 100;
  const downpayment = round(price * INSTALLMENT_PLAN.downpaymentRate);
  const financed = round(price - downpayment);
  const totalInterest = round(financed * INSTALLMENT_PLAN.interestRate * INSTALLMENT_PLAN.months);
  const totalAmount = round(price + totalInterest);
  const monthly = round((financed * (1 + INSTALLMENT_PLAN.interestRate * INSTALLMENT_PLAN.months)) / INSTALLMENT_PLAN.months);
  return { downpayment, financed, totalInterest, totalAmount, monthly };
}

export default function VehicleInquiry() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const productId = searchParams.get('product_id');

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedInquiry, setSubmittedInquiry] = useState(null);

  const [form, setForm] = useState({
    preferred_payment_method: 'installment',
    notes: '',
  });

  useEffect(() => {
    if (!productId) { navigate('/vehicles'); return; }
    fetchProduct();
  }, [productId]);

  const fetchProduct = async () => {
    try {
      const data = await api.getProduct(productId);
      if (data.type !== 'vehicle') {
        toast.error('Installment inquiries are only for vehicles');
        navigate('/vehicles');
        return;
      }
      setProduct(data);
    } catch {
      toast.error('Product not found');
      navigate('/vehicles');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const inquiry = await api.createInquiry({
        product_id: productId,
        preferred_payment_method: form.preferred_payment_method,
        notes: form.notes,
      });
      setSubmittedInquiry(inquiry);
      setSubmitted(true);
      toast.success('Inquiry submitted! We\'ll review and get back to you.');
    } catch (err) {
      if (err.inquiry_id) {
        toast.error('You already have an active inquiry for this vehicle.');
        navigate('/installments');
      } else {
        toast.error(err.message || 'Failed to submit inquiry');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-navy-900" />
      </div>
    );
  }

  const breakdown = product ? computeBreakdown(product.price) : null;
  const isInstallment = form.preferred_payment_method === 'installment';

  if (submitted && submittedInquiry) {
    return (
      <div>
        <section className="bg-navy-900 py-6">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <h1 className="text-2xl md:text-3xl font-bold text-white">Inquiry Submitted</h1>
          </div>
        </section>

        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FiCheck className="text-green-600" size={32} />
            </div>
            <h2 className="text-2xl font-bold text-navy-900 mb-2">Thank You!</h2>
            <p className="text-gray-600 mb-1">
              Your inquiry <span className="font-semibold text-navy-900">{submittedInquiry.inquiry_number}</span> has been received.
            </p>
            <p className="text-gray-500 text-sm mb-6">
              Our team will review your inquiry and contact you within 1–2 business days to discuss the next steps.
            </p>

            {/* Summary */}
            <div className="bg-gray-50 rounded-xl p-5 border border-gray-200 text-left mb-6">
              <h3 className="font-bold text-navy-900 mb-3">Inquiry Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Vehicle</span>
                  <span className="font-medium text-navy-900">{product.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Vehicle Price</span>
                  <span className="font-medium text-navy-900">{formatPrice(product.price)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Payment Method</span>
                  <span className="font-medium text-navy-900 capitalize">
                    {form.preferred_payment_method === 'installment' ? 'Installment Plan' : form.preferred_payment_method.replace('_', ' ')}
                  </span>
                </div>
                {isInstallment && breakdown && (
                  <>
                    <hr className="border-gray-200" />
                    <div className="flex justify-between">
                      <span className="text-gray-500">50% Downpayment</span>
                      <span className="font-medium text-navy-900">{formatPrice(breakdown.downpayment)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Monthly Payment (×12)</span>
                      <span className="font-medium text-navy-900">{formatPrice(breakdown.monthly)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Total Amount</span>
                      <span className="font-bold text-navy-900">{formatPrice(breakdown.totalAmount)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex gap-3 justify-center">
              <Link to="/installments" className="btn-accent px-6 py-2.5 rounded-xl text-sm font-semibold">
                View My Inquiries
              </Link>
              <Link to="/vehicles" className="bg-gray-100 text-navy-900 px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-colors">
                Browse More Vehicles
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <section className="bg-navy-900 py-6">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link to={`/products/${productId}`} className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm transition-colors mb-2">
            <FiArrowLeft size={14} /> Back to Vehicle
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold text-white">Vehicle Installment Inquiry</h1>
          <p className="text-gray-400 text-sm mt-1">Submit your interest and our team will get in touch with you.</p>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Form */}
          <div className="lg:col-span-3">
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
              <h2 className="text-lg font-bold text-navy-900 flex items-center gap-2">
                <FiFileText className="text-accent-500" /> Inquiry Form
              </h2>

              {/* Vehicle Info */}
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 flex items-center gap-4">
                <div className="w-14 h-14 bg-gray-200 rounded-lg overflow-hidden shrink-0">
                  {product.image_url && (
                    <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                  )}
                </div>
                <div>
                  <p className="font-semibold text-navy-900">{product.name}</p>
                  <p className="text-accent-600 font-bold">{formatPrice(product.price)}</p>
                  <p className="text-xs text-gray-500 capitalize">{product.vehicle_category} • {product.condition}</p>
                </div>
              </div>

              {/* Applicant Info */}
              <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 text-sm">
                <p className="font-semibold text-blue-900 mb-1">Your Information</p>
                <p className="text-blue-700">{user?.first_name} {user?.last_name}</p>
                <p className="text-blue-600">{user?.email}</p>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-sm font-semibold text-navy-900 mb-2">Preferred Payment Method</label>
                <div className="space-y-2">
                  {[
                    { value: 'installment', label: 'Installment Plan', desc: '50% down + 12 monthly payments' },
                    { value: 'gcash', label: 'GCash / E-Wallet', desc: 'Full payment via GCash' },
                    { value: 'bank_transfer', label: 'Bank Transfer', desc: 'Full payment via bank transfer' },
                  ].map((opt) => (
                    <label key={opt.value}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${form.preferred_payment_method === opt.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <input
                        type="radio"
                        name="preferred_payment_method"
                        value={opt.value}
                        checked={form.preferred_payment_method === opt.value}
                        onChange={(e) => setForm(f => ({ ...f, preferred_payment_method: e.target.value }))}
                        className="mt-0.5"
                      />
                      <div>
                        <p className="font-medium text-navy-900 text-sm">{opt.label}</p>
                        <p className="text-xs text-gray-500">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-semibold text-navy-900 mb-1">Notes / Questions <span className="text-gray-400 font-normal">(optional)</span></label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  className="input-field resize-none"
                  placeholder="Any questions or additional information..."
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60"
              >
                {submitting ? 'Submitting...' : 'Submit Inquiry'}
              </button>
            </form>
          </div>

          {/* Summary Sidebar */}
          <div className="lg:col-span-2 space-y-4">
            {/* Installment Breakdown */}
            {isInstallment && breakdown && (
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h3 className="font-bold text-navy-900 mb-3 flex items-center gap-2 text-sm">
                  <FiDollarSign className="text-accent-500" /> Installment Breakdown
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Vehicle Price</span>
                    <span className="font-medium">{formatPrice(product.price)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Downpayment (50%)</span>
                    <span className="font-medium">{formatPrice(breakdown.downpayment)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Financed Amount</span>
                    <span className="font-medium">{formatPrice(breakdown.financed)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Interest (1%/mo × 12)</span>
                    <span className="font-medium">{formatPrice(breakdown.totalInterest)}</span>
                  </div>
                  <hr className="border-gray-200" />
                  <div className="flex justify-between font-bold">
                    <span>Total Amount</span>
                    <span className="text-navy-900">{formatPrice(breakdown.totalAmount)}</span>
                  </div>
                  <div className="bg-accent-50 rounded-lg p-3 text-center mt-2">
                    <p className="text-xs text-gray-500">Monthly Payment</p>
                    <p className="text-xl font-bold text-accent-700">{formatPrice(breakdown.monthly)}</p>
                    <p className="text-xs text-gray-400">× 12 months</p>
                  </div>
                </div>
              </div>
            )}

            {/* Process Steps */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h3 className="font-bold text-navy-900 mb-3 text-sm">How It Works</h3>
              <ol className="space-y-3">
                {[
                  { step: '1', label: 'Submit Inquiry', desc: 'Fill out this form' },
                  { step: '2', label: 'Admin Review', desc: 'We review within 1–2 days' },
                  { step: '3', label: 'Pay Reservation Fee', desc: 'Lock in your vehicle' },
                  { step: '4', label: 'Downpayment at Pickup', desc: '50% due on vehicle pickup' },
                  { step: '5', label: 'Monthly Payments', desc: '12 equal monthly installments' },
                ].map((s) => (
                  <li key={s.step} className="flex items-start gap-3">
                    <span className="w-6 h-6 bg-navy-900 text-white rounded-full text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{s.step}</span>
                    <div>
                      <p className="text-sm font-medium text-navy-900">{s.label}</p>
                      <p className="text-xs text-gray-500">{s.desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
