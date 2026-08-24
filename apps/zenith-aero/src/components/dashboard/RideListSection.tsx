import React from 'react';
import {
  Search, CalendarDays, MoveRight, Mountain, BarChart2, Zap,
  Clock, Repeat2, Flag, Heart, Users, ArrowLeftRight, AlertTriangle, Activity,
  Bike, Trophy, Scale, Trash2
} from 'lucide-react';
import { ZenithEmptyState } from '@zenith/shared';
import { RideSummaryWithBests, RIDE_LABELS, Gear, EFFORT_DURATIONS, SPEED_EFFORT_DURATIONS } from '../../types/workout';
import { getRidePRLabels } from '../../utils/dashboardHelpers';
import { analyzeNotesLocally } from '../../utils/localNeuralNet';

interface RideListSectionProps {
  search: string;
  setSearch: (s: string) => void;
  sortKey: 'date' | 'distance' | 'duration' | 'tss' | 'eftp' | 'elevGain';
  setSortKey: (k: 'date' | 'distance' | 'duration' | 'tss' | 'eftp' | 'elevGain') => void;
  labelFilter: string;
  setLabelFilter: React.Dispatch<React.SetStateAction<any>>;
  sortedRides: RideSummaryWithBests[];
  gears: Gear[];
  globalPowerBests: Record<string, number> | null;
  globalSpeedBests: Record<string, number> | null;
  selectedRideId: string | null | undefined;
  compareRideId: string | null | undefined;
  onSelectRide: (id: string) => void;
  onCompareRide?: (id: string) => void;
  handleDelete: (id: string) => void;
  deleting: string | null;
}

