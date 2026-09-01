import React, { useMemo, useState } from 'react';
import { BrainStatus, DATA_SOURCES, DOMAIN_LABEL, SourceDomain } from '@zenith/shared';

/**
 * Which model reads what, feeds where, and what state it is in.
 *
 * The first version drew whatever text each model gave for its inputs, which produced
 * nineteen source boxes for what are really twelve places data comes from - "Sleep",
 * "Sleep quality" and "Sleep duration" each got their own, all of them vigor_sleep -
 * and the labels were too long for the boxes, so half of them ended in an ellipsis.
 *
 * Now the sources are canonical and grouped by what they are, the diagram uses the full
 * width available, and hovering anything dims everything it does not touch. That last
 * part is what makes it useful rather than decorative: with nine models and a dozen
 * sources there are sixty-odd connections, and no static drawing of that is readable.
 */

export type ModelState =
  | 'learning'
  | 'trained-no-change'
  | 'ready'
  | 'waiting'
  | 'rule';

export const STATE_LABEL: Record<ModelState, string> = {
  learning: 'Learning from you',
  'trained-no-change': 'Trained, answers unchanged',
  ready: 'Enough data, not trained yet',
  waiting: 'Waiting for data',
  rule: 'Rule, not a model'
};

export const STATE_COLOUR: Record<ModelState, string> = {
  learning: '#4ade80',
  'trained-no-change': '#facc15',
  ready: '#38bdf8',
  waiting: '#94a3b8',
  rule: '#c4b5fd'
};

export function modelState(status: BrainStatus): ModelState {
  const { entry, hasStoredWeights, learnedShift, data } = status;
  if (entry.kind === 'rule') return 'rule';
  if ((learnedShift ?? 0) > 0.01) return 'learning';
  if (hasStoredWeights) return 'trained-no-change';
  if (data && entry.training && data.usable >= entry.training.minimumUseful) return 'ready';
  return 'waiting';
}

const DOMAIN_COLOUR: Record<SourceDomain, string> = {
  training: '#f59e0b',
  body: '#38bdf8',
  nutrition: '#34d399',
  subjective: '#c084fc'
};

const ROW_H = 30;
const GAP = 8;
const GROUP_GAP = 22;
/** Wide enough for the longest label any model or surface carries - see the geometry test. */
export const NODE_W = 210;
const GUTTER = 150;
const PAD = 16;

