/**
 * Calculates the next default board title based on existing boards (including trashed).
 * Parses titles matching /^Board-(\d+)$/i and finds the maximum N.
 * Returns `Board-${maxN + 1}` (or `Board-1` if no matching titles).
 */
export function generateNextBoardTitle(existingTitles: string[]): string {
  let maxN = 0;
  const regex = /^Board-(\d+)$/i;

  for (const title of existingTitles) {
    if (!title) continue;
    const match = title.trim().match(regex);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxN) {
        maxN = num;
      }
    }
  }

  return `Board-${maxN + 1}`;
}

/**
 * Validates board title according to specification:
 * - 1 to 120 characters
 * - No line breaks
 * - Not empty or only whitespace
 */
export function validateBoardTitle(title: string): { valid: boolean; error?: string } {
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Title cannot be empty.' };
  }
  if (trimmed.length > 120) {
    return { valid: false, error: 'Title must not exceed 120 characters.' };
  }
  if (/[\r\n]/.test(title)) {
    return { valid: false, error: 'Title cannot contain line breaks.' };
  }
  return { valid: true };
}

