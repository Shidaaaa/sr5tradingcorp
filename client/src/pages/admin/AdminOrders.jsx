import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import toast from 'react-hot-toast';
import { FiEye, FiCheck, FiTruck, FiX, FiSearch, FiCreditCard, FiUsers } from 'react-icons/fi';
import Pagination from '../../components/Pagination';
import SortHeader from '../../components/SortHeader';

const formatPrice = (price) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(price);

const statusConfig = {
  pending: { color: 'badge-warning', label: 'Pending' },
  confirmed: { color: 'badge-info', label: 'Confirmed' },
  processing: { color: 'badge-info', label: 'Processing' },
  ready: { color: 'badge-success', label: 'Ready' },
  picked_up: { color: 'badge-success', label: 'Picked Up' },
  delivered: { color: 'badge-success', label: 'Delivered' },
  completed: { color: 'badge-success', label: 'Completed' },
  cancelled: { color: 'badge-danger', label: 'Cancelled' },
  return_requested: { color: 'badge-warning', label: 'Return Req.' },
  returned: { color: 'badge-gray', label: 'Returned' },
  replaced: { color: 'badge-purple', label: 'Replaced' },
};

const statusFlow = ['pending', 'confirmed', 'processing', 'ready', 'picked_up', 'delivered', 'completed', 'cancelled'];

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
  const [pickupForm, setPickupForm] = useState({ amount: '', payment_method: 'gcash', reference_number: '' });
  const [orderPaymentForm, setOrderPaymentForm] = useState({ amount: '', payment_method: 'cash', reference_number: '' });
  const [installmentClients, setInstallmentClients] = useState([]);

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir(field === 'created_at' ? 'desc' : 'asc'); }
    setCurrentPage(1);
  };

  useEffect(() => {
    fetchOrders();
    fetchInstallmentClients();
  }, []);

  useEffect(() => {
    if (!selected) return;
    setPickupForm({
      amount: String(selected.pickup_balance_due || selected.remaining_balance || ''),
      payment_method: selected.vehicle_payment_method === 'installment' ? 'installment' : 'gcash',
      reference_number: '',
    });
    setOrderPaymentForm({
      amount: String(selected.remaining_balance || ''),
      payment_method: 'cash',
      reference_number: '',
    });
  }, [selected]);

  const fetchOrders = async () => {
    try { setOrders(await api.getAdminOrders()); } catch {} finally { setLoading(false); }
  };

  const fetchInstallmentClients = async () => {
    try {
      setInstallmentClients(await api.getAdminInstallmentClients());
    } catch {
      setInstallmentClients([]);
    }
  };

  const updateStatus = async (orderId, status) => {
    try {
      await api.updateAdminOrderStatus(orderId, { status });
      toast.success(`Order ${status}`);
      fetchOrders();
      fetchInstallmentClients();
      setSelected(null);
    } catch (err) { toast.error(err.message); }
  };

  const recordPickupPayment = async () => {
    if (!selected) return;
    try {
      await api.recordAdminPickupPayment(selected.id, {
        amount: Number(pickupForm.amount),
        payment_method: pickupForm.payment_method,
        reference_number: pickupForm.reference_number || null,
      });
      toast.success('Pickup payment recorded');
      setPickupForm({ amount: '', payment_method: 'gcash', reference_number: '' });
      const refreshed = await api.getAdminOrders();
      setOrders(refreshed);
      setSelected(refreshed.find(order => order.id === selected.id) || null);
      fetchInstallmentClients();
    } catch (err) { toast.error(err.message); }
  };

  const markInstallmentPaid = async (installmentNumber) => {
    if (!selected) return;
    try {
      await api.markAdminInstallmentPaid(selected.id, installmentNumber);
      toast.success(`Installment ${installmentNumber} marked as paid`);
      const refreshed = await api.getAdminOrders();
      setOrders(refreshed);
      setSelected(refreshed.find(order => order.id === selected.id) || null);
      fetchInstallmentClients();
    } catch (err) { toast.error(err.message); }
  };

  const markOrderPaid = async () => {
    if (!selected) return;
    try {
      await api.markAdminOrderPaid(selected.id, {
        amount: Number(orderPaymentForm.amount),
        payment_method: orderPaymentForm.payment_method,
        reference_number: orderPaymentForm.reference_number || null,
      });
      toast.success('Order payment recorded');
      const refreshed = await api.getAdminOrders();
      setOrders(refreshed);
      setSelected(refreshed.find(order => order.id === selected.id) || null);
      fetchInstallmentClients();
    } catch (err) { toast.error(err.message); }
  };

  const markFullBalancePaid = async () => {
    if (!selected) return;
    try {
      await api.markAdminOrderPaid(selected.id, {
        amount: Number(selected.remaining_balance || 0),
        payment_method: 'cash',
        reference_number: null,
      });
      toast.success('Full balance marked as paid');
      const refreshed = await api.getAdminOrders();
      setOrders(refreshed);
      setSelected(refreshed.find(order => order.id === selected.id) || null);
      fetchInstallmentClients();
    } catch (err) { toast.error(err.message); }
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
                    <td className="px-4 py-3">
                      {order.remaining_balance > 0 ? <span className="text-amber-600 font-medium">{formatPrice(order.remaining_balance)}</span> : <span className="text-green-600">Paid</span>}
                      {order.has_vehicle && <div className={`text-xs mt-1 ${order.pickup_clearance_met ? 'text-green-600' : 'text-amber-600'}`}>{order.pickup_clearance_met ? 'Pickup cleared' : 'Pickup blocked'}</div>}
                    </td>
                    <td className="px-4 py-3 capitalize">{order.delivery_method}</td>
                    <td className="px-4 py-3"><span className={`badge ${sc.color}`}>{sc.label}</span></td>
                    <td className="px-4 py-3 text-gray-500">{new Date(order.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => setSelected(selected?.id === order.id ? null : order)} className="p-1.5 hover:bg-gray-100 rounded" title="Details"><FiEye size={14} /></button>
                        {order.status === 'pending' && <button onClick={() => updateStatus(order.id, 'confirmed')} className="p-1.5 hover:bg-green-50 text-green-600 rounded" title="Confirm"><FiCheck size={14} /></button>}
                        {order.status === 'pending' && <button onClick={() => updateStatus(order.id, 'cancelled')} className="p-1.5 hover:bg-red-50 text-red-600 rounded" title="Cancel"><FiX size={14} /></button>}
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

      {/* Installment Clients Tracker */}
      <div className="card mt-6">
        <div className="flex items-center gap-2 mb-4">
          <FiUsers className="text-accent-600" />
          <h3 className="font-bold text-lg">Installment Clients Tracker</h3>
        </div>

        {installmentClients.length === 0 ? (
          <p className="text-sm text-gray-500">No active installment clients at the moment.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-4 py-3">Order #</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Monthly Due</th>
                  <th className="px-4 py-3">Progress</th>
                  <th className="px-4 py-3">Next Due</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {installmentClients.map(client => (
                  <tr key={client.id} className="border-t border-gray-100">
                    <td className="px-4 py-3 font-mono text-xs text-accent-600">{client.order_number}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{client.customer_name}</div>
                      <div className="text-xs text-gray-500">{client.customer_email}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">{client.installment_plan_name || 'Installment'}</td>
                    <td className="px-4 py-3 font-medium">{formatPrice(client.monthly_installment_amount || 0)}</td>
                    <td className="px-4 py-3">
                      <span className="badge badge-info">{client.paid_installments}/{client.total_installments || client.installment_months || 0} paid</span>
                    </td>
                    <td className="px-4 py-3">
                      {client.next_due_installment
                        ? (
                          <div className="text-xs">
                            <div>Month {client.next_due_installment}</div>
                            <div className="text-gray-500">{new Date(client.next_due_date).toLocaleDateString()}</div>
                          </div>
                        )
                        : <span className="text-green-600 text-xs font-medium">Fully Paid</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => {
                          const orderMatch = orders.find(order => order.id === client.order_id);
                          if (orderMatch) {
                            setSelected(orderMatch);
                          } else {
                            toast.error('Order details not loaded yet. Please refresh orders.');
                          }
                        }}
                        className="btn-secondary btn-sm"
                      >
                        Open Order
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Order Detail Panel */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSelected(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl p-6 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto space-y-4">
            <h3 className="text-lg font-bold">Order {selected.order_number}</h3>
            <div className="text-sm space-y-2">
              <p><strong>Customer:</strong> {selected.first_name} {selected.last_name} ({selected.email})</p>
              <p><strong>Delivery:</strong> {selected.delivery_method} {selected.delivery_address && `- ${selected.delivery_address}`}</p>
              <p><strong>Total:</strong> {formatPrice(selected.total_amount)} | <strong>Paid:</strong> {formatPrice(selected.total_paid)}</p>
              {selected.has_vehicle && (
                <>
                  <p><strong>Reservation Fee:</strong> {formatPrice(selected.reservation_fee_total || 0)} ({selected.reservation_fee_paid ? 'Paid' : 'Unpaid'})</p>
                  <p><strong>Vehicle Payment Method:</strong> {(selected.vehicle_payment_method || 'N/A').replace('_', ' ')}</p>
                  <p><strong>Pickup Requirement:</strong> {formatPrice(selected.pickup_payment_required_total || 0)} | <strong>Pickup Due:</strong> {formatPrice(selected.pickup_balance_due || 0)}</p>
                  <p><strong>Pickup Clearance:</strong> <span className={selected.pickup_clearance_met ? 'text-green-600' : 'text-amber-600'}>{selected.pickup_clearance_met ? 'Ready for pickup' : 'Not enough paid yet'}</span></p>
                  {selected.vehicle_payment_method === 'installment' && (
                    <p><strong>Installment Plan:</strong> {selected.installment_plan_name} | Monthly: {formatPrice(selected.monthly_installment_amount || 0)}</p>
                  )}
                </>
              )}
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
                    <span className="capitalize">{p.payment_method.replace('_', ' ')} ({p.payment_type}){p.installment_number ? ` • Month ${p.installment_number}` : ''}</span>
                    <span className="font-medium text-green-700">{formatPrice(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            {selected.has_vehicle && (
              <div className="space-y-3">
                <div className="border rounded-lg p-3 bg-gray-50">
                  <h4 className="font-medium mb-2 flex items-center gap-1"><FiCreditCard size={14} /> Record Pickup Payment</h4>
                  <div className="grid grid-cols-1 gap-2 text-sm">
                    <input type="number" step="0.01" value={pickupForm.amount} onChange={e => setPickupForm({ ...pickupForm, amount: e.target.value })} className="input-field" placeholder={`Suggested: ${formatPrice(selected.pickup_balance_due || selected.remaining_balance || 0)}`} />
                    <select value={pickupForm.payment_method} onChange={e => setPickupForm({ ...pickupForm, payment_method: e.target.value })} className="input-field">
                      {selected.vehicle_payment_method === 'installment' ? (
                        <>
                          <option value="installment">Installment</option>
                          <option value="gcash">GCash</option>
                          <option value="bank_transfer">Bank Transfer</option>
                        </>
                      ) : (
                        <>
                          <option value="gcash">GCash</option>
                          <option value="bank_transfer">Bank Transfer</option>
                        </>
                      )}
                    </select>
                    {pickupForm.payment_method !== 'installment' && (
                      <input value={pickupForm.reference_number} onChange={e => setPickupForm({ ...pickupForm, reference_number: e.target.value })} className="input-field" placeholder="Reference number" />
                    )}
                    <button onClick={recordPickupPayment} className="btn-primary btn-sm">Record Payment</button>
                  </div>
                </div>

                {selected.vehicle_payment_method === 'installment' && selected.installment_schedule?.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Installment Schedule</h4>
                    <div className="space-y-2 max-h-56 overflow-y-auto">
                      {selected.installment_schedule.map(entry => (
                        <div key={entry.installment_number} className="flex items-center justify-between rounded border p-2 text-sm">
                          <div>
                            <p className="font-medium">Month {entry.installment_number}</p>
                            <p className="text-gray-500">Due {new Date(entry.due_date).toLocaleDateString()} • {formatPrice(entry.amount)}</p>
                          </div>
                          {entry.status === 'paid'
                            ? <span className="badge badge-success">Paid</span>
                            : <button onClick={() => markInstallmentPaid(entry.installment_number)} className="btn-secondary btn-sm text-xs">Mark Paid</button>
                          }
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {!selected.has_vehicle && selected.remaining_balance > 0 && (
              <div className="border rounded-lg p-3 bg-gray-50">
                <h4 className="font-medium mb-2 flex items-center gap-1"><FiCreditCard size={14} /> Mark Order as Paid</h4>
                <div className="grid grid-cols-1 gap-2 text-sm">
                  <input
                    type="number"
                    step="0.01"
                    value={orderPaymentForm.amount}
                    onChange={e => setOrderPaymentForm({ ...orderPaymentForm, amount: e.target.value })}
                    className="input-field"
                    placeholder={`Suggested: ${formatPrice(selected.remaining_balance || 0)}`}
                  />
                  <select
                    value={orderPaymentForm.payment_method}
                    onChange={e => setOrderPaymentForm({ ...orderPaymentForm, payment_method: e.target.value })}
                    className="input-field"
                  >
                    <option value="cash">Cash</option>
                    <option value="gcash">GCash</option>
                    <option value="bank_transfer">Bank Transfer</option>
                  </select>
                  {orderPaymentForm.payment_method !== 'cash' && (
                    <input
                      value={orderPaymentForm.reference_number}
                      onChange={e => setOrderPaymentForm({ ...orderPaymentForm, reference_number: e.target.value })}
                      className="input-field"
                      placeholder="Reference number"
                    />
                  )}
                  <button onClick={markOrderPaid} className="btn-primary btn-sm">Record Payment</button>
                  <button onClick={markFullBalancePaid} className="btn-secondary btn-sm">Mark Full Balance Paid</button>
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
    </div>
  );
}
