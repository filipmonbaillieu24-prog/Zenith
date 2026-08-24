import React, { useEffect, useState } from 'react';
import {
  Bike, Plus, Trash2, ShieldAlert, Wrench, Calendar, Check, RefreshCw, AlertTriangle
} from 'lucide-react';
import { FitnessProfile, Gear, GearComponent } from '../types/workout';
import { getAllGear, saveGear, deleteGear } from '../utils/db';
import './GearPage.css';

interface GearPageProps {
  profile: FitnessProfile;
}

export const GearPage: React.FC<GearPageProps> = () => {
  const [gears, setGears] = useState<Gear[]>([]);
  const [loading, setLoading] = useState(true);

  // States for adding bike
  const [showAddGear, setShowAddGear] = useState(false);
  const [gearName, setGearName] = useState('');
  const [gearType, setGearType] = useState<'road' | 'gravel' | 'mtb' | 'other'>('road');
  const [gearBrand, setGearBrand] = useState('');
  const [gearModel, setGearModel] = useState('');
  const [gearWeight, setGearWeight] = useState('');

  // States for adding custom component per bike
  const [activeGearForAddComp, setActiveGearForAddComp] = useState<string | null>(null);
  const [compName, setCompName] = useState('');
  const [compMaxDist, setCompMaxDist] = useState('3000');

  const loadData = async () => {
    setLoading(true);
    const allGear = await getAllGear();
    
    if (allGear.length === 0) {
      const demoGear: Gear = {
        id: 'demo-tarmac',
        name: 'Specialized Tarmac SL8',
        type: 'road',
        brand: 'Specialized',
        model: 'Tarmac SL8 Pro',
        weight: 7.2,
        distance: 1450,
        active: true,
        components: [
          {
            id: 'demo-chain',
            name: 'Chain (Waxed)',
            distance: 1450,
            maxDistance: 3000,
            installedAt: Date.now() - 45 * 24 * 3600 * 1000,
            history: [
              { date: Date.now() - 90 * 24 * 3600 * 1000, distance: 3120 }
            ]
          },
          {
            id: 'demo-tyres',
            name: 'Grand Prix 5000 S TR',
            distance: 1450,
            maxDistance: 5000,
            installedAt: Date.now() - 45 * 24 * 3600 * 1000
          }
        ]
      };
      setGears([demoGear]);
    } else {
      setGears(allGear);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Save bike
  const handleAddGear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gearName.trim()) return;

    const newGear: Gear = {
      id: Math.random().toString(36).substring(2, 9),
      name: gearName,
      type: gearType,
      brand: gearBrand || undefined,
      model: gearModel || undefined,
      weight: gearWeight ? parseFloat(gearWeight) : undefined,
      distance: 0,
      active: gears.length === 0,
      components: [
        {
          id: Math.random().toString(36).substring(2, 9),
          name: 'Chain',
          distance: 0,
          maxDistance: 3000,
          installedAt: 0  // 0 = counts all rides from the start
        },
        {
          id: Math.random().toString(36).substring(2, 9),
          name: 'Tires',
          distance: 0,
          maxDistance: 5000,
          installedAt: 0  // 0 = counts all rides from the start
        }
      ]
    };

    await saveGear(newGear);
    setGearName('');
    setGearBrand('');
    setGearModel('');
    setGearWeight('');
    setShowAddGear(false);
    loadData();
  };

  // Delete Bike
  const handleDeleteGear = async (id: string) => {
    if (confirm('Are you sure you want to delete this bike?')) {
      await deleteGear(id);
      loadData();
    }
  };

  // Add custom component to bike
  const handleAddComponent = async (gearId: string) => {
    if (!compName.trim()) return;
    const gear = gears.find(g => g.id === gearId);
    if (!gear) return;

    const newComp: GearComponent = {
      id: Math.random().toString(36).substring(2, 9),
      name: compName,
      distance: 0,
      maxDistance: parseInt(compMaxDist) || 3000,
      installedAt: 0  // 0 = counts all rides from bike creation
    };

    const updatedGear = {
      ...gear,
      components: [...gear.components, newComp]
    };

    await saveGear(updatedGear);
    setCompName('');
    setCompMaxDist('3000');
    setActiveGearForAddComp(null);
    loadData();
  };

  // Reset component — set timestamp to 0 so all rides count
  const handleSyncComponentToAllRides = async (gearId: string, compId: string) => {
    const gear = gears.find(g => g.id === gearId);
    if (!gear) return;
    const updatedComponents = gear.components.map(c => {
      if (c.id === compId) {
        return { ...c, installedAt: 0 }; // 0 = count all rides of this bike
      }
      return c;
    });
    const updatedGear = { ...gear, components: updatedComponents };
    await saveGear(updatedGear);
    loadData();
  };

  // Reset component mileage (replace)
  const handleResetComponent = async (gearId: string, compId: string) => {
    const gear = gears.find(g => g.id === gearId);
    if (!gear) return;
    const comp = gear.components.find(c => c.id === compId);
    if (!comp) return;

    if (confirm(`Are you sure you want to reset the mileage of ${comp.name}? (This archives the current distance in history)`)) {
      const updatedComponents = gear.components.map(c => {
        if (c.id === compId) {
          const history = c.history ?? [];
          return {
            ...c,
            distance: 0,
            installedAt: Date.now(),  // After reset counts from now
            history: [...history, { date: Date.now(), distance: c.distance }]
          };
        }
        return c;
      });

      const updatedGear = { ...gear, components: updatedComponents };
      await saveGear(updatedGear);
      loadData();
    }
  };

  // Sync all components of a bike to all rides (installedAt = 0)
  const handleSyncAllComponents = async (gearId: string) => {
    const gear = gears.find(g => g.id === gearId);
    if (!gear) return;
    const updatedComponents = gear.components.map(c => ({ ...c, installedAt: 0 }));
    await saveGear({ ...gear, components: updatedComponents });
    loadData();
  };

  if (loading) {
    return (
      <div className="gp-main-content gp-loading">
        <div className="wd-spinner" />
        <p>Equipment tracker loading…</p>
      </div>
    );
  }

  return (
    <div className="gp-main-content">
      <div className="gp-container">
        
        {/* Action Bar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button className="gp-add-bike-btn" onClick={() => setShowAddGear(!showAddGear)}>
            <Plus size={14} style={{ marginRight: 6 }} /> Add Bike
          </button>
        </div>

        {/* Add bike form */}
        {showAddGear && (
          <form onSubmit={handleAddGear} className="gp-bike-form animate-slide-up">
            <h3>Add New Bike</h3>
            <div className="gp-form-grid">
              <div className="gp-form-group">
                <label>Name *</label>
                <input type="text" placeholder="e.g. Specialized Tarmac" value={gearName} onChange={e => setGearName(e.target.value)} required />
              </div>
              <div className="gp-form-group">
                <label>Ride Type</label>
                <select value={gearType} onChange={e => setGearType(e.target.value as any)}>
                  <option value="road">Road bike / Road</option>
                  <option value="gravel">Gravelbike</option>
                  <option value="mtb">MTB / Offroad</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="gp-form-group">
                <label>Brand</label>
                <input type="text" placeholder="e.g. Specialized" value={gearBrand} onChange={e => setGearBrand(e.target.value)} />
              </div>
              <div className="gp-form-group">
                <label>Model</label>
                <input type="text" placeholder="e.g. SL8 Pro" value={gearModel} onChange={e => setGearModel(e.target.value)} />
              </div>
              <div className="gp-form-group">
                <label>Weight (kg)</label>
                <input type="number" step="0.1" placeholder="e.g. 7.2" value={gearWeight} onChange={e => setGearWeight(e.target.value)} />
              </div>
            </div>
            <div className="gp-form-actions">
              <button type="button" className="gp-cancel-btn" onClick={() => setShowAddGear(false)}>Cancel</button>
              <button type="submit" className="gp-submit-btn">Save Bike</button>
            </div>
          </form>
        )}

        {/* Bikes list */}
        <div className="gp-grid">
          {gears.map(g => (
            <div key={g.id} className="gp-card animate-slide-up">
              <div className="gp-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="gp-bike-icon-box">
                    <Bike size={22} style={{ color: '#cbd5e1' }} />
                  </div>
                  <div>
                    <h3 className="gp-bike-name">{g.name}</h3>
                    <p className="gp-bike-desc">
                      {g.brand ? `${g.brand} ` : ''}{g.model ? g.model : ''} {g.weight ? `· ${g.weight} kg` : ''}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span className="gp-bike-dist">{g.distance.toFixed(0)} km</span>
                  {g.components.some(c => c.installedAt > 0) && (
                    <button
                      className="gp-comp-reset-btn"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(203, 213, 225,0.07)', borderColor: 'rgba(203, 213, 225,0.25)', color: '#cbd5e1', fontSize: 10 }}
                      onClick={() => handleSyncAllComponents(g.id)}
                      title="Synchronize all components with all rides of this bike"
                    >
                      <RefreshCw size={11} strokeWidth={1.8} /> Sync all km
                    </button>
                  )}
                  <button className="gp-delete-btn" onClick={() => handleDeleteGear(g.id)} title="Delete Bike">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Components list */}
              <div className="gp-components-box">
                <div className="gp-comp-header">
                  <h4>Components & Wear</h4>
                  <button className="gp-add-comp-toggle-btn" onClick={() => setActiveGearForAddComp(activeGearForAddComp === g.id ? null : g.id)}>
                    <Plus size={12} style={{ marginRight: 4 }} /> Add Component
                  </button>
                </div>

                {/* Info banner: wear vs total km */}
                {g.components.some(c => c.installedAt > 0 && Math.abs(c.distance - g.distance) > 5) && (
                  <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    background: 'rgba(253,203,110,0.06)', border: '1px solid rgba(253,203,110,0.2)',
                    borderRadius: 7, padding: '7px 10px', marginBottom: 8, fontSize: 10,
                  }}>
                    <AlertTriangle size={13} style={{ flexShrink: 0, color: '#fdcb6e', marginTop: 1 }} />
                    <span style={{ color: '#fdcb6e', lineHeight: 1.4 }}>
                      <strong>Component mileage differs from total bike distance.</strong> This occurs when component installation date is
                      later than the first ride. Click <em>Sync all km</em> to include all rides.
                    </span>
                  </div>
                )}

                {/* Inline add component form */}
                {activeGearForAddComp === g.id && (
                  <div className="gp-add-comp-form animate-slide-up">
                    <input type="text" placeholder="Component (e.g. Cassette, Chain)" value={compName} onChange={e => setCompName(e.target.value)} required />
                    <input type="number" placeholder="Threshold (km)" value={compMaxDist} onChange={e => setCompMaxDist(e.target.value)} required />
                    <button type="button" onClick={() => handleAddComponent(g.id)}><Check size={14} /></button>
                  </div>
                )}

                <div className="gp-components-list">
                  {g.components.map(c => {
                    const pct = Math.min(100, Math.round((c.distance / c.maxDistance) * 100));
                    const isLimit = pct >= 90;
                    return (
                      <div key={c.id} className="gp-comp-item">
                        <div className="gp-comp-row">
                          <div className="gp-comp-name-wrap">
                            <span className="gp-comp-name">{c.name}</span>
                            <div style={{ display: 'flex', gap: 5 }}>
                              {c.installedAt > 0 && (
                                <button
                                  type="button"
                                  className="gp-comp-reset-btn"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(203, 213, 225,0.06)', borderColor: 'rgba(203, 213, 225,0.2)', color: '#cbd5e1' }}
                                  onClick={() => handleSyncComponentToAllRides(g.id, c.id)}
                                  title="Synchronize with all rides (reset installation date to start)"
                                >
                                  <RefreshCw size={11} strokeWidth={1.8} /> Sync all km
                                </button>
                              )}
                              <button
                                type="button"
                                className="gp-comp-reset-btn"
                                onClick={() => handleResetComponent(g.id, c.id)}
                                title="Replace component (reset mileage)"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                              >
                                <Wrench size={11} strokeWidth={1.8} /> Replace
                              </button>
                            </div>
                          </div>
                          <span className="gp-comp-distance" style={{ color: isLimit ? '#ff7675' : '#94a3b8' }}>
                            {isLimit ? <ShieldAlert size={11} style={{ display: 'inline', marginRight: 4 }} /> : <Wrench size={11} style={{ display: 'inline', marginRight: 4 }} />}
                            {c.distance.toFixed(0)} / {c.maxDistance} km ({pct}%)
                            {c.installedAt > 0 && (
                              <span style={{ fontSize: 9, color: '#475569', marginLeft: 6 }}>
                                · since {new Date(c.installedAt).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: '2-digit' })}
                              </span>
                            )}
                          </span>
                        </div>

                        {/* Wear progress bar */}
                        <div className="gp-progress-bg">
                          <div
                            className="gp-progress-fill"
                            style={{
                              width: `${pct}%`,
                              background: isLimit ? 'linear-gradient(90deg, #ff7675, #d63031)' : 'linear-gradient(90deg, #cbd5e1, #00b894)'
                            }}
                          />
                        </div>

                        {/* Maintenance history log */}
                        {c.history && c.history.length > 0 && (
                          <div className="gp-comp-history">
                            <Calendar size={10} style={{ color: '#475569', marginRight: 4 }} />
                            <span style={{ color: '#475569' }}>History:</span>
                            {c.history.map((h, hidx) => (
                              <span key={hidx} className="gp-history-tag">
                                {new Date(h.date).toLocaleDateString('en-US', { day: '2-digit', month: '2-digit' })} ({h.distance.toFixed(0)} km)
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
};
