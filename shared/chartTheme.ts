import type { CSSProperties } from 'react';

/**
 * Shared recharts styling constants — spread into CartesianGrid/XAxis/YAxis/
 * Tooltip props so every chart across the six apps shares one gridline style,
 * one tooltip look, and one axis-label size instead of each screen inventing
 * its own slightly-different values.
 */

export const ZENITH_CHART_GRID = {
  strokeDasharray: '3 3',
  stroke: 'rgba(255,255,255,0.06)',
};

export const ZENITH_CHART_AXIS_TICK = {
  fontSize: 10,
  fill: '#64748b',
  fontFamily: 'Inter, sans-serif',
};

export const ZENITH_CHART_TOOLTIP_STYLE: CSSProperties = {
  background: '#111318',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 10,
  fontSize: 12,
  fontFamily: 'Inter, sans-serif',
  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
};

export const ZENITH_CHART_TOOLTIP_LABEL_STYLE: CSSProperties = {
  color: '#94a3b8',
  fontSize: 11,
  marginBottom: 4,
};

/** The one line/bar color a chart should reach for when it needs to draw
 * attention to the primary series — everything else should be neutral. */
export const ZENITH_CHART_SIGNATURE = '#38bdf8';
