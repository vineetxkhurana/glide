export function processAss(
  input: string,
  processLine: (line: string) => string
): string {
  const lines = input.split('\n')
  const result: string[] = []

  for (const line of lines) {
    if (line.startsWith('Dialogue:')) {
      const parts = line.split(',')
      const dialogueText = parts.slice(9).join(',')
      
      // Split HTML tags from text content
      const segments = dialogueText.split(/(<[^>]+>)/g).filter(Boolean)
      
      // Process only text parts, preserve HTML tags
      const processed = segments.map(part => 
        part.startsWith('<') ? part : processLine(part)
      ).join('')
      
      result.push([...parts.slice(0, 9), processed].join(','))
    } else {
      result.push(line)
    }
  }

  return result.join('\n')
}
