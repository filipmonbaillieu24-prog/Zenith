import React, { useMemo, useState } from 'react';
import { Mountain } from 'lucide-react';
import { RideSummaryWithBests } from '../../types/workout';

interface ClimbRecord {
  name:          string;
  elevGain:      number;
  distance:      number; // km
  avgGrade:      number; // %
  category:      string;
  bestVAM:       number;
  bestRideDate:  number;
}

interface Props {
  rides: RideSummaryWithBests[];
}

const CATEGORY_COLORS: Record<string, string> = {
  'HC':    '#6c5ce7',
  'Cat 1': '#a29bfe',
  'Cat 2': '#00b894',
  'Cat 3': '#cbd5e1',
  'Cat 4': '#fdcb6e',
};

function getClimbCategory(elevGain: number, avgGrade: number): string {
  const score = elevGain * avgGrade;
  if (score >= 8000)  return 'HC';
  if (score >= 4000)  return 'Cat 1';
  if (score >= 2000)  return 'Cat 2';
  if (score >= 1000)  return 'Cat 3';
  return 'Cat 4';
}

type SortKey = 'vam' | 'elev' | 'grade';

export const ClimbsLeaderboard: React.FC<Props> = ({ rides }) => {
  const [sortBy, setSortBy] = useState<SortKey>('vam');

  // Build leaderboard from rides that have VAM and meaningful elevation
  const climbRecords = useMemo<ClimbRecord[]>(() => {
    return rides
      .filter(r => (r.vam ?? 0) > 50 && r.elevGain > 30 && r.distance > 0)
      .map(r => {
        const avgGrade = (r.elevGain / (r.distance * 1000)) * 100;
        return {
          name:         r.name,
          elevGain:     r.elevGain,
          distance:     r.distance,
          avgGrade:     parseFloat(avgGrade.toFixed(1)),
          category:     getClimbCategory(r.elevGain, avgGrade),
          bestVAM:      r.vam ?? 0,
          bestRideDate: r.date,
        } satisfies ClimbRecord;
      });
  }, [rides]);

  const sorted = useMemo(() => {
    const copy = [...climbRecords];
    if (sortBy === 'elev')  return copy.sort((a, b) => b.elevGain - a.elevGain);
    if (sortBy === 'grade') return copy.sort((a, b) => b.avgGrade - a.avgGrade);
    return copy.sort((a, b) => b.bestVAM - a.bestVAM); // default: VAM
  }, [climbRecords, sortBy]);

  const maxVAM = Math.max(1, ...sorted.map(c => c.bestVAM));

  if (sorted.length === 0) {
    return (
      <div style={{
        background: 'rgba(255,255,255,0.01)',
        border: '1px solid rgba(255,255,255,0.04)',
        borderRadius: 12,
        padding: '28px 20px',
        textAlign: 'center',
      }}>
        <Mountain size={30} color="#334155" style={{ marginBottom: 10 }} />
        <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>No klimdata</div>
        <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>
          Upload rideten met hoogtemeters om je klimprestaties te zien.
        </div>
      </div>
    );
  }

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
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Mountain size={15} color="#fdcb6e" />
          <div>
            <div style={{
              fontSize: 11, fontWeight: 800, color: '#f8fafc',
              textTransform: 'uppercase', letterSpacing: '0.6px',
            }}>
              Klimmen Leaderboard
            </div>
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>
              Top rideten op klimmen — gesorteerd op VAM (m/u stijging)
            </div>
          </div>
        </div>

        {/* Sort buttons */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['vam', 'elev', 'grade'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              style={{
                background: sortBy === s ? 'rgba(253,203,110,0.12)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${sortBy === s ? 'rgba(253,203,110,0.3)' : 'rgba(255,255,255,0.05)'}`,
                borderRadius: 6,
                color: sortBy === s ? '#fdcb6e' : '#64748b',
                fontSize: 9,
                fontWeight: 700,
                padding: '4px 8px',
                cursor: 'pointer',
                fontFamily: 'inheride',
                textTransform: 'uppercase',
              }}
            >
              {s === 'vam' ? 'VAM' : s === 'elev' ? 'Hoogte' : 'Steilheid'}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div style={{ padding: '4px 0' }}>
        {sorted.slice(0, 15).map((climb, idx) => {
          const vamPct   = (climb.bestVAM / maxVAM) * 100;
          const catColor = CATEGORY_COLORS[climb.category] ?? '#64748b';
          const rankColor = idx === 0 ? '#fdcb6e' : idx === 1 ? '#94a3b8' : idx === 2 ? '#e17055' : '#475569';

          return (
            <div
              key={idx}
              style={{
                padding: '8px 16px',
                borderBottom: '1px solid rgba(255,255,255,0.02)',
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
              }}
            >
              {/* Top row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Rank */}
                <span style={{
                  fontSize: 11, fontWeight: 800, color: rankColor,
                  width: 18, flexShrink: 0, textAlign: 'center',
                }}>
                  {idx + 1}
                </span>

                {/* Category badge */}
                <span style={{
                  fontSize: 9, fontWeight: 800, color: catColor,
                  background: catColor + '18',
                  border: `1px solid ${catColor}44`,
                  borderRadius: 4,
                  padding: '1px 5px',
                  flexShrink: 0,
                }}>
                  {climb.category}
                </span>

                {/* Name */}
                <span style={{
                  fontSize: 12, fontWeight: 600, color: '#cbd5e1',
                  flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {climb.name}
                </span>

                {/* Stats */}
                <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: catColor }}>
                      {Math.round(climb.bestVAM)}
                    </div>
                    <div style={{ fontSize: 9, color: '#64748b' }}>m/h VAM</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>
                      +{climb.elevGain}m
                    </div>
                    <div style={{ fontSize: 9, color: '#64748b' }}>
                      {climb.avgGrade.toFixed(1)}% gem.
                    </div>
                  </div>
                </div>
              </div>

              {/* VAM progress bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 26 }}>
                <div style={{
                  flex: 1, height: 3,
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 2, overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${vamPct}%`,
                    height: '100%',
                    background: catColor,
                    borderRadius: 2,
                    transition: 'width 0.4s ease',
                  }} />
                </div>
                <span style={{ fontSize: 9, color: '#475569', flexShrink: 0 }}>
                  {new Date(climb.bestRideDate).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short' })}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {sorted.length > 15 && (
        <div style={{
          padding: '7px 16px',
          borderTop: '1px solid rgba(255,255,255,0.04)',
          fontSize: 10, color: '#64748b', textAlign: 'center',
        }}>
          + {sorted.length - 15} meer rideten
        </div>
      )}
    </div>
  );
};
