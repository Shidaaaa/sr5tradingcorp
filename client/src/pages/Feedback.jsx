import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import toast from 'react-hot-toast';
import { FiStar, FiSend, FiMessageSquare, FiRotateCcw } from 'react-icons/fi';

const returnStatusClass = {
  pending: 'badge-warning',
  approved: 'badge-info',
  rejected: 'badge-danger',
  completed: 'badge-success',
};

export default function Feedback() {
  const [searchParams] = useSearchParams();
  const [feedbackList, setFeedbackList] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [returnsList, setReturnsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ product_id: '', order_id: '', rating: 5, comment: '', type: 'general' });
  const [returnForm, setReturnForm] = useState({ order_id: '', order_item_id: '', request_type: 'return', reason: '' });

  const selectedReturnOrder = orders.find(o => String(o.id) === String(returnForm.order_id));
  const selectedOrderItems = selectedReturnOrder?.items || [];

  useEffect(() => { fetchFeedback(); fetchProducts(); fetchOrders(); fetchReturns(); }, []);

  useEffect(() => {
    const queryOrderId = searchParams.get('order_id') || '';
    const queryProductId = searchParams.get('product_id') || '';
    if (!queryOrderId && !queryProductId) return;

    setForm(prev => ({
      ...prev,
      product_id: queryProductId || prev.product_id,
      order_id: queryOrderId || prev.order_id,
      type: 'service_review',
    }));
  }, [searchParams]);

  const fetchFeedback = async () => {
    try { setFeedbackList(await api.getFeedback()); } catch {} finally { setLoading(false); }
  };

  const fetchProducts = async () => {
    try { setProducts(await api.getProducts()); } catch {}
  };

  const fetchOrders = async () => {
    try {
      const data = await api.getOrders();
      const now = Date.now();
      const eligible = (data || [])
        .filter(order => ['delivered', 'completed', 'return_requested'].includes(order.status))
        .filter(order => Number(order.total_paid || 0) + 0.01 >= Number(order.total_amount || 0))
        .filter(order => {
          if (!order.customer_received_at) return false;
          const daysSinceReceived = Math.floor((now - new Date(order.customer_received_at).getTime()) / (1000 * 60 * 60 * 24));
          return daysSinceReceived <= 7;
        })
        .map(order => ({
          ...order,
          items: (order.items || []).filter(item => ['parts', 'tools'].includes(item.product_type)),
        }))
        .filter(order => (order.items || []).length > 0);
      setOrders(eligible);
    } catch {}
  };

  const fetchReturns = async () => {
    try {
      const data = await api.getReturns();
      setReturnsList(Array.isArray(data) ? data : []);
    } catch {}
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.submitFeedback({ ...form, product_id: form.product_id || null, order_id: form.order_id || null });
      toast.success('Feedback submitted!');
      setForm({ product_id: '', order_id: '', rating: 5, comment: '', type: 'general' });
      fetchFeedback();
    } catch (err) { toast.error(err.message); }
  };

  const handleReturnSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.submitReturn(returnForm);
      toast.success(`${returnForm.request_type === 'replacement' ? 'Replacement' : 'Return'} request submitted.`);
      setReturnForm({ order_id: '', order_item_id: '', request_type: 'return', reason: '' });
      fetchReturns();
      fetchOrders();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const renderStars = (rating) => (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <FiStar key={i} size={16} className={i <= rating ? 'text-amber-400 fill-amber-400' : 'text-gray-300'} />
      ))}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-navy-900 mb-6">Feedback</h1>

      {/* Submit Feedback Form */}
      <form onSubmit={handleSubmit} className="card p-6 mb-8 space-y-4">
        <h3 className="font-bold text-lg">Share Your Feedback</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Feedback Type</label>
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="input-field">
              <option value="general">General Feedback</option>
              <option value="product_review">Product Review</option>
              <option value="service_review">Service Review</option>
              <option value="suggestion">Suggestion</option>
              <option value="complaint">Complaint</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Select Product (Optional)</label>
            <select value={form.product_id} onChange={e => setForm({ ...form, product_id: e.target.value })} className="input-field">
              <option value="">Choose product...</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Rating</label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(i => (
              <button key={i} type="button" onClick={() => setForm({ ...form, rating: i })} className="p-1">
                <FiStar size={28} className={i <= form.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-300'} />
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Your Feedback *</label>
          <textarea value={form.comment} onChange={e => setForm({ ...form, comment: e.target.value })} className="input-field" rows={4} placeholder="Share your experience, suggestions, or concerns..." required />
        </div>

        <button type="submit" className="btn-primary flex items-center gap-1"><FiSend /> Submit Feedback</button>
      </form>

      {/* Return / Replacement Form */}
      <form onSubmit={handleReturnSubmit} className="card p-6 mb-8 space-y-4">
        <h3 className="font-bold text-lg flex items-center gap-2"><FiRotateCcw /> Return / Replacement Request</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Request Type *</label>
            <select value={returnForm.request_type} onChange={e => setReturnForm(prev => ({ ...prev, request_type: e.target.value }))} className="input-field">
              <option value="return">Return</option>
              <option value="replacement">Replacement</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Order *</label>
            <select
              value={returnForm.order_id}
              onChange={e => setReturnForm(prev => ({ ...prev, order_id: e.target.value, order_item_id: '' }))}
              className="input-field"
              required
            >
              <option value="">Select eligible order...</option>
              {orders.map(order => {
                const categoryNames = [...new Set((order.items || []).map(item => item.category_name).filter(Boolean))];
                const itemNames = (order.items || []).map(item => item.product_name || item.name).filter(Boolean);
                const productLabel = itemNames.length ? itemNames.slice(0, 2).join(', ') : 'No item name';
                const suffix = itemNames.length > 2 ? ` +${itemNames.length - 2} more` : '';
                const categoryLabel = categoryNames.length ? categoryNames.join(' / ') : 'Parts & Tools';
                return (
                  <option key={order.id} value={order.id}>
                    {categoryLabel} - {productLabel}{suffix}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Order Item *</label>
          <select
            value={returnForm.order_item_id}
            onChange={e => setReturnForm(prev => ({ ...prev, order_item_id: e.target.value }))}
            className="input-field"
            disabled={!returnForm.order_id}
            required
          >
            <option value="">Select item...</option>
            {selectedOrderItems.map(item => (
              <option key={item.id} value={item.id}>{item.product_name || item.name} (x{item.quantity})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Reason *</label>
          <textarea
            value={returnForm.reason}
            onChange={e => setReturnForm(prev => ({ ...prev, reason: e.target.value }))}
            className="input-field"
            rows={3}
            placeholder="Describe why you are requesting a return or replacement..."
            required
          />
        </div>

        <button type="submit" className="btn-primary flex items-center gap-1"><FiSend /> Submit Request</button>
      </form>

      {/* Feedback History */}
      <h3 className="font-bold text-lg mb-4">Your Feedback History</h3>
      {loading ? (
        <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-500"></div></div>
      ) : feedbackList.length === 0 ? (
        <div className="card p-8 text-center">
          <FiMessageSquare size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">No feedback submitted yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {feedbackList.map(f => (
            <div key={f.id} className="card p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <span className="badge badge-info capitalize">{f.type.replace('_', ' ')}</span>
                  {f.product_name && <span className="text-sm text-gray-500 ml-2">{f.product_name}</span>}
                </div>
                {f.rating && renderStars(f.rating)}
              </div>
              <p className="text-gray-700">{f.comment}</p>
              <p className="text-xs text-gray-400 mt-2">{new Date(f.created_at).toLocaleDateString()}</p>
              {f.admin_response && (
                <div className="mt-3 p-3 bg-blue-50 rounded-lg text-sm">
                  <p className="font-medium text-blue-800">Admin Response:</p>
                  <p className="text-blue-700">{f.admin_response}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <h3 className="font-bold text-lg mt-10 mb-4">Your Return & Replacement Requests</h3>
      {returnsList.length === 0 ? (
        <div className="card p-8 text-center">
          <FiRotateCcw size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">No return or replacement requests yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {returnsList.map(r => (
            <div key={r.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`badge ${r.request_type === 'replacement' ? 'badge-info' : 'badge-warning'}`}>{r.request_type}</span>
                    <span className={`badge ${returnStatusClass[r.status] || 'badge-gray'}`}>{r.status}</span>
                  </div>
                  <p className="text-sm text-gray-600">Order {r.order_number} • {r.product_name || 'Item'} {r.quantity ? `(x${r.quantity})` : ''}</p>
                  <p className="text-sm text-gray-700 mt-2"><strong>Reason:</strong> {r.reason}</p>
                </div>
                <p className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString()}</p>
              </div>
              {r.admin_notes && (
                <div className="mt-3 p-3 bg-blue-50 rounded-lg text-sm">
                  <p className="font-medium text-blue-800">Admin Notes:</p>
                  <p className="text-blue-700">{r.admin_notes}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
