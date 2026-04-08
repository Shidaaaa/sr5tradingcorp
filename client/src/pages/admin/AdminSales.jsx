import { useState, useEffect, useMemo } from 'react';
import { api } from '../../api';
import { FiFilter, FiEye, FiSearch, FiDownload, FiCreditCard, FiClock, FiBookOpen, FiPackage } from 'react-icons/fi';
import Pagination from '../../components/Pagination';

const formatPrice = (price) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(price || 0);
const formatDateTime = (date) => new Date(date).toLocaleString();
const toDateInputValue = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toMonthInputValue = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const statusBadgeClass = {
  completed: 'badge-success',
  pending: 'badge-warning',
  failed: 'badge-danger',
  refunded: 'badge-danger',
};

const paymentTypeLabels = {
  full: 'Full Payment',
  partial: 'Partial Payment',
  installment: 'Installment',
  reservation: 'Reservation',
  down_payment: 'Down Payment',
};

const ITEMS_PER_PAGE = 5;

function downloadCsv(filename, headers, rows) {
  const escapeValue = (value) => {
    const text = String(value ?? '');
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const csv = [headers.map(escapeValue).join(',')]
    .concat(rows.map(row => row.map(escapeValue).join(',')))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminSales() {
  const currentMonthValue = toMonthInputValue(new Date());
  const [salesData, setSalesData] = useState({ summary: null, rows: [], receivables: null, daily_cashbook: null });
  const [soldProductsData, setSoldProductsData] = useState({ summary: null, rows: [], month: currentMonthValue });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('transactions');
  const [soldProductsMonth, setSoldProductsMonth] = useState(currentMonthValue);
  const [soldProductsLoading, setSoldProductsLoading] = useState(false);
  const [filters, setFilters] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    status: 'all',
    payment_method: 'all',
    payment_type: 'all',
    search: '',
    cashbook_date: toDateInputValue(new Date()),
  });
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [cashCounted, setCashCounted] = useState('');
  const [transactionsPage, setTransactionsPage] = useState(1);
  const [receivablesPage, setReceivablesPage] = useState(1);

  useEffect(() => { fetchSales(); }, [filters]);
  useEffect(() => { fetchSoldProducts(); }, [soldProductsMonth]);

  useEffect(() => {
    setTransactionsPage(1);
    setReceivablesPage(1);
  }, [filters, activeTab]);

  const fetchSales = async () => {
    setLoading(true);
    try {
      const data = await api.getSales(filters);
      setSalesData({
        summary: data?.summary || null,
        rows: Array.isArray(data?.rows) ? data.rows : [],
        receivables: data?.receivables || { aging: null, rows: [] },
        daily_cashbook: data?.daily_cashbook || null,
      });
    } catch {
      setSalesData({ summary: null, rows: [], receivables: null, daily_cashbook: null });
    } finally {
      setLoading(false);
    }
  };

  const fetchSoldProducts = async () => {
    setSoldProductsLoading(true);
    try {
      const data = await api.getSoldProductsReport(soldProductsMonth);
      setSoldProductsData({
        summary: data?.summary || { orders_count: 0, products_count: 0, units_sold: 0, revenue: 0 },
        rows: Array.isArray(data?.rows) ? data.rows : [],
        month: data?.month || soldProductsMonth,
      });
    } catch {
      setSoldProductsData({
        summary: { orders_count: 0, products_count: 0, units_sold: 0, revenue: 0 },
        rows: [],
        month: soldProductsMonth,
      });
    } finally {
      setSoldProductsLoading(false);
    }
  };

  const summary = salesData.summary || {
    sales_collected: 0,
    transactions_count: 0,
    completed_count: 0,
    outstanding_receivables: 0,
    overdue_installments_count: 0,
    failed_or_refunded_count: 0,
    average_payment_value: 0,
  };

  const receivables = salesData.receivables || { aging: { current: 0, bucket_1_7: 0, bucket_8_30: 0, bucket_31_plus: 0, total: 0 }, rows: [] };
  const cashbook = salesData.daily_cashbook || { date: new Date(), transactions_count: 0, total_collections: 0, cash_total: 0, digital_total: 0, totals_by_method: {} };

  const cashVariance = useMemo(() => {
    const counted = Number(cashCounted || 0);
    if (!Number.isFinite(counted)) return 0;
    return counted - Number(cashbook.cash_total || 0);
  }, [cashCounted, cashbook.cash_total]);

  const transactionTotalPages = Math.max(1, Math.ceil((salesData.rows?.length || 0) / ITEMS_PER_PAGE));
  const paginatedTransactions = useMemo(() => {
    const start = (transactionsPage - 1) * ITEMS_PER_PAGE;
    return (salesData.rows || []).slice(start, start + ITEMS_PER_PAGE);
  }, [salesData.rows, transactionsPage]);

  const receivableRows = receivables.rows || [];
  const receivablesTotalPages = Math.max(1, Math.ceil(receivableRows.length / ITEMS_PER_PAGE));
  const paginatedReceivables = useMemo(() => {
    const start = (receivablesPage - 1) * ITEMS_PER_PAGE;
    return receivableRows.slice(start, start + ITEMS_PER_PAGE);
  }, [receivableRows, receivablesPage]);

  const exportTransactions = () => {
    const rows = salesData.rows.map(row => ([
      formatDateTime(row.payment_date),
      row.order_number,
      row.customer_name,
      paymentTypeLabels[row.payment_type] || row.payment_type,
      row.payment_method,
      row.payment_status,
      row.amount_paid,
      row.order_paid_total,
      row.remaining_balance,
      row.reference_number || row.receipt_number || '',
    ]));

    downloadCsv(
      `sales-transactions-${filters.year}-${String(filters.month).padStart(2, '0')}.csv`,
      ['Payment Date', 'Order Number', 'Customer', 'Payment Type', 'Payment Method', 'Status', 'Amount Paid', 'Order Paid Total', 'Remaining Balance', 'Reference'],
      rows
    );
  };

  const exportReceivables = () => {
    const rows = (receivables.rows || []).map(row => ([
      row.order_number,
      row.customer_name,
      row.order_total,
      row.paid_total,
      row.outstanding,
      row.next_due_date ? formatDateTime(row.next_due_date) : '',
      row.days_overdue,
      row.order_status,
      row.last_payment_date ? formatDateTime(row.last_payment_date) : '',
    ]));

    downloadCsv(
      `receivables-${toDateInputValue(new Date())}.csv`,
      ['Order Number', 'Customer', 'Order Total', 'Paid Total', 'Outstanding', 'Next Due Date', 'Days Overdue', 'Order Status', 'Last Payment Date'],
      rows
    );
  };

  const exportCashbook = () => {
    const methodRows = Object.entries(cashbook.totals_by_method || {}).map(([method, total]) => ([method, total]));
    downloadCsv(
      `cashbook-${toDateInputValue(cashbook.date || new Date())}.csv`,
      ['Payment Method', 'Total Collected'],
      methodRows
    );
  };

  const exportSoldProducts = () => {
    const rows = (soldProductsData.rows || []).map(row => ([
      row.product_name,
      row.category_name,
      row.product_type,
      row.total_quantity,
      row.total_revenue,
      row.orders_count,
    ]));

    downloadCsv(
      `sold-products-${soldProductsData.month || soldProductsMonth}.csv`,
      ['Product Name', 'Category', 'Type', 'Units Sold', 'Revenue', 'Orders Count'],
      rows
    );
  };

  return (
    <div className="w-full min-w-0 overflow-x-hidden">
      <h1 className="text-2xl font-bold text-navy-900 mb-6">Sales Management</h1>

      <div className="card mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3 items-center p-1">
          <div className="flex items-center gap-2 text-sm text-gray-500"><FiFilter /> Filters</div>
          <select value={filters.month} onChange={e => setFilters(prev => ({ ...prev, month: +e.target.value }))} className="input-field w-full">
            {[...Array(12)].map((_, i) => <option key={i} value={i + 1}>{new Date(2000, i).toLocaleString('default', { month: 'long' })}</option>)}
          </select>
          <select value={filters.year} onChange={e => setFilters(prev => ({ ...prev, year: +e.target.value }))} className="input-field w-full">
            {[2023, 2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={filters.status} onChange={e => setFilters(prev => ({ ...prev, status: e.target.value }))} className="input-field w-full">
            <option value="all">All Status</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
          </select>
          <select value={filters.payment_type} onChange={e => setFilters(prev => ({ ...prev, payment_type: e.target.value }))} className="input-field w-full">
            <option value="all">All Types</option>
            <option value="full">Full</option>
            <option value="partial">Partial</option>
            <option value="reservation">Reservation</option>
            <option value="down_payment">Down Payment</option>
            <option value="installment">Installment</option>
          </select>
          <select value={filters.payment_method} onChange={e => setFilters(prev => ({ ...prev, payment_method: e.target.value }))} className="input-field w-full">
            <option value="all">All Methods</option>
            <option value="cash">Cash</option>
            <option value="credit_card">Credit Card</option>
            <option value="debit_card">Debit Card</option>
            <option value="gcash">GCash</option>
            <option value="ewallet">E-Wallet</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="installment">Installment</option>
          </select>
          <div className="relative md:col-span-2 xl:col-span-6">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={filters.search}
              onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
              className="input-field pl-9"
              placeholder="Search order #, customer, reference..."
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 mb-6">
        <div className="stat-card"><p className="text-sm text-gray-500">Sales Collected</p><p className="text-2xl font-bold text-emerald-600">{formatPrice(summary.sales_collected)}</p></div>
        <div className="stat-card"><p className="text-sm text-gray-500">Transactions</p><p className="text-2xl font-bold">{summary.transactions_count}</p></div>
        <div className="stat-card"><p className="text-sm text-gray-500">Completed</p><p className="text-2xl font-bold text-blue-600">{summary.completed_count}</p></div>
        <div className="stat-card"><p className="text-sm text-gray-500">Failed or Refunded</p><p className="text-2xl font-bold text-rose-600">{summary.failed_or_refunded_count}</p></div>
        <div className="stat-card"><p className="text-sm text-gray-500">Outstanding</p><p className="text-2xl font-bold text-red-600">{formatPrice(summary.outstanding_receivables)}</p></div>
        <div className="stat-card"><p className="text-sm text-gray-500">Overdue Installments</p><p className="text-2xl font-bold text-amber-600">{summary.overdue_installments_count}</p></div>
        <div className="stat-card"><p className="text-sm text-gray-500">Avg Payment</p><p className="text-2xl font-bold text-accent-600">{formatPrice(summary.average_payment_value)}</p></div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex bg-white border border-gray-200 rounded-lg p-1">
          <button onClick={() => setActiveTab('transactions')} className={`px-3 py-2 text-sm rounded ${activeTab === 'transactions' ? 'bg-navy-900 text-white' : 'text-gray-600'}`}>Transactions</button>
          <button onClick={() => setActiveTab('receivables')} className={`px-3 py-2 text-sm rounded ${activeTab === 'receivables' ? 'bg-navy-900 text-white' : 'text-gray-600'}`}>Receivables</button>
          <button onClick={() => setActiveTab('cashbook')} className={`px-3 py-2 text-sm rounded ${activeTab === 'cashbook' ? 'bg-navy-900 text-white' : 'text-gray-600'}`}>Daily Cashbook</button>
          <button onClick={() => setActiveTab('sold_products')} className={`px-3 py-2 text-sm rounded ${activeTab === 'sold_products' ? 'bg-navy-900 text-white' : 'text-gray-600'}`}>Sold Products</button>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'transactions' && <button onClick={exportTransactions} className="btn-secondary btn-sm flex items-center gap-1"><FiDownload size={14} /> Export Transactions</button>}
          {activeTab === 'receivables' && <button onClick={exportReceivables} className="btn-secondary btn-sm flex items-center gap-1"><FiDownload size={14} /> Export Receivables</button>}
          {activeTab === 'cashbook' && <button onClick={exportCashbook} className="btn-secondary btn-sm flex items-center gap-1"><FiDownload size={14} /> Export Cashbook</button>}
          {activeTab === 'sold_products' && <button onClick={exportSoldProducts} className="btn-secondary btn-sm flex items-center gap-1"><FiDownload size={14} /> Export Sold Products</button>}
        </div>
      </div>

      {loading ? <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent-500"></div></div> : (
        <>
          {activeTab === 'transactions' && (
            <div className="table-container w-full max-w-full">
              <div className="w-full max-w-full overflow-hidden">
                <table className="w-full table-fixed text-sm">
                  <thead><tr className="bg-gray-50 text-left">
                    <th className="px-4 py-3">Payment Date</th>
                    <th className="px-4 py-3">Order #</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3 hidden lg:table-cell">Type</th>
                    <th className="px-4 py-3 hidden lg:table-cell">Method</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3 hidden xl:table-cell">Order Paid</th>
                    <th className="px-4 py-3">Balance</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 hidden xl:table-cell">Reference</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr></thead>
                  <tbody>
                    {paginatedTransactions.map(row => (
                      <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-500 text-xs break-words">{formatDateTime(row.payment_date)}</td>
                        <td className="px-4 py-3 font-mono text-xs break-all">{row.order_number}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium break-words">{row.customer_name}</p>
                          {row.customer_email && <p className="text-xs text-gray-500 break-all">{row.customer_email}</p>}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell"><span className="badge badge-info">{paymentTypeLabels[row.payment_type] || row.payment_type}</span></td>
                        <td className="px-4 py-3 hidden lg:table-cell capitalize">{row.payment_method?.replace('_', ' ') || '-'}</td>
                        <td className="px-4 py-3 font-semibold text-emerald-700">{formatPrice(row.amount_paid)}</td>
                        <td className="px-4 py-3 hidden xl:table-cell">{formatPrice(row.order_paid_total || 0)}</td>
                        <td className="px-4 py-3">{row.remaining_balance > 0 ? <span className="text-red-600 font-medium">{formatPrice(row.remaining_balance)}</span> : <span className="text-green-600">Paid</span>}</td>
                        <td className="px-4 py-3"><span className={`badge ${statusBadgeClass[row.payment_status] || 'badge-info'}`}>{row.payment_status}</span></td>
                        <td className="px-4 py-3 hidden xl:table-cell text-xs text-gray-500 break-all max-w-[180px]">{row.reference_number || row.receipt_number || '-'}</td>
                        <td className="px-4 py-3"><button onClick={() => setSelectedPayment(row)} className="btn-secondary btn-sm"><FiEye size={14} /></button></td>
                      </tr>
                    ))}
                    {salesData.rows.length === 0 && <tr><td colSpan="11" className="px-4 py-10 text-center text-gray-400">No payment records found for current filters.</td></tr>}
                  </tbody>
                </table>
              </div>
              <Pagination
                currentPage={transactionsPage}
                totalPages={transactionTotalPages}
                onPageChange={setTransactionsPage}
                totalItems={salesData.rows.length}
                itemsPerPage={ITEMS_PER_PAGE}
              />
            </div>
          )}

          {activeTab === 'receivables' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="stat-card"><p className="text-xs text-gray-500">Current</p><p className="text-xl font-bold text-blue-600">{formatPrice(receivables.aging?.current || 0)}</p></div>
                <div className="stat-card"><p className="text-xs text-gray-500">1-7 Days</p><p className="text-xl font-bold text-amber-600">{formatPrice(receivables.aging?.bucket_1_7 || 0)}</p></div>
                <div className="stat-card"><p className="text-xs text-gray-500">8-30 Days</p><p className="text-xl font-bold text-orange-600">{formatPrice(receivables.aging?.bucket_8_30 || 0)}</p></div>
                <div className="stat-card"><p className="text-xs text-gray-500">31+ Days</p><p className="text-xl font-bold text-red-600">{formatPrice(receivables.aging?.bucket_31_plus || 0)}</p></div>
                <div className="stat-card"><p className="text-xs text-gray-500">Total Receivables</p><p className="text-xl font-bold text-navy-900">{formatPrice(receivables.aging?.total || 0)}</p></div>
              </div>

              <div className="table-container w-full max-w-full">
                <div className="w-full max-w-full overflow-hidden">
                  <table className="w-full table-fixed text-sm">
                    <thead><tr className="bg-gray-50 text-left">
                      <th className="px-4 py-3">Order #</th>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Outstanding</th>
                      <th className="px-4 py-3">Order Total</th>
                      <th className="px-4 py-3">Paid</th>
                      <th className="px-4 py-3">Next Due</th>
                      <th className="px-4 py-3">Days Overdue</th>
                      <th className="px-4 py-3">Last Payment</th>
                    </tr></thead>
                    <tbody>
                      {paginatedReceivables.map(row => (
                        <tr key={row.order_id} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono text-xs break-all">{row.order_number}</td>
                          <td className="px-4 py-3">
                            <p className="font-medium break-words">{row.customer_name}</p>
                            {row.customer_email && <p className="text-xs text-gray-500 break-all">{row.customer_email}</p>}
                          </td>
                          <td className="px-4 py-3 font-semibold text-red-600">{formatPrice(row.outstanding)}</td>
                          <td className="px-4 py-3">{formatPrice(row.order_total)}</td>
                          <td className="px-4 py-3 text-green-700">{formatPrice(row.paid_total)}</td>
                          <td className="px-4 py-3 text-gray-500">{row.next_due_date ? formatDateTime(row.next_due_date) : '-'}</td>
                          <td className="px-4 py-3">{row.days_overdue > 0 ? <span className="badge badge-danger">{row.days_overdue} day(s)</span> : <span className="badge badge-success">Current</span>}</td>
                          <td className="px-4 py-3 text-gray-500">{row.last_payment_date ? formatDateTime(row.last_payment_date) : '-'}</td>
                        </tr>
                      ))}
                      {(receivables.rows || []).length === 0 && <tr><td colSpan="8" className="px-4 py-10 text-center text-gray-400">No outstanding receivables.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  currentPage={receivablesPage}
                  totalPages={receivablesTotalPages}
                  onPageChange={setReceivablesPage}
                  totalItems={receivableRows.length}
                  itemsPerPage={ITEMS_PER_PAGE}
                />
              </div>
            </div>
          )}

          {activeTab === 'cashbook' && (
            <div className="space-y-4">
              <div className="card">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 text-sm text-gray-600"><FiClock /> Daily Snapshot Date</div>
                  <input
                    type="date"
                    value={filters.cashbook_date}
                    onChange={e => setFilters(prev => ({ ...prev, cashbook_date: e.target.value }))}
                    className="input-field w-auto"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="stat-card"><p className="text-sm text-gray-500">Collections</p><p className="text-2xl font-bold text-emerald-600">{formatPrice(cashbook.total_collections)}</p></div>
                <div className="stat-card"><p className="text-sm text-gray-500">Cash</p><p className="text-2xl font-bold text-navy-900">{formatPrice(cashbook.cash_total)}</p></div>
                <div className="stat-card"><p className="text-sm text-gray-500">Digital</p><p className="text-2xl font-bold text-blue-600">{formatPrice(cashbook.digital_total)}</p></div>
                <div className="stat-card"><p className="text-sm text-gray-500">Transactions</p><p className="text-2xl font-bold">{cashbook.transactions_count}</p></div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="card p-5">
                  <h3 className="font-bold text-lg mb-3 flex items-center gap-2"><FiCreditCard /> Breakdown by Method</h3>
                  <div className="space-y-2">
                    {Object.entries(cashbook.totals_by_method || {}).map(([method, total]) => (
                      <div key={method} className="flex justify-between border-b border-gray-100 pb-2">
                        <span className="capitalize text-gray-600">{method.replace('_', ' ')}</span>
                        <span className="font-semibold">{formatPrice(total)}</span>
                      </div>
                    ))}
                    {Object.keys(cashbook.totals_by_method || {}).length === 0 && <p className="text-sm text-gray-400">No payment methods recorded for this day.</p>}
                  </div>
                </div>

                <div className="card p-5">
                  <h3 className="font-bold text-lg mb-3 flex items-center gap-2"><FiBookOpen /> Reconciliation</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between"><span className="text-gray-500">System Cash Total</span><span className="font-semibold">{formatPrice(cashbook.cash_total)}</span></div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Cash Counted (manual)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={cashCounted}
                        onChange={e => setCashCounted(e.target.value)}
                        className="input-field"
                        placeholder="Enter physical cash count"
                      />
                    </div>
                    <div className="flex justify-between pt-2 border-t border-gray-200">
                      <span className="text-gray-500">Variance</span>
                      <span className={`font-bold ${cashVariance === 0 ? 'text-emerald-600' : cashVariance > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        {formatPrice(cashVariance)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">Positive variance means counted cash is higher than system value.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'sold_products' && (
            <div className="space-y-4">
              <div className="card">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 text-sm text-gray-600"><FiPackage /> Sold Products Month</div>
                  <input
                    type="month"
                    value={soldProductsMonth}
                    onChange={e => setSoldProductsMonth(e.target.value || currentMonthValue)}
                    className="input-field w-auto"
                  />
                </div>
              </div>

              {soldProductsLoading ? (
                <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent-500"></div></div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="stat-card"><p className="text-sm text-gray-500">Orders with Sold Items</p><p className="text-2xl font-bold text-navy-900">{soldProductsData.summary?.orders_count || 0}</p></div>
                    <div className="stat-card"><p className="text-sm text-gray-500">Products Sold</p><p className="text-2xl font-bold text-blue-600">{soldProductsData.summary?.products_count || 0}</p></div>
                    <div className="stat-card"><p className="text-sm text-gray-500">Units Sold</p><p className="text-2xl font-bold text-emerald-600">{soldProductsData.summary?.units_sold || 0}</p></div>
                    <div className="stat-card"><p className="text-sm text-gray-500">Revenue from Sold Products</p><p className="text-2xl font-bold text-accent-600">{formatPrice(soldProductsData.summary?.revenue || 0)}</p></div>
                  </div>

                  <div className="table-container w-full max-w-full">
                    <div className="w-full max-w-full overflow-hidden">
                      <table className="w-full table-fixed text-sm">
                        <thead><tr className="bg-gray-50 text-left">
                          <th className="px-4 py-3">Product</th>
                          <th className="px-4 py-3">Category</th>
                          <th className="px-4 py-3">Type</th>
                          <th className="px-4 py-3">Units Sold</th>
                          <th className="px-4 py-3">Revenue</th>
                          <th className="px-4 py-3">Orders</th>
                        </tr></thead>
                        <tbody>
                          {(soldProductsData.rows || []).map(row => (
                            <tr key={String(row.product_id)} className="border-t border-gray-100 hover:bg-gray-50">
                              <td className="px-4 py-3 font-medium break-words">{row.product_name}</td>
                              <td className="px-4 py-3 text-gray-600 break-words">{row.category_name}</td>
                              <td className="px-4 py-3 capitalize">{row.product_type}</td>
                              <td className="px-4 py-3 font-semibold text-emerald-700">{row.total_quantity}</td>
                              <td className="px-4 py-3 font-semibold">{formatPrice(row.total_revenue)}</td>
                              <td className="px-4 py-3">{row.orders_count}</td>
                            </tr>
                          ))}
                          {(soldProductsData.rows || []).length === 0 && <tr><td colSpan="6" className="px-4 py-10 text-center text-gray-400">No sold products found for the selected month.</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

      {selectedPayment && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedPayment(null)}>
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">{selectedPayment.order_number} Payment Details</h3>
              <button onClick={() => setSelectedPayment(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Customer:</span><span>{selectedPayment.customer_name}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Payment Date:</span><span>{formatDateTime(selectedPayment.payment_date)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Order Date:</span><span>{selectedPayment.order_created_at ? formatDateTime(selectedPayment.order_created_at) : '-'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Delivery:</span><span className="capitalize">{selectedPayment.delivery_method}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Order Status:</span><span className="badge badge-info">{selectedPayment.order_status}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Payment Status:</span><span className={`badge ${statusBadgeClass[selectedPayment.payment_status] || 'badge-info'}`}>{selectedPayment.payment_status}</span></div>
              <hr />
              <div className="flex justify-between"><span className="text-gray-500">This Payment:</span><span className="font-bold text-emerald-700">{formatPrice(selectedPayment.amount_paid)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Order Total:</span><span className="font-bold">{formatPrice(selectedPayment.order_total)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Total Paid (Order):</span><span className="text-green-600">{formatPrice(selectedPayment.order_paid_total)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Remaining:</span><span className={selectedPayment.remaining_balance > 0 ? 'text-red-600 font-bold' : 'text-green-600'}>{selectedPayment.remaining_balance > 0 ? formatPrice(selectedPayment.remaining_balance) : 'Paid'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Method:</span><span className="capitalize">{selectedPayment.payment_method?.replace('_', ' ') || '-'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Type:</span><span>{paymentTypeLabels[selectedPayment.payment_type] || selectedPayment.payment_type}</span></div>
              {(selectedPayment.reference_number || selectedPayment.receipt_number) && (
                <div className="flex justify-between"><span className="text-gray-500">Reference:</span><span>{selectedPayment.reference_number || selectedPayment.receipt_number}</span></div>
              )}
              {selectedPayment.order_notes && <><hr /><p className="text-gray-500">Order Notes: {selectedPayment.order_notes}</p></>}
              <hr />
              <div>
                <p className="font-semibold text-navy-900 mb-2">Payment Timeline</p>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {(selectedPayment.payment_timeline || []).map(t => (
                    <div key={t.id} className="border border-gray-200 rounded-lg p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-500">{formatDateTime(t.created_at)}</span>
                        <span className={`badge ${statusBadgeClass[t.status] || 'badge-info'}`}>{t.status}</span>
                      </div>
                      <div className="mt-1 text-sm flex items-center justify-between">
                        <span className="capitalize">{t.payment_method?.replace('_', ' ')} · {paymentTypeLabels[t.payment_type] || t.payment_type}</span>
                        <span className="font-semibold">{formatPrice(t.amount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
