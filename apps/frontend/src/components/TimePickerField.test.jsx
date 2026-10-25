import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import TimePickerField, {
  parseTime24,
  formatTo24,
  formatFriendly12Hour,
  parseFlexibleTimeString,
} from './TimePickerField';

describe('TimePickerField utility functions', () => {
  it('parses 24h evening time correctly to 12h PM', () => {
    const res = parseTime24('21:00');
    expect(res).toEqual({ hour: '09', minute: '00', period: 'PM' });
  });

  it('parses 24h morning time correctly to 12h AM', () => {
    const res = parseTime24('07:30');
    expect(res).toEqual({ hour: '07', minute: '30', period: 'AM' });
  });

  it('parses midnight (00:00) to 12:00 AM', () => {
    const res = parseTime24('00:00');
    expect(res).toEqual({ hour: '12', minute: '00', period: 'AM' });
  });

  it('parses noon (12:00) to 12:00 PM', () => {
    const res = parseTime24('12:00');
    expect(res).toEqual({ hour: '12', minute: '00', period: 'PM' });
  });

  it('formats 12h PM to 24h correctly', () => {
    expect(formatTo24('09', '00', 'PM')).toBe('21:00');
    expect(formatTo24('12', '15', 'PM')).toBe('12:15');
  });

  it('formats 12h AM to 24h correctly', () => {
    expect(formatTo24('07', '30', 'AM')).toBe('07:30');
    expect(formatTo24('12', '00', 'AM')).toBe('00:00');
  });

  it('formats friendly display string', () => {
    expect(formatFriendly12Hour('21:00')).toBe('9:00 PM');
    expect(formatFriendly12Hour('07:05')).toBe('7:05 AM');
  });

  it('parses flexible time strings into 24h format', () => {
    expect(parseFlexibleTimeString('8:00 PM')).toBe('20:00');
    expect(parseFlexibleTimeString('8:30 pm')).toBe('20:30');
    expect(parseFlexibleTimeString('20:00')).toBe('20:00');
    expect(parseFlexibleTimeString('7:00 AM')).toBe('07:00');
    expect(parseFlexibleTimeString('8.30 pm')).toBe('20:30');
    expect(parseFlexibleTimeString('8pm')).toBe('20:00');
    expect(parseFlexibleTimeString('7am')).toBe('07:00');
    expect(parseFlexibleTimeString('23:45')).toBe('23:45');
    expect(parseFlexibleTimeString('invalid')).toBeNull();
  });
});

describe('TimePickerField component interaction', () => {
  it('renders time and calls onChange when hour or period changes', () => {
    const handleChange = vi.fn();
    render(
      <TimePickerField
        id="testStart"
        label="Starts At"
        value="21:00"
        onChange={handleChange}
        presets={[{ label: '8:30 PM', time24: '20:30' }]}
      />
    );

    expect(screen.getByText('9:00 PM')).toBeInTheDocument();

    // Click AM button
    const amBtn = screen.getByRole('button', { name: 'AM' });
    fireEvent.click(amBtn);
    expect(handleChange).toHaveBeenCalledWith('09:00');

    // Click quick preset
    const presetBtn = screen.getByRole('button', { name: '8:30 PM' });
    fireEvent.click(presetBtn);
    expect(handleChange).toHaveBeenCalledWith('20:30');
  });

  it('allows parent to write numbers directly into hour and minute inputs', () => {
    const handleChange = vi.fn();
    render(
      <TimePickerField
        id="testStart"
        label="Starts At"
        value="21:00"
        onChange={handleChange}
      />
    );

    // Type 8 into hour input
    const hourInput = screen.getByLabelText('Starts At hour');
    fireEvent.change(hourInput, { target: { value: '8' } });
    expect(handleChange).toHaveBeenCalledWith('20:00');

    // Type 45 into minute input
    const minInput = screen.getByLabelText('Starts At minute');
    fireEvent.change(minInput, { target: { value: '45' } });
    expect(handleChange).toHaveBeenCalledWith('21:45');
  });

  it('allows parent to write the time directly as text', () => {
    const handleChange = vi.fn();
    render(
      <TimePickerField
        id="testStart"
        label="Starts At"
        value="21:00"
        onChange={handleChange}
      />
    );

    const textInput = screen.getByLabelText('Starts At text input');
    fireEvent.change(textInput, { target: { value: '8:15 PM' } });
    expect(handleChange).toHaveBeenCalledWith('20:15');

    fireEvent.change(textInput, { target: { value: '22:30' } });
    expect(handleChange).toHaveBeenCalledWith('22:30');
  });

  it('allows selecting hour and minute via dropdown menus', () => {
    const handleChange = vi.fn();
    render(
      <TimePickerField
        id="testStart"
        label="Starts At"
        value="21:00"
        onChange={handleChange}
      />
    );

    // Open hour dropdown and click 10
    const hourDropdownBtn = screen.getByLabelText('Open Starts At hour dropdown');
    fireEvent.click(hourDropdownBtn);
    const hourOption = screen.getByRole('button', { name: '10' });
    fireEvent.click(hourOption);
    expect(handleChange).toHaveBeenCalledWith('22:00');

    // Open minute dropdown and click 30
    const minDropdownBtn = screen.getByLabelText('Open Starts At minute dropdown');
    fireEvent.click(minDropdownBtn);
    const minOption = screen.getByRole('button', { name: '30' });
    fireEvent.click(minOption);
    expect(handleChange).toHaveBeenCalledWith('21:30');
  });
});
