import { useState, useEffect } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { FiMessageSquare, FiStar, FiSend } from 'react-icons/fi';

export default function AdminFeedback() {
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [response, setResponse] = useState({});
  const [filter, setFilter] = useState('all');

  useEffect(() => { fetchFeedback(); }, []);

  const fetchFeedback = async () => {
    try { const d = await api.getAdminFeedback(); setFeedbacks(d); } catch {} finally { setLoading(false); }
  };

  const handleRespond = async (id) => {
    if (!response[id]?.trim()) return;
    try {
      await api.respondFeedback(id, { admin_response: response[id] });
      toast.success('Response sent');
      setResponse(prev => ({ ...prev, [id]: '' }));
      fetchFeedback();
    } catch (err) { toast.error(err.message); }
  };

  const filtered = filter === 'all' ? feedbacks : filter === 'pending' ? feedbacks.filter(f => !f.admin_response) : feedbacks.filter(f => f.admin_response);
  const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-500"></div></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-navy-900">Customer Feedback</h1>
        <div className="flex gap-2">
          {['all', 'pending', 'responded'].map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`btn-sm capitalize ${filter === f ? 'btn-primary' : 'btn-secondary'}`}>
              {f} {f === 'pending' ? `(${feedbacks.filter(x => !x.admin_response).length})` : ''}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {filtered.map(fb => (
          <div key={fb.id} className="card">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-medium">{fb.first_name} {fb.last_name}</span>
                  <span className="badge badge-info capitalize">{fb.type}</span>
                  {fb.product_name && <span className="text-sm text-gray-500">Re: {fb.product_name}</span>}
                </div>
                <div className="flex items-center gap-1 text-amber-400 mb-2">{stars(fb.rating)}<span className="text-gray-500 text-sm ml-1">{fb.rating}/5</span></div>
              </div>
              <span className="text-xs text-gray-400">{new Date(fb.created_at).toLocaleDateString()}</span>
            </div>

            <p className="text-gray-700 mb-3">{fb.message}</p>

            {fb.admin_response ? (
              <div className="bg-accent-50 rounded-lg p-3 border-l-4 border-accent-500">
                <p className="text-xs font-medium text-accent-700 mb-1">Admin Response:</p>
                <p className="text-sm text-gray-700">{fb.admin_response}</p>
              </div>
            ) : (
              <div className="flex gap-2">
                <input type="text" value={response[fb.id] || ''} onChange={e => setResponse(prev => ({ ...prev, [fb.id]: e.target.value }))} placeholder="Type your response..." className="input-field flex-1" />
                <button onClick={() => handleRespond(fb.id)} className="btn-primary btn-sm flex items-center gap-1"><FiSend size={14} /> Reply</button>
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && <p className="text-center text-gray-400 py-10">No feedback found.</p>}
      </div>
    </div>
  );
}
