import React, { useState } from 'react';
import '../workout.css';
import { FitnessProfile } from '../types/workout';
import { GearPage } from './GearPage';
import { ProfilePanel } from '../components/workout/ProfilePanel';
import { Bike, UserCog } from 'lucide-react';

interface SettingsPageProps {
  profile: FitnessProfile;
  onProfileChange: (p: FitnessProfile) => void;
  globaleFTP?: number;
  onRecalculate: () => void;
  recalculating: boolean;
}

type SubTab = 'gear' | 'zones';

export const SettingsPage: React.FC<SettingsPageProps> = ({
  profile,
  onProfileChange,
  globaleFTP,
  onRecalculate,
  recalculating,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('gear');

  const navItems = [
    { key: 'gear',        icon: <Bike size={13} />, label: 'Mijn Gear' },
    { key: 'zones',       icon: <UserCog size={13} />, label: 'Profiel & Zones' },
  ] as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', padding: '24px 32px', boxSizing: 'border-box' }}>
      {/* Sub-Tab Navigation */}
      <div style={{
        display: 'flex', gap: 8, background: 'rgba(255,255,255,0.02)', padding: 4, borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.04)', width: 'fit-content', margin: 0
      }}>
        {navItems.map(item => (
          <button
            key={item.key}
            onClick={() => setActiveSubTab(item.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700,
              background: activeSubTab === item.key ? 'rgba(203, 213, 225, 0.1)' : 'transparent',
              color: activeSubTab === item.key ? '#cbd5e1' : '#94a3b8',
              transition: 'all 0.15s', fontFamily: 'inheride'
            }}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {activeSubTab === 'gear' && (
          <div className="wd-main-single">
            <div className="wd-coach-header" style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc', margin: '0 0 4px' }}>Gear & Materiaal</h2>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Manage your bikes, components and track component wear accurately.</p>
            </div>
            <GearPage profile={profile} />
          </div>
        )}

        {activeSubTab === 'zones' && (
          <div className="wd-main-single">
            <div className="wd-coach-header" style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc', margin: '0 0 4px' }}>Profiel & Zones</h2>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Beheer je fysiologische grenzen, trainingszones en persoonsgegevens.</p>
            </div>
            <ProfilePanel
              profile={profile}
              onChange={onProfileChange}
              globaleFTP={globaleFTP}
              onRecalculate={onRecalculate}
              recalculating={recalculating}
              subSection="zones"
            />
          </div>
        )}
      </div>
    </div>
  );
};
