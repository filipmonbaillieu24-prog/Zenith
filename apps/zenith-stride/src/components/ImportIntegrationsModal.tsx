import React from 'react';
import { RunActivity } from '../types/stride';
import { X, PlugZap } from 'lucide-react';

interface ImportIntegrationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (activity: RunActivity) => void;
}

// Polar Flow / Strava OAuth integration isn't implemented yet - there's no
// backend to hold the API credentials or complete the OAuth flow. This used
// to show four hardcoded "sample" sessions that looked like real synced
// data and could be imported as if they were; that was misleading, so this
// is an honest "not connected yet" state instead. GPX/TCX import already
// covers real Polar/Strava exports in the meantime.
export const ImportIntegrationsModal: React.FC<ImportIntegrationsModalProps> = ({
  isOpen,
  onClose
}) => {
  if (!isOpen) return null;

  return (
    <div className="stride-modal-backdrop" onClick={onClose}>
      <div className="stride-modal-container" onClick={e => e.stopPropagation()}>
        <div className="stride-modal-header">
          <div>
            <h3>Import Sessions from Polar & Strava</h3>
            <p className="subtitle">Direct account sync isn't available yet</p>
          </div>
          <button className="stride-close-btn" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="stride-modal-body">
          <div className="external-sessions-empty" style={{ padding: '32px 16px', textAlign: 'center', opacity: 0.75 }}>
            <PlugZap size={28} style={{ marginBottom: 12, opacity: 0.6 }} />
            <p style={{ margin: 0 }}>
              Polar Flow and Strava account sync is coming soon. In the meantime, export a
              session as a GPX or TCX file and use "Import GPX/TCX" to add it here.
            </p>
          </div>
        </div>

        <div className="stride-modal-footer">
          <button className="btn-cancel" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};
