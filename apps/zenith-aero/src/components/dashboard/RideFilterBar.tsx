import React from 'react';
import { Search } from 'lucide-react';
import { RideLabel, RIDE_LABELS } from '../../types/workout';

export type SortKey = 'date' | 'distance' | 'duration' | 'tss' | 'eftp' | 'elevGain';
export type LabelFilter = RideLabel | 'all';

interface RideFilterBarProps {
  search: string;
  setSearch: (val: string) => void;
  sortKey: SortKey;
  setSortKey: (val: SortKey) => void;
  labelFilter: LabelFilter;
  setLabelFilter: React.Dispatch<React.SetStateAction<LabelFilter>>;
  labelIconMap: Record<string, string>;
}

export const RideFilterBar: React.FC<RideFilterBarProps> = ({
  search,
  setSearch,
  sortKey,
  setSortKey,
  labelFilter,
  setLabelFilter,
  labelIconMap,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search bar */}
        <div style={{ position: 'relative', flex: '1 1 200px' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Search by ride name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 10px 6px 30px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.04)',
              background: 'rgba(255,255,255,0.01)',
              color: '#f8fafc',
              fontSize: 11,
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Sort options */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>Sort:</span>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.04)',
              background: '#0d0d1a',
              color: '#f8fafc',
              fontSize: 11,
              outline: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <option value="date">Date (Newest)</option>
            <option value="distance">Distance (High-Low)</option>
            <option value="duration">Time (Long-Short)</option>
            <option value="tss">TSS (High-Low)</option>
            <option value="eftp">eFTP (High-Low)</option>
            <option value="elevGain">Elevation Gain</option>
          </select>
        </div>
      </div>

      {/* Label / Type Filters */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          className={`wd-label-chip ${labelFilter === 'all' ? 'wd-label-chip--active' : ''}`}
          style={
            labelFilter === 'all'
              ? { background: 'rgba(255, 255, 255, 0.12)', borderColor: '#38bdf8', color: '#38bdf8', fontSize: 10, padding: '4px 10px', borderRadius: 6, border: '1px solid', cursor: 'pointer', fontFamily: 'inherit' }
              : { background: 'transparent', borderColor: 'rgba(255,255,255,0.03)', color: '#94a3b8', fontSize: 10, padding: '4px 10px', borderRadius: 6, border: '1px solid', cursor: 'pointer', fontFamily: 'inherit' }
          }
          onClick={() => setLabelFilter('all')}
        >
          All Rides
        </button>
        {RIDE_LABELS.map((l) => {
          const isActive = labelFilter === l.key;
          return (
            <button
              key={l.key}
              className={`wd-label-chip ${isActive ? 'wd-label-chip--active' : ''}`}
              style={
                isActive
                  ? { background: l.color + '22', borderColor: l.color, color: l.color, fontSize: 10, padding: '4px 10px', borderRadius: 6, border: '1px solid', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }
                  : { color: l.color, background: 'transparent', borderColor: 'rgba(255,255,255,0.03)', fontSize: 10, padding: '4px 10px', borderRadius: 6, border: '1px solid', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }
              }
              onClick={() => setLabelFilter((prev) => (prev === l.key ? 'all' : l.key))}
              title={l.label}
            >
              {labelIconMap[l.key]} {l.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
