import React, { useState } from 'react';
import { RunningShoe } from '../types/stride';
import { X, Plus, Footprints, Trash2, CheckCircle2, AlertTriangle, Check } from 'lucide-react';
import { toDateKeyFromDate } from '@zenith/shared';

interface ShoeTrackerModalProps {
  isOpen: boolean;
  onClose: () => void;
  shoes: RunningShoe[];
  onAddShoe: (shoe: RunningShoe) => void;
  onToggleRetire: (shoeId: string) => void;
}

export const ShoeTrackerModal: React.FC<ShoeTrackerModalProps> = ({
  isOpen,
  onClose,
  shoes,
  onAddShoe,
  onToggleRetire
}) => {
  if (!isOpen) return null;

  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [maxDistanceKm, setMaxDistanceKm] = useState('700');
  const [showAddForm, setShowAddForm] = useState(false);

  const handleCreateShoe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!brand || !model) return;

    const newShoe: RunningShoe = {
      id: `shoe-${Date.now()}`,
      brand,
      model,
      totalDistanceKm: 0,
      maxDistanceKm: parseInt(maxDistanceKm, 10) || 700,
      retired: false,
      purchaseDate: toDateKeyFromDate(new Date())
    };

    onAddShoe(newShoe);
    setBrand('');
    setModel('');
    setShowAddForm(false);
  };

  return (
    <div className="stride-modal-backdrop" onClick={onClose}>
      <div className="stride-modal-container" onClick={e => e.stopPropagation()}>
        <div className="stride-modal-header">
          <div>
            <h3>Running Shoes & Wear Tracker</h3>
            <p className="subtitle">Track distance logged per pair of shoes</p>
          </div>
          <button className="stride-close-btn" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="stride-modal-body">
          <div className="shoes-header-bar">
            <span>My Running Shoes</span>
            <button className="btn-add-shoe" onClick={() => setShowAddForm(!showAddForm)}>
              <Plus size={14} />
              <span>Add New Pair</span>
            </button>
          </div>

          {showAddForm && (
            <form onSubmit={handleCreateShoe} className="add-shoe-form animate-fade-in">
              <div className="form-row">
                <div className="form-group flex-1">
                  <label>Brand</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Nike, Hoka, Saucony" 
                    value={brand} 
                    onChange={e => setBrand(e.target.value)} 
                    required 
                  />
                </div>
                <div className="form-group flex-1">
                  <label>Model</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Clifton 9, Endorphin Speed 3" 
                    value={model} 
                    onChange={e => setModel(e.target.value)} 
                    required 
                  />
                </div>
                <div className="form-group flex-1">
                  <label>Max Distance (km)</label>
                  <input 
                    type="number" 
                    value={maxDistanceKm} 
                    onChange={e => setMaxDistanceKm(e.target.value)} 
                    placeholder="700" 
                  />
                </div>
              </div>
              <button type="submit" className="btn-save-shoe">
                <Check size={14} style={{ marginRight: 4 }} /> Save
              </button>
            </form>
          )}

          {shoes.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px 12px', color: 'var(--text-muted, #94a3b8)' }}>
              <Footprints size={22} style={{ opacity: 0.5, marginBottom: 8 }} />
              <p style={{ margin: 0, fontSize: 13 }}>No shoes added yet.</p>
              <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.8 }}>Add a pair to start tracking wear as you log runs.</p>
            </div>
          )}

          <div className="shoes-list">
            {shoes.map(shoe => {
              const percent = Math.min(100, Math.round((shoe.totalDistanceKm / shoe.maxDistanceKm) * 100));
              const isWarning = percent >= 80 && percent < 100;
              const isExpired = percent >= 100;

              return (
                <div key={shoe.id} className={`shoe-card ${shoe.retired ? 'retired' : ''}`}>
                  <div className="shoe-main-info">
                    <div className="shoe-brand-icon">
                      <Footprints size={20} style={{ color: isExpired ? '#ef4444' : (isWarning ? '#f59e0b' : '#38bdf8') }} />
                    </div>
                    <div>
                      <h4>{shoe.brand} {shoe.model}</h4>
                      <span className="shoe-km">
                        {shoe.totalDistanceKm} / {shoe.maxDistanceKm} km ({percent}%)
                      </span>
                    </div>
                  </div>

                  <div className="shoe-progress-container">
                    <div className="shoe-progress-bar">
                      <div 
                        className={`shoe-progress-fill ${isExpired ? 'expired' : (isWarning ? 'warning' : 'ok')}`} 
                        style={{ width: `${percent}%` }}
                      ></div>
                    </div>
                  </div>

                  <button 
                    className="btn-retire" 
                    onClick={() => onToggleRetire(shoe.id)}
                    title={shoe.retired ? 'Bring back into use' : 'Retire shoe'}
                  >
                    {shoe.retired ? 'Restore' : 'Retire'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="stride-modal-footer">
          <button className="btn-cancel" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};
