import type { ChunkOptions, ChunkWithMetadata } from '../types.js';

// Match page markers with optional surrounding bold markers or whitespace
const PAGE_MARKER_REGEX = /\*{0,2}\s*<!--\s*PAGE\s+(\d+)\s*-->\s*\*{0,2}/g;
// Match markdown headers: ## Header or ### Header (levels 1-4)
const HEADER_REGEX = /^(#{1,4})\s+(.+?)$/gm;
// Match bold text headers: **HEADER** anywhere in text (common in legal documents)
// Matches: ALL CAPS headers, Title Case headers, headers with colons/hyphens/amounts
// Must be 10+ chars to avoid matching single bold words
// Allows: letters, numbers, spaces, punctuation, currency symbols ($), parentheses
const BOLD_HEADER_REGEX = /\*\*([A-Z][A-Za-z0-9\s:'\-–—&$.,()]{8,}[A-Za-z0-9:).])\*\*/g;
// Match ALL CAPS lines as potential headers (common in legal documents)
// Must be on its own line or in a table cell by itself
// Allows: A-Z, 0-9, spaces, hyphens, colons (including trailing colon or colon+hyphen)
const CAPS_HEADER_REGEX = /^(?:\|\s*)?([A-Z][A-Z0-9\s\-:]{2,}[A-Z0-9:\-])(?:\s*\|)?$/gm;

export function chunkTextWithMetadata(
  text: string,
  options: ChunkOptions = {}
): ChunkWithMetadata[] {
  const { maxSize = 1000, overlap = 200, windowSize = 50 } = options;

  if (!text || text.trim().length === 0) {
    return [];
  }

  // Extract page markers with positions and calculate clean text positions
  const pageMarkers: { page: number; originalPos: number; cleanPos: number }[] = [];
  PAGE_MARKER_REGEX.lastIndex = 0;
  let match;
  let removedChars = 0;
  while ((match = PAGE_MARKER_REGEX.exec(text)) !== null) {
    pageMarkers.push({
      page: parseInt(match[1], 10),
      originalPos: match.index,
      cleanPos: match.index - removedChars,
    });
    removedChars += match[0].length;
  }
  PAGE_MARKER_REGEX.lastIndex = 0;

  // Remove page markers from text for chunking
  // Replace markers with newline to preserve line structure
  // Also clean up any orphaned ** that remain after marker removal
  const cleanText = text
    .replace(PAGE_MARKER_REGEX, '\n')  // Replace with newline to preserve structure
    .replace(/\*\*\s*\*\*/g, '')  // Remove empty bold markers
    .replace(/\n\*\*\s*\n/g, '\n')  // Remove lone ** on their own line
    .replace(/\n{3,}/g, '\n\n')  // Collapse multiple newlines to max 2
    .trim();

  if (cleanText.length === 0) {
    return [];
  }

  // Extract section headers from CLEAN text (simpler position matching)
  // Priority: markdown headers > bold headers > ALL CAPS headers
  const sectionHeaders: { header: string; level: number; position: number }[] = [];
  const headerPositions = new Set<number>(); // Track positions to avoid duplicates

  // 1. Markdown headers (highest priority, level 1-4)
  HEADER_REGEX.lastIndex = 0;
  while ((match = HEADER_REGEX.exec(cleanText)) !== null) {
    sectionHeaders.push({
      header: match[2].trim(),
      level: match[1].length,
      position: match.index,
    });
    headerPositions.add(match.index);
  }
  HEADER_REGEX.lastIndex = 0;

  // 2. Bold text headers **HEADER** (level 5 - below markdown)
  BOLD_HEADER_REGEX.lastIndex = 0;
  while ((match = BOLD_HEADER_REGEX.exec(cleanText)) !== null) {
    if (!headerPositions.has(match.index)) {
      sectionHeaders.push({
        header: match[1].trim(),
        level: 5,
        position: match.index,
      });
      headerPositions.add(match.index);
    }
  }
  BOLD_HEADER_REGEX.lastIndex = 0;

  // 3. ALL CAPS lines (level 6 - lowest priority, only if line is short enough to be a header)
  CAPS_HEADER_REGEX.lastIndex = 0;
  while ((match = CAPS_HEADER_REGEX.exec(cleanText)) !== null) {
    const headerText = match[1].trim();
    // Only treat as header if it's reasonably short (< 60 chars) and not already captured
    if (!headerPositions.has(match.index) && headerText.length < 60) {
      sectionHeaders.push({
        header: headerText,
        level: 6,
        position: match.index,
      });
      headerPositions.add(match.index);
    }
  }
  CAPS_HEADER_REGEX.lastIndex = 0;

  // Sort by position for proper ordering
  sectionHeaders.sort((a, b) => a.position - b.position);

  // Separate header positions from page break positions
  // Headers get priority breaks even early in chunk
  const headerPositionSet: Set<number> = new Set();
  sectionHeaders.forEach(h => headerPositionSet.add(h.position));
  const sortedHeaderBreaks = [...headerPositionSet].sort((a, b) => a - b);

  // Page markers still use minBreak threshold
  const pageBreakPositions: Set<number> = new Set();
  pageMarkers.forEach(p => pageBreakPositions.add(p.cleanPos));

  // Chunk the clean text with semantic breaks
  const rawChunks: string[] = [];
  let start = 0;
  const step = Math.max(maxSize - overlap, 1);

  // Minimum chunk size to prevent tiny fragments (100 chars or 10% of maxSize)
  const minChunkForHeaderBreak = Math.max(100, Math.floor(maxSize / 10));

  while (start < cleanText.length) {
    let end = Math.min(start + maxSize, cleanText.length);

    // Try to break at semantic boundaries
    // Priority: headers (even early) > page breaks > paragraph > sentence
    if (end < cleanText.length) {
      const minBreak = start + Math.floor(maxSize / 2);

      // 1. FIRST: Look for header break - allow breaks even early in chunk
      const headerBreak = sortedHeaderBreaks.find(
        pos => pos > start + minChunkForHeaderBreak && pos <= end
      );

      if (headerBreak !== undefined) {
        end = headerBreak;
      } else {
        // 2. Look for page break within normal range
        const pageBreak = [...pageBreakPositions].find(
          pos => pos > minBreak && pos <= end
        );

        if (pageBreak !== undefined) {
          end = pageBreak;
        } else {
          // 3. Try paragraph break (double newline)
          const lastParagraph = cleanText.lastIndexOf('\n\n', end);
          if (lastParagraph > minBreak) {
            end = lastParagraph + 1;
          } else {
            // 4. Try sentence/line break
            const lastPeriod = cleanText.lastIndexOf('.', end);
            const lastNewline = cleanText.lastIndexOf('\n', end);
            const breakPoint = Math.max(lastPeriod, lastNewline);
            if (breakPoint > minBreak) {
              end = breakPoint + 1;
            }
          }
        }
      }
    }

    const chunk = cleanText.slice(start, end).trim();
    if (chunk.length > 0) {
      rawChunks.push(chunk);
    }
    start = start + step;
    if (start >= end) {
      start = end; // Avoid infinite loop
    }
  }

  // Filter out very small chunks (less than 20 chars) unless we'd end up with nothing
  const minChunkSize = Math.min(20, maxSize / 2);
  let filteredChunks = rawChunks.filter(chunk => chunk.length >= minChunkSize);

  // If filtering removed everything, keep all chunks
  if (filteredChunks.length === 0 && rawChunks.length > 0) {
    filteredChunks = rawChunks;
  }

  // Find page number for a position in clean text
  function findPageForPosition(positionInClean: number): number | undefined {
    const preceding = pageMarkers.filter(m => m.cleanPos <= positionInClean);
    if (preceding.length > 0) {
      return preceding[preceding.length - 1].page;
    }
    return undefined;
  }

  // Find section header for a chunk
  function findSectionHeaderForChunk(chunkStart: number, chunkEnd: number): string | undefined {
    const lookAhead = Math.min(100, (chunkEnd - chunkStart) / 2);
    const headersUpToStart = sectionHeaders.filter(h => h.position <= chunkStart + lookAhead);
    if (headersUpToStart.length > 0) {
      return headersUpToStart[headersUpToStart.length - 1].header;
    }
    return undefined;
  }

  // Add metadata to chunks
  let currentPosition = 0;
  return filteredChunks.map((content, index) => {
    const chunkStart = cleanText.indexOf(content, currentPosition);
    const chunkEnd = chunkStart + content.length;
    currentPosition = chunkStart + 1;

    const startPage = findPageForPosition(chunkStart);
    const endPage = findPageForPosition(chunkEnd);

    let pageNumber: number | undefined;
    let pageRange: [number, number] | undefined;

    if (startPage !== undefined && endPage !== undefined && startPage !== endPage) {
      pageRange = [startPage, endPage];
      pageNumber = startPage;
    } else if (startPage !== undefined) {
      pageNumber = startPage;
    }

    const sectionHeader = findSectionHeaderForChunk(chunkStart, chunkEnd);

    return {
      content,
      index,
      pageNumber,
      pageRange,
      windowBefore: index > 0 ? filteredChunks[index - 1].slice(-windowSize) : '',
      windowAfter: index < filteredChunks.length - 1 ? filteredChunks[index + 1].slice(0, windowSize) : '',
      sectionHeader,
    };
  });
}
