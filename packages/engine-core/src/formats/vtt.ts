export function processVtt(
    input: string,
    processLine: (line: string) => string
  ): string {
    const lines = input.split('\n');
    const result: string[] = ['WEBVTT', ''];
  
    // Remove WEBVTT header if present
    let startIndex = 0;
    if (lines[0].startsWith('WEBVTT')) {
      startIndex = 1;
      if (lines[1] === '') startIndex = 2; // Skip empty line after header
    }
  
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
  
      // Skip numeric cue IDs (lines that are just numbers)
      if (/^\d+$/.test(line.trim())) {
        continue;
      }
  
      // Check if it's a timing line
      if (line.includes('-->')) {
        result.push(line);
      } else if (line.trim() === '') {
        result.push('');
      } else {
        // Split HTML tags from text content
        const parts = line.split(/(<[^>]+>)/g).filter(Boolean);
        
        // Process only text parts, preserve HTML tags
        const processed = parts.map(part => 
          part.startsWith('<') ? part : processLine(part)
        ).join('');
        
        result.push(processed);
      }
    }
  
    return result.join('\n');
  }