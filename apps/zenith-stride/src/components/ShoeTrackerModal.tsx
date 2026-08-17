import React, { useState } from 'react';
import { RunningShoe } from '../types/stride';
import { X, Plus, Footprints, Trash2, CheckCircle2, AlertTriangle, Check } from 'lucide-react';

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
      purchaseDate: new Date().toISOString().slice(0, 10)
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
            <h3>Hardloopschoenen & Slijtage Tracker</h3>
            <p className="subtitle">Houd de gereden kilometers per paar schoenen bij</p>
          </div>
          <button className="stride-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="stride-modal-body">
          <div className="shoes-header-bar">
            <span>Mijn hardloopschoenen</span>
            <button className="btn-add-shoe" onClick={() => setShowAddForm(!showAddForm)}>
              <Plus size={14} />
              <span>Nieuw Paar Toevoegen</span>
            </button>
          </div>

          {showAddForm && (
            <form onSubmit={handleCreateShoe} className="add-shoe-form animate-fade-in">
              <div className="form-row">
                <div className="form-group flex-1">
                  <label>Merk</label>
                  <input 
                    type="text" 
                    placeholder="Bijv. Nike, Hoka, Saucony" 
                    value={brand} 
                    onChange={e => setBrand(e.target.value)} 
                    required 
                  />
                </div>
                <div className="form-group flex-1">
                  <label>Model</label>
                  <input 
                    type="text" 
                    placeholder="Bijv. Clifton 9, Endorphin Speed 3" 
                    value={model} 
                    onChange={e => setModel(e.target.value)} 
                    required 
                  />
                </div>
                <div className="form-group flex-1">
                  <label>Max. Kilometers</label>
                  <input 
                    type="number" 
                    value={maxDistanceKm} 
                    onChange={e => setMaxDistanceKm(e.target.value)} 
                    placeholder="700" 
                  />
                </div>
              </div>
              <button type="submit" className="btn-save-shoe">
                <Check size={14} style={{ marginRight: 4 }} /> Opslaan
              </button>
            </form>
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
                    title={shoe.retired ? 'Wederom in gebruik nemen' : 'Pensioneer schoen'}
                  >
                    {shoe.retired ? 'Herstellen' : 'Pensioneren'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="stride-modal-footer">
          <button className="btn-cancel" onClick={onClose}>Sluiten</button>
        </div>
      </div>
    </div>
  );
};
