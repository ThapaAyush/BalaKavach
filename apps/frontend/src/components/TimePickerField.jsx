import React, { useState, useEffect, useRef } from 'react';

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

export function parseFlexibleTimeString(str, fallbackPeriod = 'PM') {
  if (!str || typeof str !== 'string') return null;
  const clean = str.trim().toLowerCase();
  if (!clean) return null;

  // Check for explicit am/pm
  let period = null;
  if (/am\b|am/i.test(clean)) period = 'AM';
  else if (/pm\b|pm/i.test(clean)) period = 'PM';

  // Remove am/pm and trailing/leading whitespace
  const timeOnly = clean.replace(/am|pm/gi, '').trim();

  // Match H:M, H.M, or just H
  const match = timeOnly.match(/^(\d{1,2})(?:[:.](\d{1,2}))?$/);
  if (!match) return null;

  let h = parseInt(match[1], 10);
  let m = match[2] !== undefined ? parseInt(match[2], 10) : 0;

  if (isNaN(h) || isNaN(m)) return null;
  if (m < 0 || m > 59) return null;

  if (period) {
    if (h < 1 || h > 12) return null;
    return formatTo24(h.toString().padStart(2, '0'), m.toString().padStart(2, '0'), period);
  }

  // If 24-hour hour (13 to 23)
  if (h >= 13 && h <= 23) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  if (h === 0) {
    return `00:${m.toString().padStart(2, '0')}`;
  }

  if (h >= 1 && h <= 12) {
    return formatTo24(h.toString().padStart(2, '0'), m.toString().padStart(2, '0'), fallbackPeriod || 'PM');
  }

  return null;
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
  const displayHourNumber = parseInt(hour, 10).toString();

  const [hourInput, setHourInput] = useState(displayHourNumber);
  const [minuteInput, setMinuteInput] = useState(minute);
  const [textInput, setTextInput] = useState(formatFriendly12Hour(value));
  const [isEditingText, setIsEditingText] = useState(false);

  const [showHourDropdown, setShowHourDropdown] = useState(false);
  const [showMinuteDropdown, setShowMinuteDropdown] = useState(false);

  const containerRef = useRef(null);

  // Sync state when incoming value changes
  useEffect(() => {
    setHourInput(parseInt(hour, 10).toString());
    setMinuteInput(minute);
    if (!isEditingText) {
      setTextInput(formatFriendly12Hour(value));
    }
  }, [value, hour, minute, isEditingText]);

  // Click outside to dismiss dropdowns
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowHourDropdown(false);
        setShowMinuteDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const minuteList = STANDARD_MINUTES.includes(minute)
    ? STANDARD_MINUTES
    : [...STANDARD_MINUTES, minute].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

  const handleHourChange = (e) => {
    const raw = e.target.value;
    setHourInput(raw);
    const digits = raw.replace(/\D/g, '');
    if (!digits) return;
    let num = parseInt(digits, 10);
    if (num > 12) {
      if (num >= 13 && num <= 23) {
        // Parent typed 24h format (e.g. 20 -> 8 PM)
        onChange(formatTo24((num - 12).toString().padStart(2, '0'), minute, 'PM'));
        return;
      }
      num = 12;
    } else if (num === 0) {
      num = 12;
    }
    onChange(formatTo24(num.toString().padStart(2, '0'), minute, period));
  };

  const handleHourBlur = () => {
    setHourInput(parseInt(hour, 10).toString());
  };

  const handleMinuteChange = (e) => {
    const raw = e.target.value;
    setMinuteInput(raw);
    const digits = raw.replace(/\D/g, '');
    if (!digits) return;
    let num = parseInt(digits, 10);
    if (num > 59) num = 59;
    onChange(formatTo24(hour, num.toString().padStart(2, '0'), period));
  };

  const handleMinuteBlur = () => {
    setMinuteInput(minute);
  };

  const handlePeriodChange = (newPeriod) => {
    if (newPeriod === period) return;
    onChange(formatTo24(hour, minute, newPeriod));
  };

  const handleTextInputChange = (e) => {
    const raw = e.target.value;
    setTextInput(raw);
    const parsed = parseFlexibleTimeString(raw, period);
    if (parsed) {
      onChange(parsed);
    }
  };

  const handleTextInputBlur = () => {
    setIsEditingText(false);
    setTextInput(formatFriendly12Hour(value));
  };

  const handleTextInputFocus = () => {
    setIsEditingText(true);
  };

  const friendlyDisplay = formatFriendly12Hour(value);

  return (
    <div
      ref={containerRef}
      className="flex-1 rounded-2xl border border-amber-200/90 bg-white p-3.5 sm:p-4 shadow-xs transition hover:border-amber-300"
    >
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

      {/* Time Controls (Editable Hour : Editable Minute + AM/PM) */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Hour Input + Dropdown */}
        <div className="relative flex-1">
          <div className="flex items-center rounded-xl border border-slate-300 bg-slate-50/70 transition focus-within:border-amber-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-amber-100">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={2}
              value={hourInput}
              onChange={handleHourChange}
              onBlur={handleHourBlur}
              aria-label={`${label} hour`}
              placeholder="12"
              className="w-full bg-transparent px-3 py-2 text-sm font-semibold text-slate-800 outline-none text-center sm:text-left"
            />
            <button
              type="button"
              onClick={() => {
                setShowHourDropdown((prev) => !prev);
                setShowMinuteDropdown(false);
              }}
              aria-label={`Open ${label} hour dropdown`}
              className="flex items-center justify-center px-2 py-2 text-slate-400 hover:text-amber-600 transition"
            >
              <span className="text-[10px]">▼</span>
            </button>
          </div>

          {showHourDropdown && (
            <div className="absolute left-0 top-full z-30 mt-1 max-h-48 w-full min-w-[75px] overflow-y-auto rounded-xl border border-amber-200 bg-white p-1 shadow-lg">
              {HOURS.map((h) => (
                <button
                  key={h.val}
                  type="button"
                  onClick={() => {
                    onChange(formatTo24(h.val, minute, period));
                    setShowHourDropdown(false);
                  }}
                  className={`w-full rounded-lg px-2.5 py-1.5 text-xs font-semibold text-left transition ${
                    h.val === hour
                      ? 'bg-amber-500 text-white font-bold'
                      : 'text-slate-700 hover:bg-amber-50 hover:text-amber-800'
                  }`}
                >
                  {h.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <span className="text-base font-bold text-slate-400 select-none">:</span>

        {/* Minute Input + Dropdown */}
        <div className="relative flex-1">
          <div className="flex items-center rounded-xl border border-slate-300 bg-slate-50/70 transition focus-within:border-amber-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-amber-100">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={2}
              value={minuteInput}
              onChange={handleMinuteChange}
              onBlur={handleMinuteBlur}
              aria-label={`${label} minute`}
              placeholder="00"
              className="w-full bg-transparent px-3 py-2 text-sm font-semibold text-slate-800 outline-none text-center sm:text-left"
            />
            <button
              type="button"
              onClick={() => {
                setShowMinuteDropdown((prev) => !prev);
                setShowHourDropdown(false);
              }}
              aria-label={`Open ${label} minute dropdown`}
              className="flex items-center justify-center px-2 py-2 text-slate-400 hover:text-amber-600 transition"
            >
              <span className="text-[10px]">▼</span>
            </button>
          </div>

          {showMinuteDropdown && (
            <div className="absolute left-0 top-full z-30 mt-1 max-h-48 w-full min-w-[75px] overflow-y-auto rounded-xl border border-amber-200 bg-white p-1 shadow-lg">
              {minuteList.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    onChange(formatTo24(hour, m, period));
                    setShowMinuteDropdown(false);
                  }}
                  className={`w-full rounded-lg px-2.5 py-1.5 text-xs font-semibold text-left transition ${
                    m === minute
                      ? 'bg-amber-500 text-white font-bold'
                      : 'text-slate-700 hover:bg-amber-50 hover:text-amber-800'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
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

      {/* Direct Text / Number Time Input */}
      <div className="mt-2.5 flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-slate-50/60 px-2.5 py-1.5 transition focus-within:border-amber-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-amber-100">
        <span className="text-xs text-slate-400 select-none">✍️</span>
        <input
          type="text"
          value={textInput}
          onChange={handleTextInputChange}
          onFocus={handleTextInputFocus}
          onBlur={handleTextInputBlur}
          placeholder="Write time e.g. 8:00 PM or 20:00"
          aria-label={`${label} text input`}
          className="w-full bg-transparent text-xs font-semibold text-slate-700 placeholder-slate-400 outline-none"
        />
        <span className="text-[10px] font-medium text-slate-400 whitespace-nowrap hidden sm:inline">
          (Text / Number)
        </span>
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
