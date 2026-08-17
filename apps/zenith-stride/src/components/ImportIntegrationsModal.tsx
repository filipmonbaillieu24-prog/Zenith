import React, { useState } from 'react';
import { RunActivity } from '../types/stride';
import { getMockExternalSessions, convertExternalToRunActivity, ExternalSession } from '../utils/integrationsService';
import { X, RefreshCw, CheckCircle2, Zap, ArrowRight, Layers } from 'lucide-react';

interface ImportIntegrationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (activity: RunActivity) => void;
}

export const ImportIntegrationsModal: React.FC<ImportIntegrationsModalProps> = ({
  isOpen,
  onClose,
  onImport
}) => {
  if (!isOpen) return null;

  const [externalSessions, setExternalSessions] = useState<ExternalSession[]>(getMockExternalSessions());
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 1200);
  };

  const handleConfirmImport = () => {
    const toImport = externalSessions.filter(s => selectedIds.includes(s.id));
    toImport.forEach(s => {
      onImport(convertExternalToRunActivity(s));
    });
    setExternalSessions(prev => prev.map(s => selectedIds.includes(s.id) ? { ...s, imported: true } : s));
    onClose();
  };

  return (
    <div className="stride-modal-backdrop" onClick={onClose}>
      <div className="stride-modal-container" onClick={e => e.stopPropagation()}>
        <div className="stride-modal-header">
          <div>
            <h3>Sessies Importeren uit Polar & Strava</h3>
            <p className="subtitle">Selecteer de gesynchroniseerde hardloopsessies om toe te voegen</p>
          </div>
          <button className="stride-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="stride-modal-body">
          <div className="integrations-import-toolbar">
            <span>Beschikbare trainingssessies</span>
            <button className="btn-refresh" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw size={13} className={isRefreshing ? 'spin' : ''} />
              <span>Sessies Verversen</span>
            </button>
          </div>

          <div className="external-sessions-list">
            {externalSessions.map(session => {
              const isSelected = selectedIds.includes(session.id);
              const accentColor = session.source === 'polar' ? '#E2001A' : '#FC4C02';
              return (
                <div 
                  key={session.id} 
                  className={`external-session-card ${isSelected ? 'selected' : ''} ${session.imported ? 'imported' : ''}`}
                  onClick={() => !session.imported && toggleSelect(session.id)}
                >
                  <div className="source-tag" style={{ background: accentColor }}>
                    {session.source === 'polar' ? 'Polar Flow' : 'Strava'}
                  </div>

                  <div className="session-main-info">
                    <h4>{session.title}</h4>
                    <div className="session-sub-info">
                      <span>{session.date}</span>
                      <span>•</span>
                      <span>{session.distanceKm} km</span>
                      <span>•</span>
                      <span>{session.avgPaceMinKm} /km</span>
                      {session.isTreadmill && (
                        <>
                          <span>•</span>
                          <span className="treadmill-tag">Loopband</span>
                        </>
                      )}
                    </div>
                  </div>

                  {session.imported ? (
                    <span className="imported-badge">Geïmporteerd</span>
                  ) : (
                    <input 
                      type="checkbox" 
                      checked={isSelected} 
                      onChange={() => toggleSelect(session.id)} 
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="stride-modal-footer">
          <button className="btn-cancel" onClick={onClose}>Annuleren</button>
          <button 
            className="btn-save" 
            onClick={handleConfirmImport}
            disabled={selectedIds.length === 0}
          >
            <Zap size={15} style={{ marginRight: 6 }} />
            {selectedIds.length} Sessie(s) Importeren
          </button>
        </div>
      </div>
    </div>
  );
};
