export function processSrt(input: string, processLine: (line: string) => string): string {
  const lines = input.split('\n');
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip empty lines
    if (line.trim() === '') {
      result.push(line);
      continue;
    }

    // Skip subtitle indices (lines that are just numbers)
    if (/^\d+$/.test(line.trim())) {
      result.push(line);
      continue;
    }

    // Skip timing lines (contain -->)
    if (line.includes('-->')) {
      result.push(line);
      continue;
    }

    // Split HTML tags from text content
    const parts = line.split(/(<[^>]+>)/g).filter(Boolean);

    // Process only text parts, preserve HTML tags
    const processed = parts
      .map((part) => (part.startsWith('<') ? part : processLine(part)))
      .join('');

    result.push(processed);
  }

  return result.join('\n');
}
