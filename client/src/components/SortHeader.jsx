import { FiChevronUp, FiChevronDown } from 'react-icons/fi';

export default function SortHeader({ label, field, sortField, sortDir, onSort }) {
  const active = sortField === field;
  return (
    <button onClick={() => onSort(field)} className="flex items-center gap-1 font-medium hover:text-accent-600 transition-colors">
      {label}
      <span className="flex flex-col -space-y-1">
        <FiChevronUp size={10} className={active && sortDir === 'asc' ? 'text-accent-500' : 'text-gray-300'} />
        <FiChevronDown size={10} className={active && sortDir === 'desc' ? 'text-accent-500' : 'text-gray-300'} />
      </span>
    </button>
  );
}
