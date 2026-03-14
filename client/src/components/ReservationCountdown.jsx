import { useState, useEffect } from 'react';
import { FiClock, FiAlertTriangle, FiXCircle } from 'react-icons/fi';

function computeRemaining(expiresAt) {
  const diff = new Date(expiresAt) - new Date();
  if (diff <= 0) return null;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return { days, hours, minutes, total_ms: diff };
}

export default function ReservationCountdown({ expiresAt, compact = false }) {
  const [remaining, setRemaining] = useState(() => computeRemaining(expiresAt));

  useEffect(() => {
    const timer = setInterval(() => {
      setRemaining(computeRemaining(expiresAt));
    }, 60000); // update every minute
    return () => clearInterval(timer);
  }, [expiresAt]);

  if (!expiresAt) return null;

  if (!remaining) {
    return (
      <div className={`flex items-center gap-1.5 text-red-600 ${compact ? 'text-xs' : 'text-sm'}`}>
        <FiXCircle size={compact ? 12 : 14} />
        <span className="font-medium">Reservation expired — vehicle re-listed</span>
      </div>
    );
  }

  const urgency = remaining.days < 1 ? 'critical' : remaining.days < 3 ? 'warning' : 'ok';
  const colorClass = urgency === 'critical' ? 'text-red-600' : urgency === 'warning' ? 'text-amber-600' : 'text-green-600';
  const Icon = urgency === 'ok' ? FiClock : FiAlertTriangle;

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-medium ${colorClass}`}>
        <Icon size={11} />
        {remaining.days > 0 ? `${remaining.days}d ` : ''}{remaining.hours}h {remaining.minutes}m left
      </span>
    );
  }

  return (
    <div className={`flex items-start gap-2 rounded-lg p-3 ${urgency === 'critical' ? 'bg-red-50 border border-red-200' : urgency === 'warning' ? 'bg-amber-50 border border-amber-200' : 'bg-green-50 border border-green-200'}`}>
      <Icon size={16} className={`mt-0.5 flex-shrink-0 ${colorClass}`} />
      <div>
        <p className={`text-sm font-semibold ${colorClass}`}>
          Vehicle reserved — re-listed in{' '}
          {remaining.days > 0 && <span>{remaining.days} day{remaining.days !== 1 ? 's' : ''} </span>}
          {remaining.hours > 0 && <span>{remaining.hours} hr{remaining.hours !== 1 ? 's' : ''} </span>}
          <span>{remaining.minutes} min</span>
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          Expires {new Date(expiresAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}