export const RideListSection: React.FC<RideListSectionProps> = ({
  search,
  setSearch,
  sortKey,
  setSortKey,
  labelFilter,
  setLabelFilter,
  sortedRides,
  gears,
  globalPowerBests,
  globalSpeedBests,
  selectedRideId,
  compareRideId,
  onSelectRide,
  onCompareRide,
  handleDelete,
  deleting,
}) => {
  return (
    <div className="wd-main-single animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, color: 'var(--text-main,#f8fafc)', margin: '0 0 4px' }}>
            <Bike size={16} strokeWidth={1.8} /> My Rides
          </h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted,#94a3b8)', margin: 0 }}>View, filter, and compare all your recorded rides.</p>
        </div>

        {/* Search bar & Sorting */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <div className="wd-search-wrap" style={{ width: 180, margin: 0 }}>
            <Search size={14} className="wd-search-icon" />
            <input className="wd-search" type="text" placeholder="Search ride…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          <div className="wd-sort-bar" style={{ display: 'flex', gap: 3, background: 'rgba(255,255,255,0.02)', padding: 3, borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)' }}>
            {([
              { k: 'date',      icon: <CalendarDays size={14} strokeWidth={1.6} />,   title: 'Date' },
              { k: 'distance',  icon: <MoveRight    size={14} strokeWidth={1.6} />,   title: 'Distance' },
              { k: 'elevGain',  icon: <Mountain     size={14} strokeWidth={1.6} />,   title: 'Elevation' },
              { k: 'tss',       icon: <BarChart2    size={14} strokeWidth={1.6} />,   title: 'TSS' },
              { k: 'eftp',      icon: <Zap          size={14} strokeWidth={1.6} />,   title: 'eFTP' },
            ] as const).map(({ k, icon, title }) => (
              <button key={k}
                className={`wd-sort-btn ${sortKey === k ? 'wd-sort-btn--active' : ''}`}
                style={{
                  background: sortKey === k ? 'rgba(203, 213, 225, 0.12)' : 'transparent',
                  border: 'none',
                  color: sortKey === k ? '#cbd5e1' : '#94a3b8',
                  padding: '4px 8px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s'
                }}
                onClick={() => setSortKey(k)}
                title={title}
              >
                {icon}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Label filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, padding: '2px 0' }}>
        <button
          className={`wd-label-chip ${labelFilter === 'all' ? 'wd-label-chip--active' : ''}`}
          onClick={() => setLabelFilter('all')}
          style={{ fontSize: 10, padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', fontFamily: 'inherit' }}
        >All</button>
        {RIDE_LABELS.map(l => {
          const labelIcon: Record<string, React.ReactNode> = {
            duurride:   <Clock         size={11} strokeWidth={1.6} />,
            interval:  <Repeat2       size={11} strokeWidth={1.6} />,
            wedstrijd: <Flag          size={11} strokeWidth={1.6} />,
            herstel:   <Heart         size={11} strokeWidth={1.6} />,
            groepsride: <Users         size={11} strokeWidth={1.6} />,
            pendel:    <ArrowLeftRight size={11} strokeWidth={1.6} />,
            berg:      <Mountain      size={11} strokeWidth={1.6} />,
          };
          const isActive = labelFilter === l.key;
          return (
            <button
              key={l.key}
              className={`wd-label-chip ${isActive ? 'wd-label-chip--active' : ''}`}
              style={isActive
                ? { background: l.color + '22', borderColor: l.color, color: l.color, fontSize: 10, padding: '4px 10px', borderRadius: 6, border: '1px solid', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }
                : { color: l.color, background: 'transparent', borderColor: 'rgba(255,255,255,0.03)', fontSize: 10, padding: '4px 10px', borderRadius: 6, border: '1px solid', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }
              }
              onClick={() => setLabelFilter((prev: string) => prev === l.key ? 'all' : l.key)}
              title={l.label}
            >
              {labelIcon[l.key]} {l.label}
            </button>
          );
        })}
      </div>

      {/* Rides Table */}
      <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, color: '#cbd5e1', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.01)' }}>
                <th style={{ padding: '10px 14px', color: '#94a3b8', fontWeight: 700 }}>Date</th>
                <th style={{ padding: '10px 14px', color: '#94a3b8', fontWeight: 700 }}>Activity</th>
                <th style={{ padding: '10px 14px', color: '#94a3b8', fontWeight: 700, textAlign: 'right' }}>Distance</th>
                <th style={{ padding: '10px 14px', color: '#94a3b8', fontWeight: 700, textAlign: 'right' }}>Time</th>
                <th style={{ padding: '10px 14px', color: '#94a3b8', fontWeight: 700, textAlign: 'right' }}>Avg Power</th>
                <th style={{ padding: '10px 14px', color: '#94a3b8', fontWeight: 700, textAlign: 'right' }}>TSS</th>
                <th style={{ padding: '10px 14px', color: '#94a3b8', fontWeight: 700, textAlign: 'right' }}>Gear</th>
                <th style={{ padding: '10px 14px', color: '#94a3b8', fontWeight: 700, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedRides.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 0 }}>
                    {search === '' && labelFilter === 'all' ? (
                      <ZenithEmptyState
                        icon={<Bike size={20} strokeWidth={1.8} />}
                        title="No rides yet"
                        message="Import a FIT, GPX or TCX file via the Import Ride button in the header to see your activity history here."
                      />
                    ) : (
                      <div style={{ padding: '32px 14px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                        No rides found matching the selected filters.
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                sortedRides.map(ride => {
                  const dateStr = new Date(ride.date).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
                  const durStr = new Date(ride.duration * 1000).toISOString().substr(11, 8).replace(/^00:/, '');
                  const gear = gears.find((g: any) => g.id === ride.gearId);
                  const gearName = gear ? `${gear.brand} ${gear.model}` : '--';
                  const prs = [
                    ...getRidePRLabels(ride, globalPowerBests ?? {}, 'bestEfforts', EFFORT_DURATIONS),
                    ...getRidePRLabels(ride, globalSpeedBests ?? {}, 'bestSpeedEfforts', SPEED_EFFORT_DURATIONS),
                  ];
                  const labelObj = RIDE_LABELS.find(l => l.key === ride.label);
                  const aiAnalysis = ride.aiAnalysis || (ride.notes ? analyzeNotesLocally(ride.notes) : null);

                  return (
                    <tr 
                      key={ride.id} 
                      style={{ 
                        borderBottom: '1px solid rgba(255,255,255,0.02)',
                        cursor: 'pointer',
                        background: selectedRideId === ride.id ? 'rgba(203, 213, 225, 0.04)' : 'transparent',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.015)'}
                      onMouseLeave={e => e.currentTarget.style.background = selectedRideId === ride.id ? 'rgba(203, 213, 225, 0.04)' : 'transparent'}
                      onClick={() => onSelectRide(ride.id)}
                    >
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>{dateStr}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ color: '#f8fafc', fontWeight: 700 }}>{ride.name}</span>
                          {labelObj && (
                            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: labelObj.color + '15', color: labelObj.color, border: `1px solid ${labelObj.color}25` }}>
                              {labelObj.label}
                            </span>
                          )}
                          {prs.length > 0 && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(253, 203, 110, 0.12)', color: '#fdcb6e', border: '1px solid rgba(253, 203, 110, 0.2)' }}>
                              <Trophy size={10} /> PR ({prs.length})
                            </span>
                          )}
                          {aiAnalysis && (
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              {aiAnalysis.illness >= 0.4 && (
                                <span title={`Illness/Pain detected: ${Math.round(aiAnalysis.illness * 100)}%`} style={{ display: 'flex', alignItems: 'center', color: '#d63031', background: 'rgba(214, 48, 49, 0.1)', padding: 3, borderRadius: 5 }}>
                                  <Activity size={10} />
                                </span>
                              )}
                              {aiAnalysis.fatigue >= 0.5 && (
                                <span title={`Fatigue detected: ${Math.round(aiAnalysis.fatigue * 100)}%`} style={{ display: 'flex', alignItems: 'center', color: '#fdcb6e', background: 'rgba(253, 203, 110, 0.1)', padding: 3, borderRadius: 5 }}>
                                  <AlertTriangle size={10} />
                                </span>
                              )}
                              {aiAnalysis.recovery >= 0.6 && (
                                <span title={`Recovery detected: ${Math.round(aiAnalysis.recovery * 100)}%`} style={{ display: 'flex', alignItems: 'center', color: '#00b894', background: 'rgba(0, 184, 148, 0.1)', padding: 3, borderRadius: 5 }}>
                                  <Zap size={10} />
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#f8fafc' }}>
                        {ride.distance.toFixed(1)} km
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>{durStr}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        {ride.hasPower ? <strong>{ride.avgPower} W</strong> : <span style={{ color: '#64748b' }}>--</span>}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: '#ff7675', fontWeight: 700 }}>
                        {ride.tss ?? ride.hrTSS ?? '--'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: '#94a3b8' }}>
                        {gearName}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                          <button
                            onClick={() => onCompareRide?.(ride.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              background: compareRideId === ride.id ? 'rgba(203, 213, 225, 0.12)' : 'rgba(255,255,255,0.02)',
                              border: '1px solid rgba(255,255,255,0.05)',
                              borderRadius: 6,
                              color: compareRideId === ride.id ? '#cbd5e1' : '#cbd5e1',
                              fontSize: 10,
                              fontWeight: 600,
                              padding: '4px 8px',
                              cursor: 'pointer',
                              fontFamily: 'inherit'
                            }}
                            title="Compare this ride"
                          >
                            <Scale size={12} strokeWidth={1.8} /> Compare
                          </button>
                          <button
                            onClick={() => handleDelete(ride.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              background: 'rgba(255,118,117,0.08)',
                              border: '1px solid rgba(255,118,117,0.15)',
                              borderRadius: 6,
                              color: '#ff7675',
                              fontSize: 10,
                              fontWeight: 600,
                              padding: '4px 8px',
                              cursor: 'pointer',
                              fontFamily: 'inherit'
                            }}
                            disabled={deleting === ride.id}
                            title="Delete this ride"
                          >
                            {deleting === ride.id ? 'In progress…' : <Trash2 size={12} strokeWidth={1.8} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
