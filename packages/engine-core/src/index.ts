import { processSrt } from './formats/srt';
import { processVtt } from './formats/vtt';
import { processAss } from './formats/ass';
import { processFocusLine } from './bionic';
import { processCalmLine } from './calm';

export type SubtitleFormat = 'srt' | 'vtt' | 'ass' | 'plain';
export type EmphasisMode = 'html' | 'unicode';

export interface ProcessOptions {
  text: string;
  format: SubtitleFormat;
  mode: 'focus' | 'calm';
  intensity?: number;
  client?: 'web' | 'extension' | 'stremio' | 'other';
  emphasisMode?: EmphasisMode;
}

export interface ProcessResult {
  processedText: string;
}

export function resolveEmphasisMode(format: SubtitleFormat, override?: EmphasisMode): EmphasisMode {
  if (override) return override;
  switch (format) {
    case 'vtt':
    case 'plain':
      return 'html';
    case 'srt':
    case 'ass':
      return 'unicode';
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

export function processSubtitles(options: ProcessOptions): ProcessResult {
  const { text, format, mode, intensity = 0.5, emphasisMode } = options;
  const renderMode = resolveEmphasisMode(format, emphasisMode);

  const processor =
    mode === 'focus'
      ? (line: string) => processFocusLine(line, intensity, renderMode)
      : (line: string) => processCalmLine(line, renderMode);

  switch (format) {
    case 'srt':
      return { processedText: processSrt(text, processor) };
    case 'vtt':
      return { processedText: processVtt(text, processor) };
    case 'ass':
      return { processedText: processAss(text, processor) };
    case 'plain':
      return { processedText: processor(text) };
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}
