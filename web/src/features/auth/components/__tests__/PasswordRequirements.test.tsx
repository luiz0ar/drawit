import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PasswordRequirements } from '../PasswordRequirements';

describe('PasswordRequirements component', () => {
  it('renders all 5 requirements', () => {
    render(<PasswordRequirements password="abc" />);
    expect(screen.getByText(/at least 8 characters/i)).toBeDefined();
    expect(screen.getByText(/at least one uppercase letter/i)).toBeDefined();
    expect(screen.getByText(/at least one lowercase letter/i)).toBeDefined();
    expect(screen.getByText(/at least one number/i)).toBeDefined();
    expect(screen.getByText(/at least one special character/i)).toBeDefined();
  });

  it('marks lowercase as met when lowercase character is provided', () => {
    const { container } = render(<PasswordRequirements password="abc" />);
    const lowercaseItem = container.querySelector('li:nth-child(3)');
    expect(lowercaseItem?.className).toContain('text-emerald');
  });

  it('hides component when hideWhenValid is true and password is valid', () => {
    const { container } = render(
      <PasswordRequirements password="Valid123!@#" hideWhenValid />
    );
    expect(container.firstChild).toBeNull();
  });
});

