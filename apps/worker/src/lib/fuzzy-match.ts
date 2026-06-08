/**
 * Fuzzy string matching for faculty names.
 * Uses Levenshtein distance normalized to string length.
 */

export function fuzzyMatch(query: string, candidates: string[]): { match: string; score: number } | null {
  const normalizedQuery = normalize(query);
  let bestMatch: string | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const normalizedCandidate = normalize(candidate);
    const score = similarity(normalizedQuery, normalizedCandidate);

    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  // Threshold: must be at least 70% similar
  if (bestMatch && bestScore >= 0.7) {
    return { match: bestMatch, score: bestScore };
  }

  return null;
}

function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/\b(dr|prof|mr|mrs|ms|shri|smt)\.?\s*/gi, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const distance = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return 1 - distance / maxLen;
}

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}
