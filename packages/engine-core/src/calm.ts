import nlp from 'compromise';
import { toUnicodeBold } from './bionic/unicode';

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
  'from',
  'as',
  'is',
  'was',
  'are',
  'be',
  'been',
  'it',
  'this',
  'that',
  'these',
  'those',
  'i',
  'you',
  'he',
  'she',
  'we',
  'they',
  'here',
  'there',
  'now',
  'then',
  'very',
  'just',
  'really',
  'your',
  'my',
  'his',
  'her',
  'our',
  'their',
]);

export function processCalmLine(line: string, emphasisMode: 'html' | 'unicode' = 'html'): string {
  // Dialogue detection: skip empty, sound effects, speaker prefixes
  const trimmed = line.trim();
  if (!trimmed || /^\[.*\]$/.test(trimmed) || /^[A-Z][a-z]+:/.test(trimmed)) {
    return line;
  }

  const doc = nlp(line);
  const terms = doc.terms().json();

  // Build candidates: filter by length, stopwords, content type
  const candidates = terms
    .map((term: any, index: number) => {
      const text = term.text;
      const cleanText = text.replace(/[^a-zA-Z']/g, '');
      const tags = term.terms?.[0]?.tags || [];

      const isContentWord =
        tags.includes('Noun') ||
        tags.includes('Verb') ||
        tags.includes('Adjective') ||
        tags.includes('ProperNoun');

      const isProperNoun = tags.includes('ProperNoun');
      const isStopword = STOPWORDS.has(cleanText.toLowerCase());

      // Skip HTML tags and parentheticals
      if (text.startsWith('<') || text.startsWith('(')) {
        return null;
      }

      // Length filters: ≥4 chars, or ≥3 if solo word
      const minLength = terms.length === 1 ? 3 : 4;
      if (cleanText.length < minLength) {
        return null;
      }

      // Always allow proper nouns
      if (isProperNoun) {
        return { index, text, cleanText, length: cleanText.length, isProper: true };
      }

      // Skip stopwords
      if (isStopword) {
        return null;
      }

      // Content words
      if (isContentWord) {
        return { index, text, cleanText, length: cleanText.length, isProper: false };
      }

      return null;
    })
    .filter(Boolean);

  // Sort by proper noun priority + length
  candidates.sort((a: any, b: any) => {
    const scoreA = (a.isProper ? 10 : 0) + a.length;
    const scoreB = (b.isProper ? 10 : 0) + b.length;
    return scoreB - scoreA;
  });

  // Pick max 2, avoid duplicates
  const emphasized = new Set();
  const used = new Set();

  for (const candidate of candidates) {
    if (emphasized.size >= 2) break;
    const normalized = candidate.cleanText.toLowerCase();
    if (used.has(normalized)) continue;

    emphasized.add(candidate.index);
    used.add(normalized);
  }

  return terms
    .map((term: any, index: number) => {
      const text = term.text;

      const shouldEmphasize = emphasized.has(index);

      if (!shouldEmphasize) {
        return text;
      }

      if (emphasisMode === 'html') {
        // Replace alphabetic part (including contractions) with bolded version
        return text.replace(/[a-zA-Z']+/g, (match: string) => `<b>${match}</b>`);
      } else {
        // Unicode: bold each letter individually
        return [...text].map((c) => (/[a-zA-Z]/.test(c) ? toUnicodeBold(c) : c)).join('');
      }
    })
    .join(' ');
}
