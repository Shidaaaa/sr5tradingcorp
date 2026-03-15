import { useState, useEffect } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { FiCheck, FiX, FiClock, FiDollarSign, FiFilter, FiRefreshCw, FiChevronDown, FiChevronUp } from 'react-icons/fi';

const formatPrice = (p) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(p || 0);

const formatDate = (d) =>
  new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });

const STATUS_CONFIG = {
  pending:   { label: 'Pending',        badgeClass: 'bg-yellow-100 text-yellow-800', icon: <FiClock size={13} /> },
  approved:  { label: 'Approved',       badgeClass: 'bg-green-100 text-green-800',  icon: <FiCheck size={13} /> },
  rejected:  { label: 'Rejected',       badgeClass: 'bg-red-100 text-red-800',      icon: <FiX size={13} /> },
  converted: { label: 'Converted',      badgeClass: 'bg-blue-100 text-blue-800',    icon: <FiDollarSign size={13} /> },
};

export default function AdminInquiries() {
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [actionForm, setActionForm] = useState({ status: '', admin_notes: '' });
  const [processing, setProcessing] = useState(null);

  useEffect(() => { fetchInquiries(); }, [statusFilter]);

  const fetchInquiries = async () => {
    setLoading(true);
    try {
      const data = await api.getAdminInquiries(statusFilter || undefined);
      setInquiries(data);
    } catch {
      toast.error('Failed to load inquiries');
    } finally {
      setLoading(false);
    }
  };

  const openAction = (inq, status) => {
    setExpandedId(inq._id);
    setActionForm({ status, admin_notes: inq.admin_notes || '' });
  };

  const submitAction = async (inqId) => {
    if (!actionForm.status) return;
    setProcessing(inqId);
    try {
      await api.updateAdminInquiry(inqId, {
        status: actionForm.status,
        admin_notes: actionForm.admin_notes,
      });
      toast.success(`Inquiry ${actionForm.status}`);
      setExpandedId(null);
      fetchInquiries();
    } catch (err) {
      toast.error(err.message || 'Failed to update inquiry');
    } finally {
      setProcessing(null);
    }
  };

  const counts = {
    pending:   inquiries.filter(i => i.status === 'pending').length,
    approved:  inquiries.filter(i => i.status === 'approved').length,
    rejected:  inquiries.filter(i => i.status === 'rejected').length,
    converted: inquiries.filter(i => i.status === 'converted').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Vehicle Inquiries</h1>
          <p className="text-sm text-gray-500 mt-0.5">Review and manage customer installment inquiries.</p>
        </div>
        <button onClick={fetchInquiries} className="btn-secondary flex items-center gap-2 text-sm">
          <FiRefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Status Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Object.entries(counts).map(([status, count]) => {
          const cfg = STATUS_CONFIG[status];
          return (
            <button key={status}
              onClick={() => setStatusFilter(statusFilter === status ? '' : status)}
              className={`p-4 rounded-xl border text-left transition-all ${statusFilter === status ? 'ring-2 ring-navy-900 border-navy-900' : 'bg-white border-gray-200 hover:border-gray-300'}`}>
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.badgeClass}`}>
                  {cfg.icon} {cfg.label}
                </span>
              </div>
              <p className="text-2xl font-bold text-navy-900 mt-2">{count}</p>
            </button>
          );
        })}
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <FiFilter size={14} />
          <span>Filter:</span>
        </div>
        {['', 'pending', 'approved', 'rejected', 'converted'].map(s => (
          <button key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${statusFilter === s ? 'bg-navy-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {s === '' ? 'All' : STATUS_CONFIG[s]?.label}
          </button>
        ))}
      </div>

      {/* Inquiries List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-navy-900" />
        </div>
      ) : inquiries.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
          <p className="text-gray-500 font-medium">No inquiries found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {inquiries.map(inq => {
            const cfg = STATUS_CONFIG[inq.status] || STATUS_CONFIG.pending;
            const isOpen = expandedId === inq._id;
            const canAct = inq.status === 'pending' || inq.status === 'approved';

            return (
              <div key={inq._id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                {/* Row */}
                <div className="p-5">
                  <div className="flex items-start gap-4 flex-wrap">
                    {/* Vehicle Image */}
                    <div className="w-14 h-14 bg-gray-100 rounded-xl overflow-hidden shrink-0">
                      {inq.product_id?.image_url && (
                        <img src={inq.product_id.image_url} alt={inq.product_id?.name} className="w-full h-full object-cover" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between flex-wrap gap-2">
                        <div>
                          <p className="font-bold text-navy-900">{inq.product_id?.name || '—'}</p>
                          <p className="text-sm text-gray-500">
                            {inq.inquiry_number} &bull; {formatDate(inq.createdAt)}
                          </p>
                          <p className="text-sm text-gray-600 mt-1">
                            <span className="font-medium">{inq.user_id?.first_name} {inq.user_id?.last_name}</span>
                            <span className="text-gray-400 ml-2">{inq.user_id?.email}</span>
                          </p>
                        </div>
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${cfg.badgeClass}`}>
                          {cfg.icon} {cfg.label}
                        </span>
                      </div>

                      {/* Pricing Grid */}
                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-gray-400">Vehicle Price</p>
                          <p className="font-semibold">{formatPrice(inq.product_price)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Payment Method</p>
                          <p className="font-semibold capitalize">
                            {inq.preferred_payment_method === 'installment' ? 'Installment' : inq.preferred_payment_method?.replace('_', ' ')}
                          </p>
                        </div>
                        {inq.preferred_payment_method === 'installment' && (
                          <>
                            <div>
                              <p className="text-xs text-gray-400">Downpayment</p>
                              <p className="font-semibold">{formatPrice(inq.downpayment_amount)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-400">Monthly (×12)</p>
                              <p className="font-semibold">{formatPrice(inq.monthly_amount)}</p>
                            </div>
                          </>
                        )}
                      </div>

                      {inq.notes && (
                        <div className="mt-3 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-600">
                          <span className="text-xs text-gray-400 mr-2">Customer note:</span>
                          {inq.notes}
                        </div>
                      )}

                      {inq.admin_notes && !isOpen && (
                        <div className="mt-2 bg-blue-50 rounded-lg px-3 py-2 text-sm text-blue-700">
                          <span className="text-xs text-blue-400 mr-2">Admin note:</span>
                          {inq.admin_notes}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  {canAct && (
                    <div className="flex gap-2 mt-4 flex-wrap">
                      {inq.status === 'pending' && (
                        <button
                          onClick={() => isOpen && actionForm.status === 'approved' ? setExpandedId(null) : openAction(inq, 'approved')}
                          className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-colors ${isOpen && actionForm.status === 'approved' ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'}`}>
                          <FiCheck size={14} /> Approve
                        </button>
                      )}
                      <button
                        onClick={() => isOpen && actionForm.status === 'rejected' ? setExpandedId(null) : openAction(inq, 'rejected')}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-colors ${isOpen && actionForm.status === 'rejected' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'}`}>
                        <FiX size={14} /> Reject
                      </button>
                    </div>
                  )}
                </div>

                {/* Expanded Action Panel */}
                {isOpen && (
                  <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
                    <p className="text-sm font-semibold text-navy-900 mb-2">
                      {actionForm.status === 'approved' ? '✅ Approving inquiry' : '❌ Rejecting inquiry'}
                    </p>
                    <label className="block text-xs text-gray-500 mb-1">Admin Note <span className="text-gray-400">(optional)</span></label>
                    <textarea
                      value={actionForm.admin_notes}
                      onChange={(e) => setActionForm(f => ({ ...f, admin_notes: e.target.value }))}
                      rows={2}
                      className="input-field text-sm resize-none mb-3"
                      placeholder="Add a note to the customer..."
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => submitAction(inq._id)}
                        disabled={processing === inq._id}
                        className={`px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60 transition-colors ${actionForm.status === 'approved' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
                        {processing === inq._id ? 'Saving...' : `Confirm ${actionForm.status === 'approved' ? 'Approval' : 'Rejection'}`}
                      </button>
                      <button onClick={() => setExpandedId(null)} className="px-4 py-2 rounded-lg text-sm font-medium bg-white border border-gray-200 hover:bg-gray-50 text-gray-600">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
