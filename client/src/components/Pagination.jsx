import { FiChevronLeft, FiChevronRight, FiChevronsLeft, FiChevronsRight } from 'react-icons/fi';

export default function Pagination({ currentPage, totalPages, onPageChange, totalItems, itemsPerPage, onItemsPerPageChange }) {
  if (totalPages <= 1 && !onItemsPerPageChange) return null;

  const pages = [];
  const maxVisible = 5;
  let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  let end = Math.min(totalPages, start + maxVisible - 1);
  if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="flex items-center justify-between mt-4 px-2">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <span>{totalItems} item{totalItems !== 1 ? 's' : ''}</span>
        {onItemsPerPageChange && (
          <select value={itemsPerPage} onChange={e => onItemsPerPageChange(Number(e.target.value))} className="input-field w-auto py-1 px-2 text-sm">
            {[5, 10, 15, 25, 50].map(n => <option key={n} value={n}>{n} / page</option>)}
          </select>
        )}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button onClick={() => onPageChange(1)} disabled={currentPage === 1} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"><FiChevronsLeft size={14} /></button>
          <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"><FiChevronLeft size={14} /></button>
          {start > 1 && <span className="px-1 text-gray-400">...</span>}
          {pages.map(p => (
            <button key={p} onClick={() => onPageChange(p)} className={`min-w-[32px] h-8 rounded text-sm font-medium ${p === currentPage ? 'bg-accent-500 text-white' : 'hover:bg-gray-100 text-gray-600'}`}>{p}</button>
          ))}
          {end < totalPages && <span className="px-1 text-gray-400">...</span>}
          <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"><FiChevronRight size={14} /></button>
          <button onClick={() => onPageChange(totalPages)} disabled={currentPage === totalPages} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"><FiChevronsRight size={14} /></button>
        </div>
      )}
    </div>
  );
}
