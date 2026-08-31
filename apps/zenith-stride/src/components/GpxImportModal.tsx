import React, { useState } from 'react';
import { RunActivity } from '../types/stride';
import { parseGpxFile } from '../utils/gpxParser';
import { UploadCloud, Check, X, FileText, MapPin, Activity, Flame, Clock } from 'lucide-react';
import { toDateKeyFromDate } from '@zenith/shared';

interface GpxImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (activity: RunActivity) => void;
}

export const GpxImportModal: React.FC<GpxImportModalProps> = ({
  isOpen,
  onClose,
  onImport
}) => {
  if (!isOpen) return null;

  const [parsedRun, setParsedRun] = useState<Partial<RunActivity> | null>(null);
  const [filename, setFilename] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFileUpload = (file: File) => {
    setFilename(file.name);
    setErrorMsg(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = parseGpxFile(text, file.name);
        setParsedRun(parsed);
      } catch (err) {
        console.error("GPX parse error:", err);
        setErrorMsg("Could not process the GPX file. Please verify it is a valid GPX/TCX/XML file.");
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = () => {
    if (!parsedRun) return;
    const finalRun: RunActivity = {
      id: `gpx-${Date.now()}`,
      title: parsedRun.title || 'Imported GPX Route',
      date: parsedRun.date || toDateKeyFromDate(new Date()),
      type: parsedRun.type || 'easy',
      isTreadmill: false,
      distanceKm: parsedRun.distanceKm || 5.0,
      durationSec: parsedRun.durationSec || 1500,
      avgPaceMinKm: parsedRun.avgPaceMinKm || 5.0,
      elevationGainM: parsedRun.elevationGainM || 0,
      avgHeartRate: parsedRun.avgHeartRate,
      maxHeartRate: parsedRun.maxHeartRate,
      avgCadenceSpm: parsedRun.avgCadenceSpm || 172,
      calories: parsedRun.calories || 320,
      source: 'gpx',
      routeCoordinates: parsedRun.routeCoordinates,
      splits: parsedRun.splits
    };
    onImport(finalRun);
    onClose();
  };

  return (
    <div className="stride-modal-backdrop" onClick={onClose}>
      <div className="stride-modal-container" onClick={e => e.stopPropagation()}>
        <div className="stride-modal-header">
          <div>
            <h3>Import GPX / FIT / TCX File</h3>
            <p className="subtitle">Upload a GPS file from your sports watch or app</p>
          </div>
          <button className="stride-close-btn" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="stride-modal-body">
          {!parsedRun ? (
            <div 
              className="dropzone-area"
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleFileUpload(e.dataTransfer.files[0]);
                }
              }}
            >
              <UploadCloud size={48} style={{ color: '#38bdf8', marginBottom: 12 }} />
              <h4>Drag your GPX file here</h4>
              <p>or click to select a file (.gpx, .xml, .tcx)</p>
              <input 
                type="file" 
                accept=".gpx,.xml,.tcx" 
                onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                style={{ display: 'none' }}
                id="gpx-file-input"
              />
              <label htmlFor="gpx-file-input" className="btn-browse">
                Choose File
              </label>

              {errorMsg && <p className="error-text">{errorMsg}</p>}
            </div>
          ) : (
            <div className="gpx-preview-container">
              <div className="gpx-file-badge">
                <FileText size={16} style={{ color: '#38bdf8' }} />
                <span>{filename}</span>
              </div>

              <div className="gpx-metrics-grid">
                <div className="gpx-metric-card">
                  <span className="metric-label">Distance</span>
                  <span className="metric-val">{parsedRun.distanceKm} km</span>
                </div>
                <div className="gpx-metric-card">
                  <span className="metric-label">Duration</span>
                  <span className="metric-val">
                    {Math.floor((parsedRun.durationSec || 0) / 60)}m {(parsedRun.durationSec || 0) % 60}s
                  </span>
                </div>
                <div className="gpx-metric-card">
                  <span className="metric-label">Avg Pace</span>
                  <span className="metric-val">{parsedRun.avgPaceMinKm} /km</span>
                </div>
                <div className="gpx-metric-card">
                  <span className="metric-label">Elevation Gain</span>
                  <span className="metric-val">{parsedRun.elevationGainM} m</span>
                </div>
              </div>

              {/* Route Polyline Preview */}
              {parsedRun.routeCoordinates && parsedRun.routeCoordinates.length > 0 && (
                <div className="gpx-route-preview">
                  <span className="preview-label">GPS Route Preview ({parsedRun.routeCoordinates.length} points)</span>
                  <svg viewBox="0 0 400 120" className="route-svg">
                    {(() => {
                      const coords = parsedRun.routeCoordinates!;
                      const lats = coords.map(c => c.lat);
                      const lngs = coords.map(c => c.lng);
                      const minLat = Math.min(...lats);
                      const maxLat = Math.max(...lats);
                      const minLng = Math.min(...lngs);
                      const maxLng = Math.max(...lngs);
                      
                      const points = coords.map(c => {
                        const x = ((c.lng - minLng) / (maxLng - minLng || 1)) * 360 + 20;
                        const y = 100 - ((c.lat - minLat) / (maxLat - minLat || 1)) * 80 + 10;
                        return `${x},${y}`;
                      }).join(' ');

                      return (
                        <polyline
                          fill="none"
                          stroke="#38bdf8"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points={points}
                        />
                      );
                    })()}
                  </svg>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="stride-modal-footer">
          <button className="btn-cancel" onClick={onClose}>Cancel</button>
          {parsedRun && (
            <button className="btn-save" onClick={handleConfirmImport}>
              <Check size={16} style={{ marginRight: 6 }} />
              Import GPX into Zenith Stride
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
