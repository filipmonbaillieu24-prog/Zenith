import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BRAIN_REGISTRY, BrainStatus, DATA_SOURCES } from '@zenith/shared';
import { ModelFlowDiagram, NODE_W } from '../ModelFlowDiagram';

/**
 * The diagram is laid out by arithmetic, not by the browser, so nothing stops a node
 * from being drawn on top of another or off the bottom of the canvas - which is exactly
 * what happened when the source column grew group headings and the height was still
 * computed from the node count alone.
 *
 * These render the real registry and check the geometry that a screenshot would.
 */

const statuses: BrainStatus[] = BRAIN_REGISTRY.map(entry => ({
  entry,
  hasStoredWeights: entry.id.length % 2 === 0,
  learnedShift: 0,
  data: entry.training
    ? { usable: 12, considered: 20, oldest: '2026-08-01', newest: '2026-08-26' }
    : null,
  error: null
}));

const markup = renderToStaticMarkup(<ModelFlowDiagram statuses={statuses} />);

interface Box { x: number; y: number; w: number; h: number }

function boxes(): Box[] {
  const out: Box[] = [];
  const re = /<rect[^>]*?x="([-\d.]+)"[^>]*?y="([-\d.]+)"[^>]*?width="([-\d.]+)"[^>]*?height="([-\d.]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markup)) !== null) {
    out.push({ x: +m[1], y: +m[2], w: +m[3], h: +m[4] });
  }
  return out;
  }

const viewBox = () => {
  const m = markup.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  if (!m) throw new Error('diagram has no viewBox');
  return { w: +m[1], h: +m[2] };
};

describe('the connection diagram is laid out without collisions', () => {
  it('draws something for every model, source and surface', () => {
    for (const entry of BRAIN_REGISTRY) {
      expect(markup).toContain(entry.name);
      for (const surface of entry.surfaces) expect(markup).toContain(surface);
      for (const read of entry.reads) expect(markup).toContain(DATA_SOURCES[read.source].label);
    }
  });

  it('keeps every node inside the canvas', () => {
    const { w, h } = viewBox();
    // Progress bars are drawn flush with the bottom edge of their node, so a node
    // running past the canvas takes its bar with it.
    for (const b of boxes()) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(w);
      expect(b.y + b.h).toBeLessThanOrEqual(h);
    }
  });

  it('never overlaps two nodes in the same column', () => {
    // Nodes are full-width in their column; the progress bar is not, so grouping by
    // left edge and ignoring the thin bars leaves exactly the node rectangles.
    const nodes = boxes().filter(b => b.h > 4);
    const columns = new Map<number, Box[]>();
    for (const b of nodes) {
      const col = columns.get(b.x) ?? [];
      col.push(b);
      columns.set(b.x, col);
    }
    expect(columns.size).toBe(3);

    for (const [x, col] of columns) {
      const sorted = [...col].sort((a, b) => a.y - b.y);
      for (let i = 1; i < sorted.length; i++) {
        const above = sorted[i - 1];
        expect(
          sorted[i].y,
          `two nodes overlap in the column at x=${x}`
        ).toBeGreaterThanOrEqual(above.y + above.h);
      }
    }
  });

  it('leaves every label room inside its node', () => {
    // A rough width estimate rather than real metrics: the point is to fail when a new
    // model is given a name too long for the box, which is how the labels ended up
    // truncated to 24 characters in the first place.
    const PER_CHAR = 5.9;
    const widest = Math.max(
      ...BRAIN_REGISTRY.flatMap(e => [
        e.name.length * PER_CHAR + 30, // models are inset past their status dot
        ...e.surfaces.map(s => s.length * PER_CHAR + 22),
        ...e.reads.map(r => DATA_SOURCES[r.source].label.length * PER_CHAR + 22)
      ])
    );
    expect(widest).toBeLessThanOrEqual(NODE_W);
  });
});
