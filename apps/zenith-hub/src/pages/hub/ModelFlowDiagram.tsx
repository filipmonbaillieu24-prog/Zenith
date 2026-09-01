import React, { useMemo } from 'react';
import { BrainStatus } from '@zenith/shared';

/**
 * Which model reads what, feeds where, and what state it is in.
 *
 * Three columns and the lines between them. The point of drawing it rather than listing
 * it is that the shared inputs become visible: sleep feeds three different models,
 * trend weight feeds two, and until this was drawn nobody could see that a change to
 * one of them moves numbers in three apps.
 */

export type ModelState =
  /** Trained on this athlete's data and answering differently because of it. */
  | 'learning'
  /** Has stored weights but is still answering its starting formula. */
  | 'trained-no-change'
  /** Enough data exists, but it has not been trained on it yet. */
  | 'ready'
  /** Not enough data yet to train on. */
  | 'waiting'
  /** No training path at all: answers its reference and nothing moves it. */
  | 'static'
  /** Not a model. */
  | 'rule';

export const STATE_LABEL: Record<ModelState, string> = {
  learning: 'Learning from you',
  'trained-no-change': 'Trained, answers unchanged',
  ready: 'Enough data, not trained yet',
  waiting: 'Waiting for data',
  static: 'Fixed formula',
  rule: 'Rule'
};

export const STATE_COLOUR: Record<ModelState, string> = {
  learning: '#4ade80',
  'trained-no-change': '#facc15',
  ready: '#38bdf8',
  waiting: '#94a3b8',
  static: '#a78bfa',
  rule: '#c4b5fd'
};

export function modelState(status: BrainStatus): ModelState {
  const { entry, hasStoredWeights, learnedShift, data } = status;
  if (entry.kind === 'rule') return 'rule';
  // A model with no training path is not "waiting" for anything - it is finished, and
  // saying "waiting for data" about it would be a promise nothing is going to keep.
  if (entry.training && entry.training.minimumUseful === 0) return 'static';
  if ((learnedShift ?? 0) > 0.01) return 'learning';
  if (hasStoredWeights) return 'trained-no-change';
  if (data && entry.training && data.usable >= entry.training.minimumUseful) return 'ready';
  return 'waiting';
}

const NODE_H = 26;
const GAP = 10;
const COL_W = 168;
const PAD = 14;

export const ModelFlowDiagram: React.FC<{ statuses: BrainStatus[] }> = ({ statuses }) => {
  const layout = useMemo(() => {
    const sources: string[] = [];
    const surfaces: string[] = [];
    for (const s of statuses) {
      for (const f of s.entry.feeds) if (!sources.includes(f)) sources.push(f);
      for (const t of s.entry.surfaces) if (!surfaces.includes(t)) surfaces.push(t);
    }

    const rows = Math.max(sources.length, statuses.length, surfaces.length);
    const height = PAD * 2 + rows * (NODE_H + GAP) - GAP;

    // Each column is centred vertically against the tallest one, so the diagram reads
    // as three parallel lists rather than three ragged ones.
    const place = (items: string[] | BrainStatus[], x: number) => {
      const n = items.length;
      const blockHeight = n * (NODE_H + GAP) - GAP;
      const top = (height - blockHeight) / 2;
      return items.map((_, i) => ({ x, y: top + i * (NODE_H + GAP) + NODE_H / 2 }));
    };

    return {
      height,
      width: PAD * 2 + COL_W * 3 + 140 * 2,
      sources,
      surfaces,
      sourcePos: place(sources, PAD + COL_W),
      modelPos: place(statuses, PAD + COL_W + 140 + COL_W / 2),
      surfacePos: place(surfaces, PAD + COL_W + 140 + COL_W + 140)
    };
  }, [statuses]);

  const curve = (x1: number, y1: number, x2: number, y2: number) => {
    const mid = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
  };

  return (
    <div className="zh-ml-diagram-wrap">
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="zh-ml-diagram"
        role="img"
        aria-label="How each model connects its data sources to the screens it appears on"
      >
        {statuses.map((status, mi) => {
          const state = modelState(status);
          const colour = STATE_COLOUR[state];
          const m = layout.modelPos[mi];
          return (
            <g key={`lines-${status.entry.id}`}>
              {status.entry.feeds.map(f => {
                const si = layout.sources.indexOf(f);
                const p = layout.sourcePos[si];
                return (
                  <path
                    key={`${status.entry.id}-in-${f}`}
                    d={curve(p.x, p.y, m.x - COL_W / 2, m.y)}
                    fill="none"
                    stroke={colour}
                    strokeOpacity={0.28}
                    strokeWidth={1.2}
                  />
                );
              })}
              {status.entry.surfaces.map(t => {
                const ti = layout.surfaces.indexOf(t);
                const p = layout.surfacePos[ti];
                return (
                  <path
                    key={`${status.entry.id}-out-${t}`}
                    d={curve(m.x + COL_W / 2, m.y, p.x, p.y)}
                    fill="none"
                    stroke={colour}
                    strokeOpacity={0.28}
                    strokeWidth={1.2}
                  />
                );
              })}
            </g>
          );
        })}

        {layout.sources.map((label, i) => {
          const p = layout.sourcePos[i];
          return (
            <g key={`src-${label}`}>
              <rect
                x={p.x - COL_W} y={p.y - NODE_H / 2} width={COL_W} height={NODE_H}
                rx={6} fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.09)"
              />
              <text x={p.x - COL_W + 9} y={p.y + 4} className="zh-ml-node-text">
                {label.length > 24 ? label.slice(0, 23) + '…' : label}
              </text>
            </g>
          );
        })}

        {statuses.map((status, i) => {
          const p = layout.modelPos[i];
          const state = modelState(status);
          const colour = STATE_COLOUR[state];
          return (
            <g key={`model-${status.entry.id}`}>
              <rect
                x={p.x - COL_W / 2} y={p.y - NODE_H / 2} width={COL_W} height={NODE_H}
                rx={6}
                fill={`${colour}1f`}
                stroke={colour}
                strokeOpacity={0.55}
                strokeDasharray={state === 'rule' ? '4 3' : undefined}
              />
              <circle cx={p.x - COL_W / 2 + 11} cy={p.y} r={3.5} fill={colour} />
              <text x={p.x - COL_W / 2 + 21} y={p.y + 4} className="zh-ml-node-text strong">
                {status.entry.name.length > 20 ? status.entry.name.slice(0, 19) + '…' : status.entry.name}
              </text>
            </g>
          );
        })}

        {layout.surfaces.map((label, i) => {
          const p = layout.surfacePos[i];
          return (
            <g key={`surf-${label}`}>
              <rect
                x={p.x} y={p.y - NODE_H / 2} width={COL_W} height={NODE_H}
                rx={6} fill="rgba(56,189,248,0.07)" stroke="rgba(56,189,248,0.22)"
              />
              <text x={p.x + 9} y={p.y + 4} className="zh-ml-node-text">
                {label.length > 24 ? label.slice(0, 23) + '…' : label}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="zh-ml-legend">
        {(Object.keys(STATE_LABEL) as ModelState[]).map(state => (
          <span key={state}>
            <i style={{ background: STATE_COLOUR[state] }} />
            {STATE_LABEL[state]}
          </span>
        ))}
      </div>
    </div>
  );
};
