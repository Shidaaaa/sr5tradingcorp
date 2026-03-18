import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { FiEye, FiCheck, FiTruck, FiX, FiSearch } from 'react-icons/fi';
import Pagination from '../../components/Pagination';
import SortHeader from '../../components/SortHeader';

const formatPrice = (price) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(price);

const statusConfig = {
  pending: { color: 'badge-warning', label: 'Pending' },
  confirmed: { color: 'badge-info', label: 'Confirmed' },
  processing: { color: 'badge-info', label: 'Processing' },
  ready: { color: 'badge-success', label: 'Ready' },
  picked_up: { color: 'badge-success', label: 'Picked Up' },
  in_transit: { color: 'badge-info', label: 'In Transit' },
  delivered: { color: 'badge-success', label: 'Delivered' },
  completed: { color: 'badge-success', label: 'Completed' },
  cancelled: { color: 'badge-danger', label: 'Cancelled' },
  return_requested: { color: 'badge-warning', label: 'Return Req.' },
  returned: { color: 'badge-gray', label: 'Returned' },
  replaced: { color: 'badge-purple', label: 'Replaced' },
  installment_active: { color: 'badge-info', label: 'Installment Active' },
  installment_defaulted: { color: 'badge-danger', label: 'Installment Defaulted' },
};

