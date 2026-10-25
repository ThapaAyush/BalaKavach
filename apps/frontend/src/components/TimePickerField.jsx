import React from 'react';

const HOURS = [
  { val: '01', label: '1' },
  { val: '02', label: '2' },
  { val: '03', label: '3' },
  { val: '04', label: '4' },
  { val: '05', label: '5' },
  { val: '06', label: '6' },
  { val: '07', label: '7' },
  { val: '08', label: '8' },
  { val: '09', label: '9' },
  { val: '10', label: '10' },
  { val: '11', label: '11' },
  { val: '12', label: '12' },
];

const STANDARD_MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

export function parseTime24(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') {
    return { hour: '09', minute: '00', period: 'PM' };
  }
  const parts = timeStr.trim().split(':');
  let h = parseInt(parts[0], 10);
  if (isNaN(h)) h = 9;
  let m = parseInt(parts[1], 10);
  if (isNaN(m)) m = 0;

  const period = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;

  const h12Str = h12.toString().padStart(2, '0');
  const mStr = m.toString().padStart(2, '0');

  return { hour: h12Str, minute: mStr, period };
}

export function formatTo24(hour12, minute, period) {
  let h = parseInt(hour12, 10);
  if (isNaN(h)) h = 12;
  let m = parseInt(minute, 10);
  if (isNaN(m)) m = 0;

  if (period === 'PM' && h < 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;

  const hStr = h.toString().padStart(2, '0');
  const mStr = m.toString().padStart(2, '0');
  return `${hStr}:${mStr}`;
}

export function formatFriendly12Hour(time24) {
  const { hour, minute, period } = parseTime24(time24);
  const displayH = parseInt(hour, 10);
  return `${displayH}:${minute} ${period}`;
}

export default function TimePickerField({
  id,
  label,
  icon = '🕒',
  value = '21:00',
  onChange,
  presets = [],
}) {
  const { hour, minute, period } = parseTime24(value);

  // Ensure current minute exists in minute options even if non-standard
  const minuteList = STANDARD_MINUTES.includes(minute)
    ? STANDARD_MINUTES
    : [...STANDARD_MINUTES, minute].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

  const handleHourChange = (e) => {
    const newH = e.target.value;
    onChange(formatTo24(newH, minute, period));
  };

  const handleMinuteChange = (e) => {
    const newM = e.target.value;
    onChange(formatTo24(hour, newM, period));
  };

  const handlePeriodChange = (newPeriod) => {
    if (newPeriod === period) return;
    onChange(formatTo24(hour, minute, newPeriod));
  };

  const friendlyDisplay = formatFriendly12Hour(value);

  return (
    <div className="flex-1 rounded-2xl border border-amber-200/90 bg-white p-3.5 sm:p-4 shadow-xs transition hover:border-amber-300">
      {/* Hidden input for test / form compatibility */}
      <input type="hidden" id={id} value={value} readOnly />

      {/* Header */}
      <div className="flex items-center justify-between mb-2.5">
        <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
          <span>{icon}</span>
          <span>{label}</span>
        </span>
        <span className="rounded-full bg-amber-100/80 px-2 py-0.5 text-xs font-bold text-amber-800">
          {friendlyDisplay}
        </span>
      </div>

      {/* Time Controls (Hour : Minute + AM/PM) */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Hour Select */}
        <div className="relative flex-1">
          <select
            value={hour}
            onChange={handleHourChange}
            aria-label={`${label} hour`}
            className="w-full appearance-none rounded-xl border border-slate-300 bg-slate-50/70 px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-100 cursor-pointer"
          >
            {HOURS.map((h) => (
              <option key={h.val} value={h.val}>
                {h.label}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400 text-xs">
            ▼
          </div>
        </div>

        <span className="text-base font-bold text-slate-400 select-none">:</span>

        {/* Minute Select */}
        <div className="relative flex-1">
          <select
            value={minute}
            onChange={handleMinuteChange}
            aria-label={`${label} minute`}
            className="w-full appearance-none rounded-xl border border-slate-300 bg-slate-50/70 px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-100 cursor-pointer"
          >
            {minuteList.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400 text-xs">
            ▼
          </div>
        </div>

        {/* AM / PM Segmented Toggle */}
        <div className="flex rounded-xl border border-slate-300 bg-slate-100 p-0.5 shadow-2xs">
          <button
            type="button"
            onClick={() => handlePeriodChange('AM')}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
              period === 'AM'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            AM
          </button>
          <button
            type="button"
            onClick={() => handlePeriodChange('PM')}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
              period === 'PM'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            PM
          </button>
        </div>
      </div>

      {/* Quick Presets */}
      {presets.length > 0 && (
        <div className="mt-3 pt-2.5 border-t border-slate-100">
          <span className="block text-[10px] font-semibold tracking-wider text-slate-400 uppercase mb-1.5">
            Quick Options
          </span>
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => {
              const isSelected = value === p.time24;
              return (
                <button
                  key={p.time24}
                  type="button"
                  onClick={() => onChange(p.time24)}
                  className={`rounded-lg px-2 py-1 text-xs font-medium transition ${
                    isSelected
                      ? 'bg-amber-500 text-white font-bold shadow-2xs'
                      : 'border border-slate-200 bg-slate-50/60 text-slate-600 hover:border-amber-300 hover:bg-amber-50/50 hover:text-amber-800'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
