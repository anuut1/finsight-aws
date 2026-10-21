import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import QuickAddBar from '../components/QuickAddBar.jsx';

describe('QuickAddBar Component', () => {
  it('renders input, microphone, and scan buttons', () => {
    render(<QuickAddBar onSubmit={vi.fn()} onVoiceClick={vi.fn()} onScanClick={vi.fn()} />);

    expect(screen.getByPlaceholderText(/Type, speak, or scan/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /speak transaction/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /scan receipt/i })).toBeInTheDocument();
  });

  it('allows user to type and submit text without triggering voice recorder', () => {
    const handleSubmit = vi.fn();
    const handleVoice = vi.fn();
    render(<QuickAddBar onSubmit={handleSubmit} onVoiceClick={handleVoice} onScanClick={vi.fn()} />);

    const input = screen.getByPlaceholderText(/Type, speak, or scan/i);
    fireEvent.change(input, { target: { value: 'Coffee 180 at Blue Tokai' } });
    expect(input.value).toBe('Coffee 180 at Blue Tokai');

    fireEvent.submit(input.closest('form'));

    // onSubmit was called with typed text
    expect(handleSubmit).toHaveBeenCalledWith('Coffee 180 at Blue Tokai');
    // Voice recorder was NOT triggered
    expect(handleVoice).not.toHaveBeenCalled();
    // Input is cleared
    expect(input.value).toBe('');
  });

  it('triggers onVoiceClick when mic button is clicked', () => {
    const handleVoice = vi.fn();
    render(<QuickAddBar onSubmit={vi.fn()} onVoiceClick={handleVoice} onScanClick={vi.fn()} />);

    const micBtn = screen.getByRole('button', { name: /speak transaction with voice/i });
    fireEvent.click(micBtn);

    expect(handleVoice).toHaveBeenCalledTimes(1);
  });

  it('triggers onScanClick when scan button is clicked', () => {
    const handleScan = vi.fn();
    render(<QuickAddBar onSubmit={vi.fn()} onVoiceClick={vi.fn()} onScanClick={handleScan} />);

    const scanBtn = screen.getByRole('button', { name: /scan receipt/i });
    fireEvent.click(scanBtn);

    expect(handleScan).toHaveBeenCalledTimes(1);
  });
});
