/**
 * Enhanced fuzzy string matching for faculty names.
 * Combines Levenshtein distance, token overlap, and substring matching
 * to handle OCR-induced typos in scanned timetable PDFs.
 */

export interface FuzzyMatchResult {
  match: string;
  score: number;
  method: 'exact' | 'levenshtein' | 'token-overlap' | 'substring';
}

export function fuzzyMatch(
  query: string,
  candidates: string[],
  threshold: number = 0.55
): FuzzyMatchResult | null {
  if (!query || !query.trim() || candidates.length === 0) return null;

  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return null;

  let bestMatch: string | null = null;
  let bestScore = 0;
  let bestMethod: FuzzyMatchResult['method'] = 'levenshtein';

  for (const candidate of candidates) {
    const normalizedCandidate = normalize(candidate);
    if (!normalizedCandidate) continue;

    // 1. Exact match after normalization
    if (normalizedQuery === normalizedCandidate) {
      return { match: candidate, score: 1.0, method: 'exact' };
    }

    // 2. Levenshtein similarity
    const levScore = similarity(normalizedQuery, normalizedCandidate);

    // 3. Token overlap score (handles reordered or partially matching names)
    const tokenScore = tokenOverlapScore(normalizedQuery, normalizedCandidate);

    // 4. Substring matching (handles cases where OCR drops prefixes)
    const subScore = substringScore(normalizedQuery, normalizedCandidate);

    // Take the best of all methods
    const scores: Array<{ score: number; method: FuzzyMatchResult['method'] }> = [
      { score: levScore, method: 'levenshtein' },
      { score: tokenScore, method: 'token-overlap' },
      { score: subScore, method: 'substring' },
    ];

    for (const s of scores) {
      if (s.score > bestScore) {
        bestScore = s.score;
        bestMatch = candidate;
        bestMethod = s.method;
      }
    }
  }

  if (bestMatch && bestScore >= threshold) {
    return { match: bestMatch, score: bestScore, method: bestMethod };
  }

  return null;
}

/**
 * Normalize a name: strip titles, lowercase, remove special chars.
 */
function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/\b(dr|prof|mr|mrs|ms|shri|smt|er|ing)\.?\s*/gi, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Levenshtein-based similarity (0 to 1).
 */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const distance = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return 1 - distance / maxLen;
}

/**
 * Token overlap score: measures how many word tokens from the query
 * appear in the candidate. Good for partial name matches.
 * e.g. "Shruti Garg" vs "Dr. Shruti Garg" → 1.0 overlap
 */
function tokenOverlapScore(a: string, b: string): number {
  const tokensA = a.split(/\s+/).filter((t) => t.length > 1);
  const tokensB = b.split(/\s+/).filter((t) => t.length > 1);

  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  let matchCount = 0;
  for (const tokenA of tokensA) {
    for (const tokenB of tokensB) {
      // Allow fuzzy token match (1-2 char tolerance for OCR errors)
      if (tokenA === tokenB) {
        matchCount++;
        break;
      } else if (tokenA.length >= 3 && tokenB.length >= 3) {
        const tokenSim = similarity(tokenA, tokenB);
        if (tokenSim >= 0.7) {
          matchCount += tokenSim;
          break;
        }
      }
    }
  }

  // Score based on how many of the query's tokens matched
  const minTokens = Math.min(tokensA.length, tokensB.length);
  return matchCount / Math.max(minTokens, 1);
}

/**
 * Substring score: if the query (or candidate) is a clean substring
 * of the other, return a high score proportional to length coverage.
 * e.g. "b k sarkar" in "b k sarkar" → 1.0
 * e.g. "sarkar" in "b k sarkar" → 0.6 (length ratio)
 */
function substringScore(a: string, b: string): number {
  if (a.includes(b)) {
    return b.length / a.length;
  }
  if (b.includes(a)) {
    return a.length / b.length;
  }
  return 0;
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
