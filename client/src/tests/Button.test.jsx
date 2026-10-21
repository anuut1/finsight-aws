import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Button from '../components/Button.jsx';

describe('Button Component', () => {
  it('renders children correctly', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
  });

  it('handles click events when enabled', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Submit</Button>);

    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire click events when disabled', () => {
    const handleClick = vi.fn();
    render(<Button disabled onClick={handleClick}>Disabled</Button>);

    const btn = screen.getByRole('button', { name: /disabled/i });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('renders loading state with aria-busy and disables interaction', () => {
    const handleClick = vi.fn();
    render(<Button loading onClick={handleClick}>Processing</Button>);

    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('renders appropriate variant and size class names', () => {
    const { rerender } = render(<Button variant="danger" size="lg">Delete</Button>);
    let btn = screen.getByRole('button');
    expect(btn).toHaveClass('btn-danger', 'btn-lg');

    rerender(<Button variant="secondary" size="sm">Cancel</Button>);
    btn = screen.getByRole('button');
    expect(btn).toHaveClass('btn-secondary', 'btn-sm');
  });

  it('renders success state swap with successText', () => {
    render(<Button success successText="Saved!">Save</Button>);
    expect(screen.getByText('Saved!')).toBeInTheDocument();
  });
});
