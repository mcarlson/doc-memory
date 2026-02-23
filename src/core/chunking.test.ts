import { describe, it, expect } from 'vitest';
import { chunkTextWithMetadata } from './chunking.js';

describe('chunkTextWithMetadata', () => {
  it('should return empty array for empty text', () => {
    expect(chunkTextWithMetadata('')).toEqual([]);
  });

  it('should return empty array for whitespace-only text', () => {
    expect(chunkTextWithMetadata('   \n\n  ')).toEqual([]);
  });

  it('should chunk text with page markers', () => {
    const text = '<!-- PAGE 1 -->First page content.\n<!-- PAGE 2 -->Second page.';
    const chunks = chunkTextWithMetadata(text, { maxSize: 50 });
    expect(chunks[0].pageNumber).toBe(1);
  });

  it('should detect section headers', () => {
    const text = '## Introduction\nThis is the intro.\n## Methods\nThese are methods.';
    const chunks = chunkTextWithMetadata(text, { maxSize: 50 });
    expect(chunks.some(c => c.sectionHeader === 'Introduction')).toBe(true);
  });

  it('should include window context', () => {
    const text = 'First chunk content here. Second chunk content here. Third chunk content here for testing.';
    const chunks = chunkTextWithMetadata(text, { maxSize: 30, overlap: 5, windowSize: 10 });
    expect(chunks.length).toBeGreaterThan(1);
    if (chunks.length > 1) {
      expect(chunks[1].windowBefore.length).toBeGreaterThan(0);
    }
  });

  it('should handle single chunk text', () => {
    const text = 'Short text.';
    const chunks = chunkTextWithMetadata(text, { maxSize: 1000 });
    expect(chunks.length).toBe(1);
    expect(chunks[0].content).toBe('Short text.');
    expect(chunks[0].index).toBe(0);
    expect(chunks[0].windowBefore).toBe('');
    expect(chunks[0].windowAfter).toBe('');
  });

  it('should detect bold headers', () => {
    const text = '**IMPORTANT SECTION HEADER**\nContent under bold header.';
    const chunks = chunkTextWithMetadata(text, { maxSize: 1000 });
    expect(chunks[0].sectionHeader).toBe('IMPORTANT SECTION HEADER');
  });
});
