import { describe, it, expect } from 'vitest';
import { processSubtitles } from '../index.js';

describe('Engine Core - Focus Mode', () => {
  it('should process SRT with focus mode', () => {
    const input = `1
00:00:01,000 --> 00:00:03,000
Mike Donovan arrived yesterday.

2
00:00:04,000 --> 00:00:06,000
Sarah Chen is the lead engineer.`;

    const result = processSubtitles({
      text: input,
      format: 'srt',
      mode: 'focus',
      intensity: 0.5,
      emphasisMode: 'html',
    });

    expect(result.processedText).toContain('<b>Mik</b>e');
    expect(result.processedText).toContain('<b>Dono</b>van');
    expect(result.processedText).toContain('<b>Sar</b>ah');
    expect(result.processedText).toContain('00:00:01,000 --> 00:00:03,000');
  });

  it('should handle short lines', () => {
    const input = `1
00:00:01,000 --> 00:00:02,000
Go!

2
00:00:03,000 --> 00:00:04,000
No.`;

    const result = processSubtitles({
      text: input,
      format: 'srt',
      mode: 'focus',
      emphasisMode: 'html',
    });

    expect(result.processedText).toContain('<b>G</b>o!');
    expect(result.processedText).toContain('<b>N</b>o.');
  });

  it('should preserve stage directions', () => {
    const input = `1
00:00:01,000 --> 00:00:02,000
[door slams]

2
00:00:03,000 --> 00:00:04,000
(sighs heavily)`;

    const result = processSubtitles({
      text: input,
      format: 'srt',
      mode: 'focus',
      emphasisMode: 'html',
    });

    expect(result.processedText).toContain('[door slams]');
    expect(result.processedText).toContain('(sighs heavily)');
    expect(result.processedText).not.toContain('<b>[');
    expect(result.processedText).not.toContain('<b>(');
  });

  it('should handle punctuation correctly', () => {
    const input = `1
00:00:01,000 --> 00:00:03,000
"Hello," she said quietly.`;

    const result = processSubtitles({
      text: input,
      format: 'srt',
      mode: 'focus',
      emphasisMode: 'html',
    });

    // Should not bold punctuation fragments
    expect(result.processedText).not.toContain('<b>sh</b>e');
    expect(result.processedText).not.toContain('<b>"</b>');
    expect(result.processedText).not.toContain('<b>,</b>');
  });
});

describe('Engine Core - Calm Mode', () => {
  it('should process SRT with calm mode', () => {
    const input = `1
00:00:01,000 --> 00:00:03,000
Mike Donovan arrived yesterday.

2
00:00:04,000 --> 00:00:06,000
Sarah Chen is the lead engineer.`;

    const result = processSubtitles({
      text: input,
      format: 'srt',
      mode: 'calm',
      emphasisMode: 'html',
    });

    expect(result.processedText).toContain('<b>Mike</b>');
    expect(result.processedText).toContain('<b>Donovan</b>');
    expect(result.processedText).toContain('<b>Sarah</b>');
    expect(result.processedText).toContain('<b>Chen</b>');
  });

  it('should limit to 2 words per line', () => {
    const input = `1
00:00:01,000 --> 00:00:03,000
The quick brown fox jumps over the lazy dog.`;

    const result = processSubtitles({
      text: input,
      format: 'srt',
      mode: 'calm',
      emphasisMode: 'html',
    });

    const boldCount = (result.processedText.match(/<b>/g) || []).length;
    expect(boldCount).toBeLessThanOrEqual(2);
  });
});

describe('Engine Core - Format Support', () => {
  it('should process VTT format', () => {
    const input = `WEBVTT

00:00:01.000 --> 00:00:03.000
Hello world.`;

    const result = processSubtitles({
      text: input,
      format: 'vtt',
      mode: 'focus',
      emphasisMode: 'html',
    });

    expect(result.processedText).toContain('WEBVTT');
    expect(result.processedText).toContain('<b>');
  });

  it('should process plain text', () => {
    const input = 'Hello world.';

    const result = processSubtitles({
      text: input,
      format: 'plain',
      mode: 'focus',
      emphasisMode: 'html',
    });

    expect(result.processedText).toContain('<b>');
  });

  it('should use unicode mode when specified', () => {
    const input = 'Hello world.';

    const result = processSubtitles({
      text: input,
      format: 'plain',
      mode: 'focus',
      emphasisMode: 'unicode',
    });

    expect(result.processedText).not.toContain('<b>');
    expect(result.processedText).toMatch(/[𝐇𝐞𝐥𝐥𝐨]/u);
  });
});

describe('Engine Core - Edge Cases', () => {
  it('should handle empty input', () => {
    const result = processSubtitles({
      text: '',
      format: 'plain',
      mode: 'focus',
      emphasisMode: 'html',
    });

    expect(result.processedText).toBe('');
  });

  it('should handle intensity bounds', () => {
    const input = 'Testing intensity.';

    const low = processSubtitles({
      text: input,
      format: 'plain',
      mode: 'focus',
      intensity: 0.1,
      emphasisMode: 'html',
    });

    const high = processSubtitles({
      text: input,
      format: 'plain',
      mode: 'focus',
      intensity: 1.0,
      emphasisMode: 'html',
    });

    expect(low.processedText).toContain('<b>');
    expect(high.processedText).toContain('<b>');
  });
});
