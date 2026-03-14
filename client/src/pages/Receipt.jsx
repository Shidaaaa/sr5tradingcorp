import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api';
import { FiPrinter, FiArrowLeft } from 'react-icons/fi';

const formatPrice = (price) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(price);

export default function Receipt() {
  const { receiptNumber } = useParams();
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchReceipt(); }, [receiptNumber]);

  const fetchReceipt = async () => {
    try { setReceipt(await api.getReceipt(receiptNumber)); } catch {} finally { setLoading(false); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-500"></div></div>;
  if (!receipt) return <div className="text-center py-20"><p className="text-gray-500">Receipt not found</p></div>;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <Link to="/orders" className="inline-flex items-center gap-1 text-accent-600"><FiArrowLeft /> Back</Link>
        <button onClick={() => window.print()} className="btn-secondary btn-sm flex items-center gap-1"><FiPrinter /> Print</button>
      </div>

      <div className="card p-8 print:shadow-none print:border-none" id="receipt">
        <div className="text-center mb-6 border-b pb-6">
          <div className="w-16 h-16 bg-navy-900 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <span className="text-white font-bold text-xl">SR-5</span>
          </div>
          <h1 className="text-xl font-bold">SR-5 Trading Corporation</h1>
          <p className="text-sm text-gray-500">Official Payment Receipt</p>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm mb-6">
          <div><span className="text-gray-500">Receipt No:</span><p className="font-mono font-bold">{receipt.receipt_number}</p></div>
          <div><span className="text-gray-500">Date:</span><p className="font-medium">{new Date(receipt.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</p></div>
          <div><span className="text-gray-500">Customer:</span><p className="font-medium">{receipt.first_name} {receipt.last_name}</p></div>
          <div><span className="text-gray-500">Email:</span><p className="font-medium">{receipt.email}</p></div>
          {receipt.order_number && <div><span className="text-gray-500">Order No:</span><p className="font-medium">{receipt.order_number}</p></div>}
          {receipt.booking_number && <div><span className="text-gray-500">Booking No:</span><p className="font-medium">{receipt.booking_number}</p></div>}
        </div>

        {receipt.order_items?.length > 0 && (
          <div className="mb-6">
            <h3 className="font-bold mb-3">Order Items</h3>
            <table className="w-full text-sm">
              <thead><tr className="border-b"><th className="text-left py-2">Item</th><th className="text-right py-2">Qty</th><th className="text-right py-2">Price</th><th className="text-right py-2">Subtotal</th></tr></thead>
              <tbody>
                {receipt.order_items.map(item => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="py-2">{item.name}</td>
                    <td className="text-right">{item.quantity}</td>
                    <td className="text-right">{formatPrice(item.unit_price)}</td>
                    <td className="text-right font-medium">{formatPrice(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t pt-4 space-y-2">
          {receipt.order_total && (
            <div className="flex justify-between text-sm"><span className="text-gray-500">Order Total:</span><span>{formatPrice(receipt.order_total)}</span></div>
          )}
          <div className="flex justify-between text-sm"><span className="text-gray-500">Payment Method:</span><span className="capitalize">{receipt.payment_method?.replace('_', ' ')}</span></div>
          <div className="flex justify-between text-sm"><span className="text-gray-500">Payment Type:</span><span className="capitalize">{receipt.payment_type}</span></div>
          {receipt.installment_number && (
            <div className="flex justify-between text-sm"><span className="text-gray-500">Installment:</span><span>{receipt.installment_number} of {receipt.total_installments}</span></div>
          )}
          <hr />
          <div className="flex justify-between text-lg font-bold">
            <span>Amount Paid:</span>
            <span className="text-accent-600">{formatPrice(receipt.amount)}</span>
          </div>
          {receipt.remaining_balance > 0 && (
            <div className="flex justify-between text-sm text-amber-600 font-medium">
              <span>Remaining Balance:</span>
              <span>{formatPrice(receipt.remaining_balance)}</span>
            </div>
          )}
        </div>

        <div className="mt-8 text-center text-xs text-gray-400 border-t pt-4">
          <p>Thank you for your purchase!</p>
          <p>SR-5 Trading Corporation | info@sr5trading.com | +63 917 123 4567</p>
        </div>
      </div>
    </div>
  );
}
