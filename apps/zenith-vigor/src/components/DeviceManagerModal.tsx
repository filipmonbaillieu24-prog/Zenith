import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Scale, Radio, ToggleLeft, ToggleRight, Bluetooth, RefreshCw } from 'lucide-react';
import { supabase } from '../utils/supabaseClient';
import { WeightScaleConnector } from './WeightScaleConnector';
import ColmiRingConnector from './ColmiRingConnector';

interface DeviceManagerModalProps {
  userId: string;
  onClose: () => void;
  fitnessProfile: any;
  onDevicesUpdated: () => void;
}

interface PairedDevice {
  id: string;
  user_id: string;
  device_type: 'scale' | 'ring';
  brand: string;
  model: string;
  auto_connect: boolean;
  settings: any;
  created_at: string;
}

export const DeviceManagerModal: React.FC<DeviceManagerModalProps> = ({
  userId,
  onClose,
  fitnessProfile,
  onDevicesUpdated,
}) => {
  const [loading, setLoading] = useState(true);
  const [devices, setDevices] = useState<PairedDevice[]>([]);
  const [view, setView] = useState<'list' | 'add' | 'scale_pairing' | 'ring_pairing'>('list');
  const [selectedType, setSelectedType] = useState<'scale' | 'ring' | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('');

  // Fetch paired devices from Supabase
  const fetchDevices = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('vigor_paired_devices')
        .select('*')
        .eq('user_id', userId);

      if (error) throw error;
      setDevices(data || []);
    } catch (err) {
      console.error('Error fetching paired devices:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, [userId]);

  // Toggle auto-connect state in DB
  const handleToggleAutoConnect = async (device: PairedDevice) => {
    try {
      const { error } = await supabase
        .from('vigor_paired_devices')
        .update({ auto_connect: !device.auto_connect })
        .eq('id', device.id);

      if (error) throw error;
      
      // Update local state
      setDevices(prev =>
        prev.map(d => (d.id === device.id ? { ...d, auto_connect: !d.auto_connect } : d))
      );
      onDevicesUpdated();
    } catch (err) {
      console.error('Error updating auto connect:', err);
    }
  };

  // Remove/Unpair device
  const handleUnpairDevice = async (device: PairedDevice) => {
    if (!window.confirm(`Weet je zeker dat je de ${device.brand} ${device.model} wilt ontkoppelen?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('vigor_paired_devices')
        .delete()
        .eq('id', device.id);

      if (error) throw error;

      // Clear local storage pairing info if applicable
      if (device.device_type === 'scale') {
        localStorage.removeItem('vigor_paired_scale_id');
        localStorage.removeItem('vigor_paired_scale_name');
      }

      setDevices(prev => prev.filter(d => d.id !== device.id));
      onDevicesUpdated();
    } catch (err) {
      console.error('Error unpairing device:', err);
    }
  };

  // Start connection flow
  const handleConnectDevice = (device: PairedDevice) => {
    if (device.device_type === 'scale') {
      setView('scale_pairing');
    } else if (device.device_type === 'ring') {
      setView('ring_pairing');
    }
  };

  // Save successfully paired device to Supabase
  const saveDeviceToDatabase = async (type: 'scale' | 'ring', brand: string, model: string, macAddress?: string) => {
    try {
      const payload = {
        user_id: userId,
        device_type: type,
        brand,
        model,
        auto_connect: true,
        settings: macAddress ? { mac_address: macAddress } : {},
      };

      const { error } = await supabase
        .from('vigor_paired_devices')
        .upsert(payload, { onConflict: 'user_id,device_type,brand,model' });

      if (error) throw error;
      await fetchDevices();
      onDevicesUpdated();
    } catch (err) {
      console.error('Error saving device to database:', err);
    }
  };

  const handlePairingScaleSuccess = async () => {
    await saveDeviceToDatabase('scale', 'Neo Health', 'Onyx SE');
    setView('list');
  };

  const handlePairingRingSuccess = async (brand?: string, model?: string, macAddress?: string) => {
    const finalBrand = typeof brand === 'string' ? brand : 'Colmi';
    const finalModel = typeof model === 'string' ? model : 'R02';
    await saveDeviceToDatabase('ring', finalBrand, finalModel, macAddress);
    setView('list');
  };

  const renderListView = () => {
    return (
      <>
        <div className="modal-header">
          <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Bluetooth style={{ color: '#5c7cfa' }} /> Apparaten Beheer
          </h2>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '10px 0' }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 8 }}>
            Beheer de gekoppelde apparaten die worden gebruikt voor het automatisch synchroniseren van je gezondheidsgegevens.
          </p>

          {loading ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Gekoppelde apparaten laden...
            </div>
          ) : devices.length === 0 ? (
            <div 
              style={{ 
                border: '1px dashed rgba(255, 255, 255, 0.08)', 
                borderRadius: '12px', 
                padding: '32px 16px', 
                textAlign: 'center',
                background: 'rgba(255,255,255,0.01)'
              }}
            >
              <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
                Nog geen apparaten gekoppeld.
              </div>
              <button 
                onClick={() => { setView('add'); setSelectedType(null); setSelectedModel(''); }} 
                className="btn-primary" 
                style={{ margin: '0 auto', fontSize: 13, padding: '10px 18px' }}
              >
                <Plus size={16} /> Apparaat Koppelen
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {devices.map(device => {
                const isScale = device.device_type === 'scale';
                return (
                  <div 
                    key={device.id} 
                    style={{ 
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: '12px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div 
                          style={{ 
                            background: isScale ? 'rgba(57, 255, 20, 0.05)' : 'rgba(92, 124, 250, 0.05)',
                            border: `1px solid ${isScale ? 'rgba(57, 255, 20, 0.2)' : 'rgba(92, 124, 250, 0.2)'}`,
                            padding: '10px',
                            borderRadius: '10px',
                            color: isScale ? '#39ff14' : '#5c7cfa'
                          }}
                        >
                          {isScale ? <Scale size={20} /> : <Radio size={20} />}
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 800 }}>{device.brand} {device.model}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            {isScale ? 'Weegschaal (Metingen & Vetpercentage)' : 'Smart Ring (Stappen & Slaap)'}
                          </div>
                        </div>
                      </div>

                      <button 
                        onClick={() => handleUnpairDevice(device)} 
                        style={{ 
                          background: 'transparent', 
                          border: 'none', 
                          color: 'rgba(239, 68, 68, 0.6)', 
                          cursor: 'pointer',
                          padding: '6px',
                          borderRadius: '6px',
                          transition: 'all 0.15s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                        onMouseLeave={e => e.currentTarget.style.color = 'rgba(239, 68, 68, 0.6)'}
                        title="Ontkoppelen"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div 
                      style={{ 
                        borderTop: '1px solid rgba(255,255,255,0.04)',
                        paddingTop: '12px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: 12
                      }}
                    >
                      <div 
                        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}
                        onClick={() => handleToggleAutoConnect(device)}
                      >
                        {device.auto_connect ? (
                          <ToggleRight size={24} style={{ color: isScale ? '#39ff14' : '#5c7cfa' }} />
                        ) : (
                          <ToggleLeft size={24} style={{ color: 'var(--text-muted)' }} />
                        )}
                        <span style={{ color: 'var(--text-muted)' }}>Auto-connect</span>
                      </div>

                      <button 
                        onClick={() => handleConnectDevice(device)}
                        className="btn-secondary"
                        style={{ padding: '6px 12px', fontSize: 11, borderRadius: '8px', gap: 6 }}
                      >
                        <RefreshCw size={12} /> Sync / Verbinden
                      </button>
                    </div>
                  </div>
                );
              })}

              <button 
                onClick={() => { setView('add'); setSelectedType(null); setSelectedModel(''); }} 
                className="btn-secondary" 
                style={{ width: '100%', borderStyle: 'dashed', background: 'transparent', gap: 8 }}
              >
                <Plus size={16} /> Apparaat Koppelen
              </button>
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn-primary" onClick={onClose} style={{ margin: 0, padding: '10px 20px', fontSize: 13 }}>
            Sluiten
          </button>
        </div>
      </>
    );
  };

  const renderAddView = () => {
    return (
      <>
        <div className="modal-header">
          <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Apparaat Koppelen
          </h2>
          <button className="modal-close" onClick={() => setView('list')}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '10px 0' }}>
          
          {/* Step 1: Device Type */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">1. Kies type apparaat</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div 
                onClick={() => { setSelectedType('scale'); setSelectedModel('Onyx SE'); }}
                style={{
                  background: selectedType === 'scale' ? 'rgba(57, 255, 20, 0.04)' : 'rgba(255,255,255,0.01)',
                  border: `1px solid ${selectedType === 'scale' ? '#39ff14' : 'rgba(255,255,255,0.06)'}`,
                  borderRadius: '12px',
                  padding: '20px 16px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 10,
                  transition: 'all 0.2s'
                }}
              >
                <Scale size={24} style={{ color: selectedType === 'scale' ? '#39ff14' : 'var(--text-muted)' }} />
                <span style={{ fontSize: 13, fontWeight: 800, color: selectedType === 'scale' ? '#fff' : 'var(--text-muted)' }}>Weegschaal</span>
              </div>

              <div 
                onClick={() => { setSelectedType('ring'); setSelectedModel('R02'); }}
                style={{
                  background: selectedType === 'ring' ? 'rgba(92, 124, 250, 0.04)' : 'rgba(255,255,255,0.01)',
                  border: `1px solid ${selectedType === 'ring' ? '#5c7cfa' : 'rgba(255,255,255,0.06)'}`,
                  borderRadius: '12px',
                  padding: '20px 16px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 10,
                  transition: 'all 0.2s'
                }}
              >
                <Radio size={24} style={{ color: selectedType === 'ring' ? '#5c7cfa' : 'var(--text-muted)' }} />
                <span style={{ fontSize: 13, fontWeight: 800, color: selectedType === 'ring' ? '#fff' : 'var(--text-muted)' }}>Smart Ring</span>
              </div>
            </div>
          </div>

          {/* Step 2: Model Selection */}
          {selectedType && (
            <div className="form-group animate-slide-up" style={{ marginBottom: 0 }}>
              <label className="form-label">2. Kies model</label>
              <select 
                className="form-input" 
                value={selectedModel}
                onChange={e => setSelectedModel(e.target.value)}
                style={{ background: '#121218' }}
              >
                {selectedType === 'scale' ? (
                  <option value="Onyx SE">Neo Health Onyx SE</option>
                ) : (
                  <option value="R02">Colmi R02 Smart Ring</option>
                )}
              </select>
            </div>
          )}

          {/* Device Description Hint */}
          {selectedType && selectedModel && (
            <div 
              className="animate-fade-in" 
              style={{ 
                background: 'rgba(255,255,255,0.02)', 
                border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: '10px',
                padding: '12px 16px',
                fontSize: 12,
                color: 'var(--text-muted)',
                lineHeight: 1.5
              }}
            >
              {selectedType === 'scale' ? (
                <>
                  De <strong>Neo Health Onyx SE</strong> weegschaal maakt verbinding via Web Bluetooth op je computer. Zorg dat je weegschaal aanstaat door er kort op te tikken.
                </>
              ) : (
                <>
                  De <strong>Colmi R02 Smart Ring</strong> synchroniseert via de native BLE bridge van de Zenith desktop-app. Zorg dat de ring opgeladen en in de buurt is.
                </>
              )}
            </div>
          )}

        </div>

        <div className="modal-footer" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px', display: 'flex', gap: 12 }}>
          <button className="btn-secondary" onClick={() => setView('list')} style={{ flex: 1, margin: 0 }}>
            Annuleren
          </button>
          <button 
            className="btn-primary" 
            disabled={!selectedType || !selectedModel}
            onClick={async () => {
              const isNativeMode = window.parent && window.parent !== window;
              if (isNativeMode) {
                if (selectedType === 'scale') {
                  await saveDeviceToDatabase('scale', 'Neo Health', 'Onyx SE');
                } else if (selectedType === 'ring') {
                  await saveDeviceToDatabase('ring', 'Colmi', 'R02');
                }
                setView('list');
              } else {
                if (selectedType === 'scale') setView('scale_pairing');
                else if (selectedType === 'ring') setView('ring_pairing');
              }
            }}
            style={{ 
              flex: 1, 
              margin: 0,
              background: (!selectedType || !selectedModel) ? 'rgba(255,255,255,0.05)' : selectedType === 'scale' ? '#39ff14' : '#5c7cfa',
              color: (!selectedType || !selectedModel) ? 'var(--text-muted)' : '#09090b'
            }}
          >
            Koppelen Starten
          </button>
        </div>
      </>
    );
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1001 }}>
      <div className="modal-content animate-slide-up" style={{ maxWidth: '480px' }}>
        
        {view === 'list' && renderListView()}
        {view === 'add' && renderAddView()}

        {view === 'scale_pairing' && (
          <WeightScaleConnector 
            onClose={() => { setView('list'); fetchDevices(); }}
            onWeightLogged={async (weight, bodyFat, water, muscle) => {
              try {
                // Save log
                const { error } = await supabase.from('vigor_weight').insert({
                  user_id: userId,
                  weight,
                  body_fat: bodyFat,
                  water_percent: water,
                  muscle_mass: muscle,
                  logged_at: new Date().toISOString()
                });
                if (error) throw error;
                
                // Store pairing in DB
                await handlePairingScaleSuccess();
              } catch (err) {
                console.error('Error logging weight during pairing:', err);
              }
            }}
            fitnessProfile={fitnessProfile}
            onPairingSuccess={handlePairingScaleSuccess}
            scaleModel={selectedModel}
          />
        )}

        {view === 'ring_pairing' && (
          <ColmiRingConnector 
            onClose={() => { setView('list'); fetchDevices(); }}
            userId={userId}
            onSyncComplete={handlePairingRingSuccess}
            onPairingSuccess={handlePairingRingSuccess}
          />
        )}

      </div>
    </div>
  );
};
