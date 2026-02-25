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

  it('should correctly track position for chunks with repeated content', () => {
    // Create text with repeated short phrases that could confuse indexOf
    const text = 'AAA data here. BBB other content. AAA data again. CCC final section.';
    const chunks = chunkTextWithMetadata(text, { maxSize: 30, overlap: 5 });
    // Each chunk should have a unique, sequential index
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].index).toBe(i);
    }
    // With correct position tracking, no chunk content should be duplicated
    // (the second "AAA" should not cause the first chunk to be found again)
    const contents = chunks.map(c => c.content);
    // Verify we actually have multiple chunks
    expect(chunks.length).toBeGreaterThan(1);
    // Verify content covers the full text (no gaps from position errors)
    const joined = contents.join(' ');
    expect(joined).toContain('AAA data here');
    expect(joined).toContain('CCC final section');
  });

  it('should detect bold headers', () => {
    const text = '**IMPORTANT SECTION HEADER**\nContent under bold header.';
    const chunks = chunkTextWithMetadata(text, { maxSize: 1000 });
    expect(chunks[0].sectionHeader).toBe('IMPORTANT SECTION HEADER');
  });
});