const statusFlow = ['pending', 'confirmed', 'processing', 'ready', 'picked_up', 'in_transit', 'delivered', 'installment_active', 'installment_defaulted', 'completed', 'cancelled'];

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [showSetupPaymentModal, setShowSetupPaymentModal] = useState(false);
  const [setupMode, setSetupMode] = useState('full');
  const [paymentForm, setPaymentForm] = useState({ amount: '', payment_method: 'cash', reference_number: '' });
  const [installmentPayMethod, setInstallmentPayMethod] = useState('cash');
  const [installmentReference, setInstallmentReference] = useState('');
  const [fullPaymentReceiptFile, setFullPaymentReceiptFile] = useState(null);
  const [installmentReceiptFile, setInstallmentReceiptFile] = useState(null);
  const [showInstallmentRecordModal, setShowInstallmentRecordModal] = useState(false);
  const [selectedInstallmentRow, setSelectedInstallmentRow] = useState(null);
  const [modalInstallmentPayMethod, setModalInstallmentPayMethod] = useState('cash');
  const [modalInstallmentReference, setModalInstallmentReference] = useState('');
  const [modalInstallmentReceiptFile, setModalInstallmentReceiptFile] = useState(null);
  const [recordingInstallment, setRecordingInstallment] = useState(false);

  const uploadReceiptBeforeRecord = async (file) => {
    if (!file) {
      throw new Error('Please upload receipt proof before recording payment.');
    }
    const uploaded = await api.uploadAdminPaymentReceipt(file);
    return uploaded.receipt_image_url;
  };

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir(field === 'created_at' ? 'desc' : 'asc'); }
    setCurrentPage(1);
  };

  useEffect(() => { fetchOrders(); }, []);

  const fetchOrders = async () => {
    try { setOrders(await api.getAdminOrders()); } catch {} finally { setLoading(false); }
  };

  const refreshSelected = async (orderId = selected?.id) => {
    if (!orderId) return;
    const fresh = await api.getAdminOrders();
    setOrders(fresh);
    const found = fresh.find(o => o.id === orderId);
    setSelected(found || null);
  };

  const updateStatus = async (orderId, status) => {
    try {
      await api.updateAdminOrderStatus(orderId, { status });
      toast.success(`Order ${status}`);
      await refreshSelected(orderId);
      setSelected(null);
    } catch (err) { toast.error(err.message); }
  };

  const openSetupPayment = () => {
    if (!selected) return;
    setPaymentForm({
      amount: selected.remaining_balance || 0,
      payment_method: 'cash',
      reference_number: '',
    });
    setSetupMode('full');
    setFullPaymentReceiptFile(null);
    setShowSetupPaymentModal(true);
  };

  const handleRecordFullPayment = async (e) => {
    e.preventDefault();
    if (!selected) return;
    try {
      const receiptImageUrl = await uploadReceiptBeforeRecord(fullPaymentReceiptFile);
      await api.recordAdminOrderPayment(selected.id, {
        payment_type: 'full',
        amount: Number(paymentForm.amount),
        payment_method: paymentForm.payment_method,
        reference_number: paymentForm.reference_number || null,
        receipt_image_url: receiptImageUrl,
      });
      toast.success('Full payment recorded.');
      setShowSetupPaymentModal(false);
      setFullPaymentReceiptFile(null);
      await refreshSelected(selected.id);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleCreateInstallment = async () => {
    if (!selected) return;
    try {
      await api.setupInstallmentPlan(selected.id, {});
      toast.success('Installment plan created. Record down payment to activate monthly schedule.');
      setShowSetupPaymentModal(false);
      await refreshSelected(selected.id);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleRecordDownPayment = async () => {
    if (!selected?.installment_plan) return;
    try {
      const receiptImageUrl = await uploadReceiptBeforeRecord(installmentReceiptFile);
      await api.recordAdminOrderPayment(selected.id, {
        payment_type: 'down_payment',
        amount: Number(selected.installment_plan.down_payment_amount),
        payment_method: installmentPayMethod,
        reference_number: installmentReference || null,
        receipt_image_url: receiptImageUrl,
      });
      toast.success('Down payment recorded.');
      setInstallmentReference('');
      setInstallmentReceiptFile(null);
      await refreshSelected(selected.id);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const openInstallmentRecordModal = (row) => {
    if (!row) return;
    setSelectedInstallmentRow(row);
    setModalInstallmentPayMethod(installmentPayMethod || 'cash');
    setModalInstallmentReference('');
    setModalInstallmentReceiptFile(null);
    setShowInstallmentRecordModal(true);
  };

  const handleRecordInstallment = async () => {
    if (!selected?.installment_plan || !selectedInstallmentRow) return;
    try {
      setRecordingInstallment(true);
      const receiptImageUrl = await uploadReceiptBeforeRecord(modalInstallmentReceiptFile);
      const dueLeft = Number((selectedInstallmentRow.amount_due || 0) - (selectedInstallmentRow.amount_paid || 0));
      if (dueLeft <= 0) {
        toast.error('This row has no remaining due amount.');
        setRecordingInstallment(false);
        return;
      }
      await api.recordInstallmentPayment(selected.installment_plan.id, {
        installment_number: selectedInstallmentRow.installment_number,
        amount: dueLeft,
        payment_method: modalInstallmentPayMethod,
        reference_number: modalInstallmentReference || null,
        receipt_image_url: receiptImageUrl,
      });
      toast.success(`Installment ${selectedInstallmentRow.installment_number} payment recorded.`);
      setInstallmentReference('');
      setInstallmentReceiptFile(null);
      setShowInstallmentRecordModal(false);
      setSelectedInstallmentRow(null);
      setModalInstallmentReference('');
      setModalInstallmentReceiptFile(null);
      await refreshSelected(selected.id);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRecordingInstallment(false);
    }
  };

  const processed = useMemo(() => {
    let list = [...orders];
    if (filter !== 'all') list = list.filter(o => o.status === filter);
    if (search) list = list.filter(o => `${o.order_number} ${o.first_name} ${o.last_name} ${o.email}`.toLowerCase().includes(search.toLowerCase()));
    list.sort((a, b) => {
      let va = a[sortField], vb = b[sortField];
      if (sortField === 'created_at') { va = new Date(va); vb = new Date(vb); }
      if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb || '').toLowerCase(); }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [orders, filter, search, sortField, sortDir]);

  const totalPages = Math.ceil(processed.length / itemsPerPage);
  const paginated = processed.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-500"></div></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-navy-900">Orders Management</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search orders..." value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} className="input-field pl-10" />
        </div>
        <select value={filter} onChange={e => { setFilter(e.target.value); setCurrentPage(1); }} className="input-field w-auto">
          <option value="all">All Orders</option>
          {Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <div className="table-container">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50 text-left">
              <th className="px-4 py-3"><SortHeader label="Order #" field="order_number" sortField={sortField} sortDir={sortDir} onSort={handleSort} /></th>
              <th className="px-4 py-3"><SortHeader label="Customer" field="first_name" sortField={sortField} sortDir={sortDir} onSort={handleSort} /></th>
              <th className="px-4 py-3 font-medium">Items</th>
              <th className="px-4 py-3"><SortHeader label="Total" field="total_amount" sortField={sortField} sortDir={sortDir} onSort={handleSort} /></th>
              <th className="px-4 py-3 font-medium">Paid</th>
              <th className="px-4 py-3 font-medium">Balance</th>
              <th className="px-4 py-3 font-medium">Delivery</th>
              <th className="px-4 py-3"><SortHeader label="Status" field="status" sortField={sortField} sortDir={sortDir} onSort={handleSort} /></th>
              <th className="px-4 py-3"><SortHeader label="Date" field="created_at" sortField={sortField} sortDir={sortDir} onSort={handleSort} /></th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr></thead>
            <tbody>
              {paginated.map(order => {
                const sc = statusConfig[order.status] || { color: 'badge-gray', label: order.status };
                return (
                  <tr key={order.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono font-medium text-accent-600">{order.order_number}</td>
                    <td className="px-4 py-3">{order.first_name} {order.last_name}<br /><span className="text-xs text-gray-500">{order.email}</span></td>
                    <td className="px-4 py-3">{order.items?.length || 0}</td>
                    <td className="px-4 py-3 font-medium">{formatPrice(order.total_amount)}</td>
                    <td className="px-4 py-3 text-green-600">{formatPrice(order.total_paid)}</td>
                    <td className="px-4 py-3">{order.remaining_balance > 0 ? <span className="text-amber-600 font-medium">{formatPrice(order.remaining_balance)}</span> : <span className="text-green-600">Paid</span>}</td>
                    <td className="px-4 py-3">{order.has_vehicle ? 'Pickup (Vehicle Policy)' : order.delivery_method === 'third_party' ? '3rd-Party Delivery' : order.delivery_method === 'delivery' ? 'Delivery' : 'Pickup'}</td>
                    <td className="px-4 py-3"><span className={`badge ${sc.color}`}>{sc.label}</span></td>
                    <td className="px-4 py-3 text-gray-500">{new Date(order.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => setSelected(selected?.id === order.id ? null : order)} className="p-1.5 hover:bg-gray-100 rounded" title="Details"><FiEye size={14} /></button>
                        {order.status === 'pending' && <button onClick={() => updateStatus(order.id, 'confirmed')} className="p-1.5 hover:bg-green-50 text-green-600 rounded" title="Confirm"><FiCheck size={14} /></button>}
                        {order.status === 'pending' && <button onClick={() => updateStatus(order.id, 'cancelled')} className="p-1.5 hover:bg-red-50 text-red-600 rounded" title="Cancel"><FiX size={14} /></button>}
                        {['confirmed', 'processing'].includes(order.status) && ['delivery', 'third_party'].includes(order.delivery_method) && (
                          <button onClick={() => updateStatus(order.id, 'ready')} className="p-1.5 hover:bg-blue-50 text-blue-600 rounded" title="Mark Ready for Rider"><FiTruck size={14} /></button>
                        )}
                        {order.status === 'ready' && ['delivery', 'third_party'].includes(order.delivery_method) && (
                          <button onClick={() => updateStatus(order.id, 'picked_up')} className="p-1.5 hover:bg-indigo-50 text-indigo-600 rounded" title="Mark Picked Up"><FiTruck size={14} /></button>
                        )}
                        {order.status === 'picked_up' && ['delivery', 'third_party'].includes(order.delivery_method) && (
                          <button onClick={() => updateStatus(order.id, 'in_transit')} className="p-1.5 hover:bg-purple-50 text-purple-600 rounded" title="Mark In Transit"><FiTruck size={14} /></button>
                        )}
                        {order.status === 'in_transit' && ['delivery', 'third_party'].includes(order.delivery_method) && (
                          <button onClick={() => updateStatus(order.id, 'delivered')} className="p-1.5 hover:bg-emerald-50 text-emerald-700 rounded" title="Mark Delivered"><FiCheck size={14} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} totalItems={processed.length} itemsPerPage={itemsPerPage} onItemsPerPageChange={v => { setItemsPerPage(v); setCurrentPage(1); }} />
      </div>

      {/* Order Detail Panel */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSelected(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl p-6 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto space-y-4">
            <h3 className="text-lg font-bold">Order {selected.order_number}</h3>
            <div className="text-sm space-y-2">
              <p><strong>Customer:</strong> {selected.first_name} {selected.last_name} ({selected.email})</p>
              <p><strong>Delivery:</strong> {selected.has_vehicle ? 'Pickup (Vehicle Policy)' : selected.delivery_method === 'third_party' ? '3rd-Party Delivery' : selected.delivery_method === 'delivery' ? 'Delivery' : 'Pickup'} {selected.delivery_address && !selected.has_vehicle && `- ${selected.delivery_address}`}</p>
              {selected.has_vehicle && <p><strong>Policy:</strong> Vehicle orders are pickup only.</p>}
              {selected.delivery_contact_name && <p><strong>Receiver:</strong> {selected.delivery_contact_name} ({selected.delivery_contact_phone || 'No phone'})</p>}
              {selected.customer_delivery_platform && <p><strong>Courier:</strong> {selected.customer_delivery_platform}</p>}
              {selected.customer_delivery_reference && <p><strong>Courier Ref:</strong> {selected.customer_delivery_reference}</p>}
              {selected.customer_received_at && <p><strong>Customer Received:</strong> {new Date(selected.customer_received_at).toLocaleString()}</p>}
              <p><strong>Total:</strong> {formatPrice(selected.total_amount)} | <strong>Paid:</strong> {formatPrice(selected.total_paid)}</p>
            </div>
            <div>
              <h4 className="font-medium mb-2">Items:</h4>
              {selected.items?.map(item => (
                <div key={item.id} className="flex justify-between p-2 bg-gray-50 rounded mb-1 text-sm">
                  <span>{item.name} × {item.quantity}</span>
                  <span className="font-medium">{formatPrice(item.subtotal)}</span>
                </div>
              ))}
            </div>
            {selected.payments?.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Payments:</h4>
                {selected.payments.map(p => (
                  <div key={p.id} className="flex justify-between p-2 bg-green-50 rounded mb-1 text-sm">
                    <span className="capitalize">{p.payment_method.replace('_', ' ')} ({p.payment_type})</span>
                    <span className="font-medium text-green-700">{formatPrice(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {selected.has_vehicle && selected.reservation_fee_paid && selected.remaining_balance > 0 && !selected.installment_plan && (
              <div className="rounded-lg border border-accent-200 bg-accent-50 p-3 text-sm">
                <p className="font-medium text-accent-800">Reservation is paid. Settle payment at store.</p>
                <p className="text-accent-700 mt-1">Choose full settlement or create an installment plan.</p>
                <button onClick={openSetupPayment} className="btn-primary btn-sm mt-2">Setup Payment</button>
              </div>
            )}

            {selected.installment_plan && (
              <div className="space-y-3">
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
                  <p><strong>Installment Status:</strong> <span className="capitalize">{selected.installment_plan.status}</span></p>
                  <p><strong>Down Payment:</strong> {formatPrice(selected.installment_plan.down_payment_amount)}</p>
                  <p><strong>Monthly Amount:</strong> {formatPrice(selected.installment_plan.monthly_amount)} × {selected.installment_plan.number_of_installments}</p>
                  <p><strong>Total with Interest:</strong> {formatPrice(selected.installment_plan.total_with_interest)}</p>
                </div>

                {!selected.installment_plan.down_payment_paid && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm space-y-2">
                    <p className="font-medium text-amber-800">Record Down Payment</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <select value={installmentPayMethod} onChange={e => setInstallmentPayMethod(e.target.value)} className="input-field">
                        <option value="cash">Cash</option>
                        <option value="bank_transfer">Bank Transfer</option>
                        <option value="credit_card">Credit Card</option>
                        <option value="debit_card">Debit Card</option>
                      </select>
                      <input value={installmentReference} onChange={e => setInstallmentReference(e.target.value)} className="input-field" placeholder="Reference # (optional)" />
                      <button onClick={handleRecordDownPayment} className="btn-primary btn-sm">Record {formatPrice(selected.installment_plan.down_payment_amount)}</button>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-amber-900 mb-1">Upload Receipt Proof (required)</label>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={e => setInstallmentReceiptFile(e.target.files?.[0] || null)}
                        className="input-field"
                      />
                      {installmentReceiptFile && <p className="text-xs text-amber-800 mt-1">Selected: {installmentReceiptFile.name}</p>}
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="font-medium mb-2">Installment Tracker</h4>
                  <div className="space-y-1">
                    {selected.installment_plan.schedule?.map(row => {
                      const badge = row.status === 'paid'
                        ? 'bg-green-100 text-green-700'
                        : row.status === 'overdue'
                          ? 'bg-red-100 text-red-700'
                          : row.status === 'partially_paid'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-gray-100 text-gray-700';
                      const statusLabel = row.status === 'paid'
                        ? 'Paid'
                        : row.status === 'overdue'
                          ? 'Overdue'
                          : row.status === 'partially_paid'
                            ? 'Partially Paid'
                            : 'Pending';

                      return (
                        <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 p-2 bg-gray-50 rounded text-sm">
                          <div>
                            <p className="font-medium">Month {row.installment_number} • Due {new Date(row.due_date).toLocaleDateString()}</p>
                            <p className="text-gray-600">Due: {formatPrice(row.amount_due)} • Paid: {formatPrice(row.amount_paid || 0)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${badge}`}>{statusLabel}</span>
                            {row.status !== 'paid' && selected.installment_plan.down_payment_paid && (
                              <button onClick={() => openInstallmentRecordModal(row)} className="btn-primary btn-sm">Record Payment</button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            <div>
              <h4 className="font-medium mb-2">Update Status:</h4>
              <div className="flex flex-wrap gap-2">
                {statusFlow.map(s => (
                  <button key={s} onClick={() => updateStatus(selected.id, s)} className={`btn-sm rounded-lg text-xs ${selected.status === s ? 'btn-primary' : 'btn-secondary'}`}>{statusConfig[s]?.label || s}</button>
                ))}
              </div>
            </div>
            <button onClick={() => setSelected(null)} className="btn-secondary w-full">Close</button>
          </div>
        </div>
      )}

      {showInstallmentRecordModal && selectedInstallmentRow && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50" onClick={() => setShowInstallmentRecordModal(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl p-6 w-full max-w-md mx-4 space-y-4">
            <h3 className="text-lg font-bold">Record Installment Payment</h3>
            <p className="text-sm text-gray-600">
              Month {selectedInstallmentRow.installment_number} • Due {new Date(selectedInstallmentRow.due_date).toLocaleDateString()}
            </p>
            <p className="text-sm font-medium text-gray-700">
              Amount to record: {formatPrice(Number((selectedInstallmentRow.amount_due || 0) - (selectedInstallmentRow.amount_paid || 0)))}
            </p>

            <div>
              <label className="block text-sm font-medium mb-1">Payment Method</label>
              <select value={modalInstallmentPayMethod} onChange={e => setModalInstallmentPayMethod(e.target.value)} className="input-field">
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="credit_card">Credit Card</option>
                <option value="debit_card">Debit Card</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Reference # (optional for cash)</label>
              <input value={modalInstallmentReference} onChange={e => setModalInstallmentReference(e.target.value)} className="input-field" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Upload Receipt Proof (required)</label>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={e => setModalInstallmentReceiptFile(e.target.files?.[0] || null)}
                className="input-field"
              />
              {modalInstallmentReceiptFile && <p className="text-xs text-gray-600 mt-1">Selected: {modalInstallmentReceiptFile.name}</p>}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowInstallmentRecordModal(false);
                  setSelectedInstallmentRow(null);
                  setModalInstallmentReference('');
                  setModalInstallmentReceiptFile(null);
                }}
                className="btn-secondary flex-1"
                disabled={recordingInstallment}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRecordInstallment}
                className="btn-primary flex-1"
                disabled={recordingInstallment}
              >
                {recordingInstallment ? 'Recording...' : 'Confirm Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSetupPaymentModal && selected && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => setShowSetupPaymentModal(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl p-6 w-full max-w-lg mx-4 space-y-4">
            <h3 className="text-lg font-bold">Setup Payment • {selected.order_number}</h3>
            <div className="flex gap-2">
              <button onClick={() => setSetupMode('full')} className={`btn-sm ${setupMode === 'full' ? 'btn-primary' : 'btn-secondary'}`}>Record Full Payment</button>
              <button onClick={() => setSetupMode('installment')} className={`btn-sm ${setupMode === 'installment' ? 'btn-primary' : 'btn-secondary'}`}>Setup Installment Plan</button>
            </div>

            {setupMode === 'full' ? (
              <form onSubmit={handleRecordFullPayment} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Amount</label>
                  <input type="number" step="0.01" value={paymentForm.amount} onChange={e => setPaymentForm(prev => ({ ...prev, amount: e.target.value }))} className="input-field" required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Payment Method</label>
                  <select value={paymentForm.payment_method} onChange={e => setPaymentForm(prev => ({ ...prev, payment_method: e.target.value }))} className="input-field">
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="credit_card">Credit Card</option>
                    <option value="debit_card">Debit Card</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Reference # (optional)</label>
                  <input value={paymentForm.reference_number} onChange={e => setPaymentForm(prev => ({ ...prev, reference_number: e.target.value }))} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Upload Receipt Proof (required)</label>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={e => setFullPaymentReceiptFile(e.target.files?.[0] || null)}
                    className="input-field"
                    required
                  />
                  {fullPaymentReceiptFile && <p className="text-xs text-gray-600 mt-1">Selected: {fullPaymentReceiptFile.name}</p>}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowSetupPaymentModal(false)} className="btn-secondary flex-1">Cancel</button>
                  <button type="submit" className="btn-primary flex-1">Record Payment</button>
                </div>
              </form>
            ) : (
              <div className="space-y-3 text-sm">
                <p>This will create a fixed plan based on the order remaining balance:</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>50% down payment</li>
                  <li>12 monthly installments</li>
                  <li>1% monthly interest</li>
                </ul>
                <div className="flex gap-2">
                  <button onClick={() => setShowSetupPaymentModal(false)} className="btn-secondary flex-1">Cancel</button>
                  <button onClick={handleCreateInstallment} className="btn-primary flex-1">Create Installment Plan</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
