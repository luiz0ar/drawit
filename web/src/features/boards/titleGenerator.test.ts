import { describe, it, expect } from 'vitest';
import { generateNextBoardTitle, validateBoardTitle } from './titleGenerator';

describe('titleGenerator', () => {
  it('returns Quadro-1 when no titles exist', () => {
    expect(generateNextBoardTitle([])).toBe('Quadro-1');
  });

  it('increments highest existing Quadro-N integer', () => {
    const titles = ['Quadro-1', 'Quadro-2', 'Quadro-5', 'Custom Title'];
    expect(generateNextBoardTitle(titles)).toBe('Quadro-6');
  });

  it('handles case-insensitivity and whitespace', () => {
    const titles = [' quadro-9 ', 'QUADRO-3', 'other'];
    expect(generateNextBoardTitle(titles)).toBe('Quadro-10');
  });

  it('ignores non-matching patterns like Quadro-abc or Quadro-', () => {
    const titles = ['Quadro-abc', 'Quadro-', 'Quadro-10-test'];
    expect(generateNextBoardTitle(titles)).toBe('Quadro-1');
  });

  it('validates board title length and characters', () => {
    expect(validateBoardTitle('My Board').valid).toBe(true);
    expect(validateBoardTitle('').valid).toBe(false);
    expect(validateBoardTitle('   ').valid).toBe(false);
    expect(validateBoardTitle('a'.repeat(121)).valid).toBe(false);
    expect(validateBoardTitle('Multi\nline').valid).toBe(false);
  });
});