export const ModelFlowDiagram: React.FC<{ statuses: BrainStatus[] }> = ({ statuses }) => {
  const [focus, setFocus] = useState<string | null>(null);

  const layout = useMemo(() => {
    // Sources in the order their groups appear, so the left column reads as a list of
    // places rather than a scatter.
    const used = new Set<string>();
    for (const s of statuses) for (const r of s.entry.reads) used.add(r.source);

    const domains: SourceDomain[] = ['training', 'body', 'nutrition', 'subjective'];
    const groups = domains
      .map(domain => ({
        domain,
        sources: Object.values(DATA_SOURCES).filter(src => src.domain === domain && used.has(src.id))
      }))
      .filter(g => g.sources.length > 0);

    const sourceY: Record<string, number> = {};
    let y = PAD;
    const groupBands: { domain: SourceDomain; top: number; bottom: number }[] = [];
    for (const group of groups) {
      const top = y;
      y += 16; // room for the group heading
      for (const src of group.sources) {
        sourceY[src.id] = y + ROW_H / 2;
        y += ROW_H + GAP;
      }
      groupBands.push({ domain: group.domain, top, bottom: y - GAP });
      y += GROUP_GAP;
    }
    const leftHeight = y;

    const surfaces: string[] = [];
    for (const s of statuses) for (const t of s.entry.surfaces) if (!surfaces.includes(t)) surfaces.push(t);

    const stack = (count: number, height: number) => {
      const block = count * (ROW_H + GAP) - GAP;
      const top = Math.max(PAD, (height - block) / 2);
      return (i: number) => top + i * (ROW_H + GAP) + ROW_H / 2;
    };

    const height = Math.max(
      leftHeight,
      PAD * 2 + statuses.length * (ROW_H + GAP),
      PAD * 2 + surfaces.length * (ROW_H + GAP)
    );

    return {
      groups,
      groupBands,
      sourceY,
      surfaces,
      height,
      width: PAD * 2 + NODE_W * 3 + GUTTER * 2,
      modelY: stack(statuses.length, height),
      surfaceY: stack(surfaces.length, height),
      colX: {
        source: PAD,
        model: PAD + NODE_W + GUTTER,
        surface: PAD + (NODE_W + GUTTER) * 2
      }
    };
  }, [statuses]);

  const curve = (x1: number, y1: number, x2: number, y2: number) => {
    const mid = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
  };

  /** Everything the focused node touches, so the rest can fade back. */
  const active = useMemo(() => {
    if (!focus) return null;
    const models = new Set<string>();
    const sources = new Set<string>();
    const surfaces = new Set<string>();

    for (const s of statuses) {
      const isModel = focus === `model:${s.entry.id}`;
      const readsIt = s.entry.reads.some(r => focus === `source:${r.source}`);
      const showsIt = s.entry.surfaces.some(t => focus === `surface:${t}`);
      if (!isModel && !readsIt && !showsIt) continue;
      models.add(s.entry.id);
      for (const r of s.entry.reads) sources.add(r.source);
      for (const t of s.entry.surfaces) surfaces.add(t);
    }
    return { models, sources, surfaces };
  }, [focus, statuses]);

  const dim = (kind: 'model' | 'source' | 'surface', id: string): number => {
    if (!active) return 1;
    const set = kind === 'model' ? active.models : kind === 'source' ? active.sources : active.surfaces;
    return set.has(id) ? 1 : 0.15;
  };

  return (
    <div className="zh-ml-diagram-wrap" onMouseLeave={() => setFocus(null)}>
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="zh-ml-diagram"
        role="img"
        aria-label="How each model connects its data sources to the screens it appears on"
      >
        <g className="zh-ml-col-heads">
          <text x={layout.colX.source} y={10} className="zh-ml-col-head">READS</text>
          <text x={layout.colX.model} y={10} className="zh-ml-col-head">MODEL</text>
          <text x={layout.colX.surface} y={10} className="zh-ml-col-head">SHOWS UP IN</text>
        </g>

        {/* Connections first, so nodes sit on top of them. */}
        {statuses.map((status, mi) => {
          const state = modelState(status);
          const colour = STATE_COLOUR[state];
          const my = layout.modelY(mi);
          const modelDim = dim('model', status.entry.id);

          return (
            <g key={`lines-${status.entry.id}`} opacity={modelDim}>
              {status.entry.reads.map(r => (
                <path
                  key={`${status.entry.id}-in-${r.source}`}
                  d={curve(layout.colX.source + NODE_W, layout.sourceY[r.source], layout.colX.model, my)}
                  fill="none"
                  stroke={DOMAIN_COLOUR[DATA_SOURCES[r.source].domain]}
                  strokeOpacity={focus ? 0.7 : 0.25}
                  strokeWidth={focus ? 1.8 : 1.1}
                />
              ))}
              {status.entry.surfaces.map(t => (
                <path
                  key={`${status.entry.id}-out-${t}`}
                  d={curve(layout.colX.model + NODE_W, my, layout.colX.surface, layout.surfaceY(layout.surfaces.indexOf(t)))}
                  fill="none"
                  stroke={colour}
                  strokeOpacity={focus ? 0.75 : 0.28}
                  strokeWidth={focus ? 1.8 : 1.1}
                />
              ))}
            </g>
          );
        })}

        {/* Source groups */}
        {layout.groups.map((group, gi) => (
          <g key={group.domain}>
            <text
              x={layout.colX.source + 2}
              y={layout.groupBands[gi].top + 11}
              className="zh-ml-group-head"
              fill={DOMAIN_COLOUR[group.domain]}
            >
              {DOMAIN_LABEL[group.domain].toUpperCase()}
            </text>
            {group.sources.map(src => {
              const y = layout.sourceY[src.id];
              return (
                <g
                  key={src.id}
                  opacity={dim('source', src.id)}
                  onMouseEnter={() => setFocus(`source:${src.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x={layout.colX.source} y={y - ROW_H / 2} width={NODE_W} height={ROW_H}
                    rx={7}
                    fill={`${DOMAIN_COLOUR[group.domain]}14`}
                    stroke={DOMAIN_COLOUR[group.domain]}
                    strokeOpacity={0.35}
                  />
                  <text x={layout.colX.source + 11} y={y - 1} className="zh-ml-node-text strong">{src.label}</text>
                  <text x={layout.colX.source + 11} y={y + 10} className="zh-ml-node-sub">{src.table}</text>
                </g>
              );
            })}
          </g>
        ))}

        {/* Models */}
        {statuses.map((status, i) => {
          const y = layout.modelY(i);
          const state = modelState(status);
          const colour = STATE_COLOUR[state];
          const training = status.entry.training;
          const data = status.data;
          const progress = training && data && data.usable >= 0 && training.minimumUseful > 0
            ? Math.min(1, data.usable / training.minimumUseful)
            : null;

          return (
            <g
              key={status.entry.id}
              opacity={dim('model', status.entry.id)}
              onMouseEnter={() => setFocus(`model:${status.entry.id}`)}
              style={{ cursor: 'pointer' }}
            >
              <rect
                x={layout.colX.model} y={y - ROW_H / 2} width={NODE_W} height={ROW_H}
                rx={7}
                fill={`${colour}1f`}
                stroke={colour}
                strokeOpacity={0.6}
                strokeDasharray={state === 'rule' ? '4 3' : undefined}
              />
              <circle cx={layout.colX.model + 12} cy={y} r={3.5} fill={colour} />
              <text x={layout.colX.model + 22} y={y - 1} className="zh-ml-node-text strong">
                {status.entry.name}
              </text>
              <text x={layout.colX.model + 22} y={y + 10} className="zh-ml-node-sub">
                {state === 'rule'
                  ? 'arithmetic you can read'
                  : progress === null
                    ? STATE_LABEL[state]
                    : `${data!.usable} of ${training!.minimumUseful} examples`}
              </text>
              {progress !== null && (
                <rect
                  x={layout.colX.model} y={y + ROW_H / 2 - 2} width={NODE_W * progress} height={2}
                  fill={colour} opacity={0.8}
                />
              )}
            </g>
          );
        })}

        {/* Surfaces */}
        {layout.surfaces.map((label, i) => {
          const y = layout.surfaceY(i);
          return (
            <g
              key={label}
              opacity={dim('surface', label)}
              onMouseEnter={() => setFocus(`surface:${label}`)}
              style={{ cursor: 'pointer' }}
            >
              <rect
                x={layout.colX.surface} y={y - ROW_H / 2} width={NODE_W} height={ROW_H}
                rx={7} fill="rgba(226,232,240,0.05)" stroke="rgba(226,232,240,0.18)"
              />
              <text x={layout.colX.surface + 11} y={y + 3} className="zh-ml-node-text">{label}</text>
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
        <span className="zh-ml-legend-hint">Hover anything to trace what it touches</span>
      </div>
    </div>
  );
};
