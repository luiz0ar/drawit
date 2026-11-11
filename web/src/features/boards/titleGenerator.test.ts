import { describe, it, expect } from 'vitest';
import { generateNextBoardTitle, validateBoardTitle } from './titleGenerator';

describe('titleGenerator', () => {
  it('returns Board-1 when no titles exist', () => {
    expect(generateNextBoardTitle([])).toBe('Board-1');
  });

  it('increments highest existing Board-N integer', () => {
    const titles = ['Board-1', 'Board-2', 'Board-5', 'Custom Title'];
    expect(generateNextBoardTitle(titles)).toBe('Board-6');
  });

  it('handles case-insensitivity and whitespace', () => {
    const titles = [' board-9 ', 'BOARD-3', 'other'];
    expect(generateNextBoardTitle(titles)).toBe('Board-10');
  });

  it('ignores non-matching patterns like Board-abc or Board-', () => {
    const titles = ['Board-abc', 'Board-', 'Board-10-test'];
    expect(generateNextBoardTitle(titles)).toBe('Board-1');
  });

  it('validates board title length and characters', () => {
    expect(validateBoardTitle('My Board').valid).toBe(true);
    expect(validateBoardTitle('').valid).toBe(false);
    expect(validateBoardTitle('   ').valid).toBe(false);
    expect(validateBoardTitle('a'.repeat(121)).valid).toBe(false);
    expect(validateBoardTitle('Multi\nline').valid).toBe(false);
  });
});

