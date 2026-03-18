import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import toast from 'react-hot-toast';
import { FiStar, FiSend, FiMessageSquare } from 'react-icons/fi';

export default function Feedback() {
  const [searchParams] = useSearchParams();
  const [feedbackList, setFeedbackList] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ product_id: '', order_id: '', rating: 5, comment: '', type: 'general' });

  useEffect(() => { fetchFeedback(); fetchProducts(); }, []);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.submitFeedback({ ...form, product_id: form.product_id || null, order_id: form.order_id || null });
      toast.success('Feedback submitted!');
      setForm({ product_id: '', order_id: '', rating: 5, comment: '', type: 'general' });
      fetchFeedback();
    } catch (err) { toast.error(err.message); }
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
    </div>
  );
}
