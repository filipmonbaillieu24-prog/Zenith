import React, { useMemo } from 'react';
import { Zap } from 'lucide-react';
import { RideSummaryWithBests } from '../../types/workout';

interface Props {
  rides: RideSummaryWithBests[];
  weight?: number; // kg
}

// Coggan Power Profile Table (W/kg)
// Source: Training and Racing with a Power Meter, Allen & Coggan
const COGGAN_TABLE = [
  { category: 'World Class Pro', color: '#6c5ce7', m1: 11.5, m5: 8.1,  m20: 6.4,  m60: 6.2  },
  { category: 'Pro / Cat 1',     color: '#a29bfe', m1: 9.5,  m5: 7.0,  m20: 5.6,  m60: 5.4  },
  { category: 'Cat 2',           color: '#00b894', m1: 8.0,  m5: 6.1,  m20: 4.8,  m60: 4.6  },
  { category: 'Cat 3',           color: '#cbd5e1', m1: 7.0,  m5: 5.2,  m20: 4.0,  m60: 3.9  },
  { category: 'Cat 4',           color: '#fdcb6e', m1: 6.0,  m5: 4.4,  m20: 3.2,  m60: 3.1  },
  { category: 'Cat 5 / Recreational',color: '#ff7675', m1: 5.0,  m5: 3.6,  m20: 2.5,  m60: 2.4  },
  { category: 'Untrained',      color: '#475569', m1: 3.5,  m5: 2.5,  m20: 1.75, m60: 1.65 },
];

type DurKey = 'm1' | 'm5' | 'm20' | 'm60';

const DURATIONS: { key: DurKey; label: string; beKey: string }[] = [
  { key: 'm1',  label: '1 min',  beKey: 'm1'  },
  { key: 'm5',  label: '5 min',  beKey: 'm5'  },
  { key: 'm20', label: '20 min', beKey: 'm20' },
  { key: 'm60', label: '60 min', beKey: 'm60' },
];

function getUserCategoryIndex(durKey: DurKey, wpkg: number): number {
  for (let i = 0; i < COGGAN_TABLE.length; i++) {
    if (wpkg >= COGGAN_TABLE[i][durKey]) return i;
  }
  return COGGAN_TABLE.length - 1;
}

export const PowerProfileTable: React.FC<Props> = ({ rides, weight }) => {
  const bestWpkg = useMemo<Partial<Record<DurKey, number>>>(() => {
    if (!weight || weight <= 0) return {};
    const result: Partial<Record<DurKey, number>> = {};
    for (const dur of DURATIONS) {
      let best = 0;
      for (const ride of rides) {
        const be = (ride as any).bestEfforts;
        const w = be?.[dur.beKey];
        if (typeof w === 'number' && w / weight > best) {
          best = w / weight;
        }
      }
      if (best > 0) result[dur.key] = parseFloat(best.toFixed(2));
    }
    return result;
  }, [rides, weight]);

  const hasData = Object.keys(bestWpkg).length > 0;

  return (
    <div style={{
      background: 'rgba(255,255,255,0.01)',
      border: '1px solid rgba(255,255,255,0.05)',
      borderRadius: 12,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <Zap size={16} color="#38bdf8" strokeWidth={1.8} />
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
            Power Profile (W/kg)
          </div>
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
            {!weight
              ? 'Set your weight in Settings → Profile to see your category'
              : 'Your best W/kg vs Coggan categories (▲ = your best performance)'
            }
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.015)' }}>
              <th style={{
                padding: '7px 14px', textAlign: 'left', color: '#64748b',
                fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}>
                Category
              </th>
              {DURATIONS.map(d => (
                <th key={d.key} style={{
                  padding: '7px 14px', textAlign: 'center', color: '#64748b',
                  fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.04)',
                  minWidth: 80,
                }}>
                  {d.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COGGAN_TABLE.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}
              >
                {/* Category name */}
                <td style={{ padding: '7px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: row.color, flexShrink: 0,
                    }} />
                    <span style={{ color: '#cbd5e1', fontWeight: 600 }}>{row.category}</span>
                  </div>
                </td>

                {/* Per-duration values */}
                {DURATIONS.map(dur => {
                  const catVal  = row[dur.key];
                  const userVal = bestWpkg[dur.key];
                  const isUserHere = hasData && userVal !== undefined &&
                    getUserCategoryIndex(dur.key, userVal) === rowIdx;

                  return (
                    <td key={dur.key} style={{ padding: '7px 14px', textAlign: 'center' }}>
                      <span style={{ color: '#475569', fontFamily: 'monospace' }}>
                        {catVal.toFixed(2)}
                      </span>
                      {isUserHere && userVal !== undefined && (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 2,
                          marginLeft: 5,
                          background: row.color + '22',
                          border: `1px solid ${row.color}55`,
                          borderRadius: 4,
                          padding: '1px 5px',
                          color: row.color,
                          fontWeight: 800,
                          fontSize: 10,
                        }}>
                          ▲ {userVal.toFixed(2)}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary legend */}
      {hasData && (
        <div style={{
          padding: '10px 14px',
          borderTop: '1px solid rgba(255,255,255,0.04)',
          display: 'flex',
          gap: 14,
          flexWrap: 'wrap',
          background: 'rgba(0,0,0,0.15)',
        }}>
          {DURATIONS.map(dur => {
            const v = bestWpkg[dur.key];
            if (!v) return null;
            const catIdx = getUserCategoryIndex(dur.key, v);
            const cat    = COGGAN_TABLE[catIdx];
            return (
              <div key={dur.key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 10, color: '#64748b' }}>{dur.label}:</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: cat.color }}>
                  {v.toFixed(2)} W/kg
                </span>
                <span style={{ fontSize: 9, color: '#475569' }}>({cat.category})</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
