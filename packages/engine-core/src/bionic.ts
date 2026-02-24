import nlp from 'compromise';
import { toUnicodeBold } from './bionic/unicode';

const CONNECTORS = new Set([
  // Articles
  'the',
  'a',
  'an',
  // Conjunctions
  'and',
  'or',
  'but',
  'nor',
  'yet',
  'so',
  // Prepositions
  'to',
  'for',
  'of',
  'in',
  'on',
  'at',
  'by',
  'with',
  'from',
  'as',
  'into',
  'onto',
  'upon',
  'about',
  'above',
  'across',
  'after',
  'against',
  'along',
  'among',
  'around',
  'before',
  'behind',
  'below',
  'beneath',
  'beside',
  'between',
  'beyond',
  'during',
  'except',
  'inside',
  'near',
  'off',
  'out',
  'over',
  'through',
  'toward',
  'under',
  'until',
  'up',
  'via',
  'within',
  'without',
  // Common verbs (to be, to have)
  'is',
  'am',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'has',
  'have',
  'had',
  // Common auxiliaries
  'do',
  'does',
  'did',
  'will',
  'would',
  'shall',
  'should',
  'can',
  'could',
  'may',
  'might',
  'must',
  // Other common function words
  'this',
  'that',
  'these',
  'those',
  'what',
  'which',
  'who',
  'whom',
  'whose',
  'when',
  'where',
  'why',
  'how',
  'if',
  'than',
  'then',
  'there',
]);

const PRONOUNS = new Set([
  'i',
  'you',
  'he',
  'she',
  'it',
  'we',
  'they',
  'me',
  'him',
  'her',
  'us',
  'them',
  'my',
  'your',
  'his',
  'its',
  'our',
  'their',
]);

const ARTICLES = new Set(['the', 'a', 'an']);

export function processFocusLine(
  line: string,
  intensity = 0.5,
  mode: 'html' | 'unicode' = 'html',
): string {
  // Skip full stage directions
  const trimmed = line.trim();
  if (
    (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
    (trimmed.startsWith('(') && trimmed.endsWith(')'))
  ) {
    return line;
  }

  const doc = nlp(line);
  const terms = doc.terms().json();

  // Density modulation: reduce emphasis on long lines
  const densityFactor = terms.length > 7 ? 0.8 : 1.0;

  let result = '';
  let cursor = 0;
  let skipNext = false;
  let prevText = '';

  for (const term of terms) {
    const text = term.text;
    const index = line.indexOf(text, cursor);

    if (index > cursor) {
      const gap = line.slice(cursor, index);
      result += gap;
      // Check if gap ends with punctuation that should suppress next word
      if (/["—\-]\s*$/.test(gap)) {
        skipNext = true;
      }
    }
    cursor = index + text.length;

    // Clean punctuation for length check
    const cleanText = text.replace(/[^a-zA-Z]/g, '');

    // Skip if no alphabetic characters or starts with non-letter (quotes, brackets, etc.)
    if (cleanText.length === 0 || /^[^a-zA-Z]/.test(text)) {
      result += text;
      prevText = text;
      continue;
    }

    // Skip very short words (unless solo word)
    if (cleanText.length < 3 && terms.length > 1) {
      result += text;
      prevText = text;
      continue;
    }

    // Skip if after punctuation (from gap or previous term)
    if (skipNext || /["']$/.test(prevText)) {
      result += text;
      skipNext = false;
      prevText = text;
      continue;
    }

    const isPronoun = PRONOUNS.has(cleanText.toLowerCase());
    const isArticle = ARTICLES.has(cleanText.toLowerCase());
    const isConnector = CONNECTORS.has(cleanText.toLowerCase());

    // Skip pronouns in dense lines (≥6 words)
    if (isPronoun && terms.length >= 6) {
      result += text;
      prevText = text;
      continue;
    }

    // Skip articles in dense lines (≥6 words)
    if (isArticle && terms.length >= 6) {
      result += text;
      prevText = text;
      continue;
    }

    // Skip short connectors in dense lines (≥7 words)
    if (isConnector && cleanText.length <= 3 && terms.length >= 7) {
      result += text;
      prevText = text;
      continue;
    }

    const tags = term.terms?.[0]?.tags || [];
    const isContentWord =
      tags.includes('Noun') ||
      tags.includes('Verb') ||
      tags.includes('Adjective') ||
      tags.includes('ProperNoun');

    // Three-tier system: Content (0.6) > Connectors (0.25) > Pronouns (0.15)
    const baseFactor =
      (isContentWord ? 0.6 : isPronoun ? 0.15 : isConnector ? 0.25 : 0.4) * densityFactor;
    let splitAt = Math.max(1, Math.ceil(cleanText.length * (baseFactor * intensity + 0.2)));

    // Enforce minimum 3 chars unless word ≤4 (but not for connectors or pronouns)
    if (!isConnector && !isPronoun && cleanText.length >= 4 && splitAt < 3) {
      splitAt = 3;
    }

    // Cap connectors and pronouns at 2 chars max
    if (isConnector || isPronoun) {
      splitAt = Math.min(splitAt, 2);
    }

    const head = text.slice(0, splitAt);
    const tail = text.slice(splitAt);

    if (mode === 'html') {
      result += `<b>${head}</b>${tail}`;
    } else {
      // Unicode: bold only first splitAt alphabetic characters, preserve punctuation
      let bolded = '';
      let alphaCount = 0;
      for (const char of text) {
        if (/[a-zA-Z]/.test(char) && alphaCount < splitAt) {
          bolded += toUnicodeBold(char);
          alphaCount++;
        } else {
          bolded += char;
        }
      }
      result += bolded;
    }

    prevText = text;
  }

  if (cursor < line.length) {
    result += line.slice(cursor);
  }

  return result;
}
