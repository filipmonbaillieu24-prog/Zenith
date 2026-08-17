import React, { useEffect, useState } from 'react';
import {
  Bike, Plus, Trash2, ShieldAlert, Wrench, Calendar, Check
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

  // States voor fiets toevoegen
  const [showAddGear, setShowAddGear] = useState(false);
  const [gearName, setGearName] = useState('');
  const [gearType, setGearType] = useState<'road' | 'gravel' | 'mtb' | 'other'>('road');
  const [gearBrand, setGearBrand] = useState('');
  const [gearModel, setGearModel] = useState('');
  const [gearWeight, setGearWeight] = useState('');

  // States voor custom onderdeel toevoegen per fiets
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

  // Fiets opslaan
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
          installedAt: 0  // 0 = telt alle rideten mee vanaf het begin
        },
        {
          id: Math.random().toString(36).substring(2, 9),
          name: 'Tires',
          distance: 0,
          maxDistance: 5000,
          installedAt: 0  // 0 = telt alle rideten mee vanaf het begin
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

  // Fiets verwijderen
  const handleDeleteGear = async (id: string) => {
    if (confirm('Are you sure you want to deze fiets wilt delete?')) {
      await deleteGear(id);
      loadData();
    }
  };

  // Custom component toevoegen aan fiets
  const handleAddComponent = async (gearId: string) => {
    if (!compName.trim()) return;
    const gear = gears.find(g => g.id === gearId);
    if (!gear) return;

    const newComp: GearComponent = {
      id: Math.random().toString(36).substring(2, 9),
      name: compName,
      distance: 0,
      maxDistance: parseInt(compMaxDist) || 3000,
      installedAt: 0  // 0 = telt alle rideten mee vanaf fiets-aanmaak
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

  // Component resetten — timestamp op 0 zetten zodat alle rideten meetellen
  const handleSyncComponentToAllRides = async (gearId: string, compId: string) => {
    const gear = gears.find(g => g.id === gearId);
    if (!gear) return;
    const updatedComponents = gear.components.map(c => {
      if (c.id === compId) {
        return { ...c, installedAt: 0 }; // 0 = tel alle rideten van deze fiets mee
      }
      return c;
    });
    const updatedGear = { ...gear, components: updatedComponents };
    await saveGear(updatedGear);
    loadData();
  };

  // Component kilometerstand resetten (vervangen)
  const handleResetComponent = async (gearId: string, compId: string) => {
    const gear = gears.find(g => g.id === gearId);
    if (!gear) return;
    const comp = gear.components.find(c => c.id === compId);
    if (!comp) return;

    if (confirm(`Are you sure you want to de kilometerstand van ${comp.name} wilt resetten? (Dit archiveert de huidige stand in de geschiedenis)`)) {
      const updatedComponents = gear.components.map(c => {
        if (c.id === compId) {
          const history = c.history ?? [];
          return {
            ...c,
            distance: 0,
            installedAt: Date.now(),  // Na reset telt vanaf nu
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

  // Sync alle componenten van een fiets naar alle rideten (installedAt = 0)
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
        <p>Materiaaltracker laden…</p>
      </div>
    );
  }

  return (
    <div className="gp-main-content">
      <div className="gp-container">
        
        {/* Action Bar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button className="gp-add-bike-btn" onClick={() => setShowAddGear(!showAddGear)}>
            <Plus size={14} style={{ marginRight: 6 }} /> Fiets toevoegen
          </button>
        </div>

        {/* Formulier fiets toevoegen */}
        {showAddGear && (
          <form onSubmit={handleAddGear} className="gp-bike-form animate-slide-up">
            <h3>Nieuwe Fiets Add</h3>
            <div className="gp-form-grid">
              <div className="gp-form-group">
                <label>Naam *</label>
                <input type="text" placeholder="bijv. Specialized Tarmac" value={gearName} onChange={e => setGearName(e.target.value)} required />
              </div>
              <div className="gp-form-group">
                <label>Ride Type</label>
                <select value={gearType} onChange={e => setGearType(e.target.value as any)}>
                  <option value="road">Racefiets / Weg</option>
                  <option value="gravel">Gravelbike</option>
                  <option value="mtb">MTB / Offroad</option>
                  <option value="other">Overig</option>
                </select>
              </div>
              <div className="gp-form-group">
                <label>Merk</label>
                <input type="text" placeholder="bijv. Specialized" value={gearBrand} onChange={e => setGearBrand(e.target.value)} />
              </div>
              <div className="gp-form-group">
                <label>Model</label>
                <input type="text" placeholder="bijv. SL8 Pro" value={gearModel} onChange={e => setGearModel(e.target.value)} />
              </div>
              <div className="gp-form-group">
                <label>Gewicht (kg)</label>
                <input type="number" step="0.1" placeholder="bijv. 7.2" value={gearWeight} onChange={e => setGearWeight(e.target.value)} />
              </div>
            </div>
            <div className="gp-form-actions">
              <button type="button" className="gp-cancel-btn" onClick={() => setShowAddGear(false)}>Cancel</button>
              <button type="submit" className="gp-submit-btn">Fiets Save</button>
            </div>
          </form>
        )}

        {/* Fietsen lijst */}
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
                      style={{ background: 'rgba(203, 213, 225,0.07)', borderColor: 'rgba(203, 213, 225,0.25)', color: '#cbd5e1', fontSize: 10 }}
                      onClick={() => handleSyncAllComponents(g.id)}
                      title="Synchroniseer alle onderdelen met alle rideten van deze fiets"
                    >
                      🔄 Sync alle km
                    </button>
                  )}
                  <button className="gp-delete-btn" onClick={() => handleDeleteGear(g.id)} title="Fiets verwijderen">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Onderdelen lijst */}
              <div className="gp-components-box">
                <div className="gp-comp-header">
                  <h4>Componenten & Slijtage</h4>
                  <button className="gp-add-comp-toggle-btn" onClick={() => setActiveGearForAddComp(activeGearForAddComp === g.id ? null : g.id)}>
                    <Plus size={12} style={{ marginRight: 4 }} /> Onderdeel toevoegen
                  </button>
                </div>

                {/* Info banner: slijtage vs totaal km */}
                {g.components.some(c => c.installedAt > 0 && Math.abs(c.distance - g.distance) > 5) && (
                  <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    background: 'rgba(253,203,110,0.06)', border: '1px solid rgba(253,203,110,0.2)',
                    borderRadius: 7, padding: '7px 10px', marginBottom: 8, fontSize: 10,
                  }}>
                    <span style={{ flexShrink: 0 }}>⚠️</span>
                    <span style={{ color: '#fdcb6e', lineHeight: 1.4 }}>
                      <strong>Slijtage km wijkt af van fiets-totaal.</strong> Dit komt doordat de installatiedatum van een onderdeel
                      later is dan de eerste ride. Klik op <em>Sync alle km</em> om alle rideten mee te tellen.
                    </span>
                  </div>
                )}

                {/* Inline formulier onderdeel toevoegen */}
                {activeGearForAddComp === g.id && (
                  <div className="gp-add-comp-form animate-slide-up">
                    <input type="text" placeholder="Onderdeel (bijv. Cassette, Chain)" value={compName} onChange={e => setCompName(e.target.value)} required />
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
                                  style={{ background: 'rgba(203, 213, 225,0.06)', borderColor: 'rgba(203, 213, 225,0.2)', color: '#cbd5e1' }}
                                  onClick={() => handleSyncComponentToAllRides(g.id, c.id)}
                                  title="Synchroniseer met alle rideten (reset installatiedatum naar begin)"
                                >
                                  🔄 Sync alle km
                                </button>
                              )}
                              <button
                                type="button"
                                className="gp-comp-reset-btn"
                                onClick={() => handleResetComponent(g.id, c.id)}
                                title="Onderdeel vervangen (kilometerstand resetten)"
                              >
                                🔧 Vervang
                              </button>
                            </div>
                          </div>
                          <span className="gp-comp-distance" style={{ color: isLimit ? '#ff7675' : '#94a3b8' }}>
                            {isLimit ? <ShieldAlert size={11} style={{ display: 'inline', marginRight: 4 }} /> : <Wrench size={11} style={{ display: 'inline', marginRight: 4 }} />}
                            {c.distance.toFixed(0)} / {c.maxDistance} km ({pct}%)
                            {c.installedAt > 0 && (
                              <span style={{ fontSize: 9, color: '#475569', marginLeft: 6 }}>
                                · sinds {new Date(c.installedAt).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: '2-digit' })}
                              </span>
                            )}
                          </span>
                        </div>

                        {/* Slijtage progressbar */}
                        <div className="gp-progress-bg">
                          <div
                            className="gp-progress-fill"
                            style={{
                              width: `${pct}%`,
                              background: isLimit ? 'linear-gradient(90deg, #ff7675, #d63031)' : 'linear-gradient(90deg, #cbd5e1, #00b894)'
                            }}
                          />
                        </div>

                        {/* Onderhoudshistorie logboek */}
                        {c.history && c.history.length > 0 && (
                          <div className="gp-comp-history">
                            <Calendar size={10} style={{ color: '#475569', marginRight: 4 }} />
                            <span style={{ color: '#475569' }}>Historie:</span>
                            {c.history.map((h, hidx) => (
                              <span key={hidx} className="gp-history-tag">
                                {new Date(h.date).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit' })} ({h.distance.toFixed(0)} km)
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
