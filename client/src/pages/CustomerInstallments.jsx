import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import toast from 'react-hot-toast';
import { FiFileText, FiClock, FiCheck, FiX, FiChevronRight, FiDollarSign, FiRefreshCw, FiCalendar } from 'react-icons/fi';

const formatPrice = (price) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(price || 0);

const formatDate = (date) =>
  new Date(date).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });

const STATUS_CONFIG = {
  pending:   { label: 'Pending Review', color: 'bg-yellow-100 text-yellow-800', icon: <FiClock size={14} /> },
  approved:  { label: 'Approved',       color: 'bg-green-100 text-green-800',  icon: <FiCheck size={14} /> },
  rejected:  { label: 'Rejected',       color: 'bg-red-100 text-red-800',      icon: <FiX size={14} /> },
  cancelled: { label: 'Cancelled',      color: 'bg-gray-100 text-gray-600',    icon: <FiX size={14} /> },
  converted: { label: 'Converted to Order', color: 'bg-blue-100 text-blue-800', icon: <FiDollarSign size={14} /> },
};

export default function CustomerInstallments() {
  const [inquiries, setInquiries] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('inquiries');
  const [cancelling, setCancelling] = useState(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [inqData, ordersData] = await Promise.all([
        api.getInquiries(),
        api.getOrders(),
      ]);
      setInquiries(inqData);
      // Only show vehicle orders with installment plan
      setOrders((ordersData || []).filter(o => o.has_vehicle && o.vehicle_payment_method === 'installment'));
    } catch {
      toast.error('Failed to load installment data');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelInquiry = async (id) => {
    if (!window.confirm('Cancel this inquiry?')) return;
    setCancelling(id);
    try {
      await api.cancelInquiry(id);
      toast.success('Inquiry cancelled');
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Failed to cancel inquiry');
    } finally {
      setCancelling(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-navy-900" />
      </div>
    );
  }

  return (
    <div>
      <section className="bg-navy-900 py-6">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl md:text-3xl font-bold text-white">My Installments</h1>
          <p className="text-gray-400 text-sm mt-1">Track your vehicle inquiries and active installment plans.</p>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
          {[
            { key: 'inquiries', label: `Inquiries (${inquiries.length})` },
            { key: 'active',    label: `Active Plans (${orders.length})` },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.key ? 'bg-white text-navy-900 shadow-sm' : 'text-gray-600 hover:text-navy-900'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ─── Inquiries Tab ─── */}
        {activeTab === 'inquiries' && (
          <div className="space-y-4">
            {inquiries.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
                <FiFileText size={40} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-500 font-medium">No inquiries yet</p>
                <p className="text-gray-400 text-sm mt-1">Browse vehicles and apply for an installment plan.</p>
                <Link to="/vehicles" className="btn-accent px-6 py-2.5 rounded-xl text-sm font-semibold inline-block mt-4">
                  Browse Vehicles
                </Link>
              </div>
            ) : (
              inquiries.map(inq => {
                const statusCfg = STATUS_CONFIG[inq.status] || STATUS_CONFIG.pending;
                return (
                  <div key={inq._id} className="bg-white rounded-2xl border border-gray-200 p-5">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-gray-100 rounded-xl overflow-hidden shrink-0">
                          {inq.product_id?.image_url && (
                            <img src={inq.product_id.image_url} alt={inq.product_id?.name} className="w-full h-full object-cover" />
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-navy-900">{inq.product_id?.name || '—'}</p>
                          <p className="text-sm text-gray-500">{inq.inquiry_number} • {formatDate(inq.createdAt)}</p>
                          <p className="text-sm text-gray-500 capitalize">{inq.preferred_payment_method === 'installment' ? 'Installment Plan' : inq.preferred_payment_method?.replace('_', ' ')}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${statusCfg.color}`}>
                          {statusCfg.icon} {statusCfg.label}
                        </span>
                        {inq.status === 'pending' && (
                          <button
                            onClick={() => handleCancelInquiry(inq._id)}
                            disabled={cancelling === inq._id}
                            className="text-xs text-red-500 hover:text-red-700 font-medium flex items-center gap-1"
                          >
                            <FiX size={12} /> Cancel
                          </button>
                        )}
                        {inq.status === 'approved' && (
                          <Link to="/checkout" className="bg-navy-900 text-white px-4 py-1.5 rounded-lg text-xs font-semibold hover:bg-navy-800 transition-colors">
                            Proceed to Order →
                          </Link>
                        )}
                        {inq.status === 'converted' && inq.converted_order_id && (
                          <Link to={`/orders/${inq.converted_order_id._id || inq.converted_order_id}`} className="text-blue-600 hover:text-blue-800 text-xs font-medium flex items-center gap-1">
                            View Order <FiChevronRight size={12} />
                          </Link>
                        )}
                      </div>
                    </div>

                    {/* Installment breakdown */}
                    {inq.preferred_payment_method === 'installment' && inq.downpayment_amount && (
                      <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-gray-400">Vehicle Price</p>
                          <p className="font-semibold text-navy-900">{formatPrice(inq.product_price)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Downpayment</p>
                          <p className="font-semibold text-navy-900">{formatPrice(inq.downpayment_amount)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Monthly (×12)</p>
                          <p className="font-semibold text-navy-900">{formatPrice(inq.monthly_amount)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Total Amount</p>
                          <p className="font-semibold text-navy-900">{formatPrice(inq.total_amount)}</p>
                        </div>
                      </div>
                    )}

                    {/* Admin notes */}
                    {inq.admin_notes && (
                      <div className="mt-3 bg-gray-50 rounded-lg p-3 text-sm">
                        <p className="text-xs text-gray-400 mb-1">Note from Admin</p>
                        <p className="text-gray-700">{inq.admin_notes}</p>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ─── Active Installment Plans Tab ─── */}
        {activeTab === 'active' && (
          <div className="space-y-6">
            {orders.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
                <FiCalendar size={40} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-500 font-medium">No active installment plans</p>
                <p className="text-gray-400 text-sm mt-1">Once your order is placed with an installment plan, it will appear here.</p>
              </div>
            ) : (
              orders.map(order => {
                const schedule = order.installment_schedule || [];
                const paidCount = schedule.filter(s => s.status === 'paid').length;
                const totalCount = schedule.length || order.installment_months || 12;
                const progressPct = totalCount > 0 ? Math.round((paidCount / totalCount) * 100) : 0;
                const nextDue = schedule.find(s => s.status === 'pending');

                return (
                  <div key={order._id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
                      <div>
                        <p className="font-bold text-navy-900">Order {order.order_number}</p>
                        <p className="text-sm text-gray-500">{order.installment_plan_name || 'Installment Plan'}</p>
                      </div>
                      <Link to={`/orders/${order._id}`} className="text-sm text-accent-600 hover:text-accent-700 font-medium flex items-center gap-1">
                        View Full Order <FiChevronRight size={14} />
                      </Link>
                    </div>

                    <div className="p-6">
                      {/* Stats */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
                        <div className="bg-gray-50 rounded-xl p-3">
                          <p className="text-xs text-gray-400">Vehicle Price</p>
                          <p className="font-bold text-navy-900">{formatPrice(order.total_amount)}</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-3">
                          <p className="text-xs text-gray-400">Monthly Payment</p>
                          <p className="font-bold text-navy-900">{formatPrice(order.monthly_installment_amount)}</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-3">
                          <p className="text-xs text-gray-400">Progress</p>
                          <p className="font-bold text-navy-900">{paidCount}/{totalCount} paid</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-3">
                          <p className="text-xs text-gray-400">Next Due</p>
                          <p className="font-bold text-navy-900 text-sm">
                            {nextDue ? formatDate(nextDue.due_date) : 'Fully Paid ✓'}
                          </p>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="mb-5">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>Payment Progress</span>
                          <span>{progressPct}%</span>
                        </div>
                        <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500 rounded-full transition-all"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>

                      {/* Schedule Grid */}
                      {schedule.length > 0 && (
                        <div>
                          <p className="text-sm font-semibold text-navy-900 mb-3">Payment Schedule</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                            {schedule.map(item => (
                              <div key={item.installment_number}
                                className={`rounded-lg p-3 text-center border ${item.status === 'paid' ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                                <p className="text-xs text-gray-500 font-medium">Month {item.installment_number}</p>
                                <p className="text-xs text-gray-400">{formatDate(item.due_date)}</p>
                                <p className="text-sm font-bold text-navy-900 mt-1">{formatPrice(item.amount)}</p>
                                {item.status === 'paid' ? (
                                  <span className="inline-flex items-center gap-1 text-xs text-green-700 font-medium mt-1">
                                    <FiCheck size={10} /> Paid
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-xs text-gray-500 mt-1">
                                    <FiClock size={10} /> Pending
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
