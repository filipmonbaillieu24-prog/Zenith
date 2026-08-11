import { useState, useEffect } from 'react';
import { X, RefreshCw, Radio, Check } from 'lucide-react';
import { supabase } from '../utils/supabaseClient';

interface ColmiRingConnectorProps {
  onClose: () => void;
  userId: string;
  onSyncComplete: () => void;
  onPairingSuccess?: (brand: string, model: string, macAddress?: string) => void;
}

export default function ColmiRingConnector({ onClose, userId, onSyncComplete, onPairingSuccess }: ColmiRingConnectorProps) {
  const [status, setStatus] = useState<'idle' | 'scanning' | 'connecting' | 'syncing' | 'completed' | 'error'>('idle');
  const [syncLogs, setSyncLogs] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const addLog = (msg: string) => {
    setSyncLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    async function setupDirectListener() {
      if ((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__) {
        try {
          const { listen } = await import('@tauri-apps/api/event');
          unlisten = await listen<string>('colmi-sync-status', (event) => {
            const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
            addLog(payload.status);
          });
        } catch (e) {
          console.error("Failed to setup direct tauri colmi-sync-status listener", e);
        }
      }
    }
    setupDirectListener();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const handleSync = async (simulate: boolean = false) => {
    setStatus('scanning');
    setSyncLogs([]);
    setErrorMsg('');
    if (simulate) {
      addLog('Simulatiemodus gestart...');
    } else {
      addLog('Bluetooth-scan gestart...');
    }

    // Fetch paired ring settings to find target MAC address
    let targetMac: string | null = null;
    try {
      const { data, error } = await supabase
        .from('vigor_paired_devices')
        .select('settings')
        .eq('user_id', userId)
        .eq('device_type', 'ring')
        .maybeSingle();
      if (!error && data && data.settings && (data.settings as any).mac_address) {
        targetMac = (data.settings as any).mac_address;
        addLog(`Opgeslagen MAC-adres gevonden: ${targetMac}. Doelgericht verbinden gestart...`);
      }
    } catch (err) {
      console.error('Error fetching target MAC:', err);
    }

    if (window.parent !== window) {
      // In an iframe (Desktop Hub mode)
      addLog('Verzoek versturen naar Zenith Hub voor Bluetooth-synchronisatie...');
      
      const messageListener = async (event: MessageEvent) => {
        if (event.data) {
          if (event.data.type === 'colmi-sync-status-update') {
            const payload = typeof event.data.payload === 'string' ? JSON.parse(event.data.payload) : event.data.payload;
            addLog(payload.status);
            return;
          }
          
          if (event.data.type === 'colmi-sync-result') {
            window.removeEventListener('message', messageListener);
          
            if (event.data.success) {
              try {
                const result = JSON.parse(event.data.data);
                setStatus('syncing');
                addLog(`Verbonden met apparaat: ${result.device_name} (${result.mac_address || 'onbekend MAC'})`);
                addLog('Synchronisatie van historische stappen & slaap gestart...');

                // Process steps
                if (result.steps && result.steps.length > 0) {
                  const dbSteps = result.steps.map((s: any) => ({
                    user_id: userId,
                    step_count: s.step_count,
                    logged_at: new Date(s.timestamp * 1000).toISOString()
                  }));
                  const { error: stepsError } = await supabase.from('vigor_steps').insert(dbSteps);
                  if (stepsError) throw stepsError;
                  addLog(`Succes: ${result.steps.length} stappendata opgeslagen.`);
                }

                // Process sleep
                if (result.sleep && result.sleep.length > 0) {
                  const dbSleep = result.sleep.map((s: any) => ({
                    user_id: userId,
                    duration_minutes: s.duration_minutes,
                    quality_score: s.quality_score,
                    logged_at: new Date(s.timestamp * 1000).toISOString()
                  }));
                  const { error: sleepError } = await supabase.from('vigor_sleep').insert(dbSleep);
                  if (sleepError) throw sleepError;
                  addLog(`Succes: ${result.sleep.length} slaapdata opgeslagen.`);
                }

                setStatus('completed');
                addLog('Synchronisatie volledig voltooid!');
                if (onPairingSuccess) {
                  onPairingSuccess('Colmi', 'R02', result.mac_address);
                }
                onSyncComplete();
              } catch (err: any) {
                console.error('Ring sync processing error:', err);
                setStatus('error');
                setErrorMsg(err.message || 'Fout bij verwerken van ringgegevens.');
                addLog(`Fout: ${err.message || 'Verwerkingsfout'}`);
              }
            } else {
              setStatus('error');
              setErrorMsg(event.data.error || 'Geen Colmi Smart Ring gevonden in de buurt. Controleer of de ring aanstaat.');
              addLog(`Fout: ${event.data.error || 'Verbindingsfout'}`);
            }
          }
        }
      };

      window.addEventListener('message', messageListener);
      window.parent.postMessage({ type: 'request-colmi-sync', simulate, targetMac }, '*');
      setStatus('connecting');
      addLog('Zoeken naar Colmi Smart Ring in de buurt...');
      addLog('Wachten op antwoord van Zenith Hub...');
    } else {
      try {
        // Physical BLE Mode via Tauri Rust Bridge (direct if not in iframe)
        if (!(window as any).__TAURI__ && !(window as any).__TAURI_INTERNALS__) {
          throw new Error('Fysieke Bluetooth-synchronisatie is alleen beschikbaar in de desktop-app.');
        }

        const { invoke } = await import('@tauri-apps/api/core');
        addLog('Communiceren met Tauri Native BLE Bridge...');
        
        setStatus('connecting');
        addLog('Zoeken naar Colmi Smart Ring in de buurt...');
        
        const resultStr = await invoke<string>('sync_colmi_ring', { simulate, targetMac });
        const result = JSON.parse(resultStr);

        setStatus('syncing');
        addLog(`Verbonden met apparaat: ${result.device_name} (${result.mac_address || 'onbekend MAC'})`);
        addLog('Synchronisatie van historische stappen & slaap gestart...');

        // Process steps
        if (result.steps && result.steps.length > 0) {
          const dbSteps = result.steps.map((s: any) => ({
            user_id: userId,
            step_count: s.step_count,
            logged_at: new Date(s.timestamp * 1000).toISOString()
          }));
          const { error: stepsError } = await supabase.from('vigor_steps').insert(dbSteps);
          if (stepsError) throw stepsError;
          addLog(`Succes: ${result.steps.length} stappendata opgeslagen.`);
        }

        // Process sleep
        if (result.sleep && result.sleep.length > 0) {
          const dbSleep = result.sleep.map((s: any) => ({
            user_id: userId,
            duration_minutes: s.duration_minutes,
            quality_score: s.quality_score,
            logged_at: new Date(s.timestamp * 1000).toISOString()
          }));
          const { error: sleepError } = await supabase.from('vigor_sleep').insert(dbSleep);
          if (sleepError) throw sleepError;
          addLog(`Succes: ${result.sleep.length} slaapdata opgeslagen.`);
        }

        setStatus('completed');
        addLog('Synchronisatie volledig voltooid!');
        if (onPairingSuccess) {
          onPairingSuccess('Colmi', 'R02', result.mac_address);
        }
        onSyncComplete();
      } catch (err: any) {
        console.error('Ring sync error:', err);
        setStatus('error');
        setErrorMsg(err.message || 'Geen Colmi Smart Ring gevonden in de buurt. Controleer of de ring aanstaat.');
        addLog(`Fout: ${err.message || 'Geen verbinding mogelijk'}`);
      }
    }
  };

  return (
    <div className="modal-overlay" style={{ backdropFilter: 'blur(20px)', background: 'rgba(9, 9, 11, 0.85)' }}>
      <div className="modal-content animate-slide-up" style={{ maxWidth: '500px', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="modal-header">
          <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 18 }}>
            <Radio style={{ color: '#5c7cfa' }} className={status === 'scanning' || status === 'connecting' || status === 'syncing' ? 'animate-pulse' : ''} /> 
            Colmi R02 Smart Ring Portal
          </h2>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body" style={{ padding: '20px 0' }}>
          
          {/* Device Sync visual representation */}
          <div style={{ display: 'flex', justifyContent: 'center', margin: '10px 0 24px' }}>
            <div 
              style={{ 
                position: 'relative',
                width: '120px', 
                height: '120px', 
                borderRadius: '50%', 
                border: '4px solid rgba(92, 124, 250, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: status === 'syncing' || status === 'connecting' ? '0 0 30px rgba(92, 124, 250, 0.2)' : 'none',
                transition: 'all 0.5s'
              }}
            >
              {/* Outer pulsing ring */}
              {(status === 'scanning' || status === 'connecting' || status === 'syncing') && (
                <div 
                  className="searching" 
                  style={{ 
                    position: 'absolute',
                    top: '-4px', left: '-4px', right: '-4px', bottom: '-4px',
                    borderRadius: '50%',
                    border: '4px solid #5c7cfa',
                    animation: 'pulseNeon 2s infinite'
                  }}
                />
              )}

              {status === 'completed' ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#10b981' }}>
                  <Check size={40} className="animate-bounce" />
                  <span style={{ fontSize: 10, fontWeight: 800, marginTop: 4, textTransform: 'uppercase' }}>Klaar</span>
                </div>
              ) : status === 'error' ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#ef4444' }}>
                  <X size={40} />
                  <span style={{ fontSize: 10, fontWeight: 800, marginTop: 4, textTransform: 'uppercase' }}>Fout</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--text-muted)' }}>
                  <Radio size={36} style={{ color: status !== 'idle' ? '#5c7cfa' : 'var(--text-muted)' }} />
                  <span style={{ fontSize: 9, fontWeight: 700, marginTop: 4 }}>R02 RING</span>
                </div>
              )}
            </div>
          </div>

          {/* Sync logs terminal */}
          {syncLogs.length > 0 && (
            <div 
              style={{ 
                background: '#09090b', 
                border: '1px solid rgba(255,255,255,0.05)', 
                borderRadius: '8px', 
                padding: '12px',
                maxHeight: '160px',
                overflowY: 'auto',
                fontFamily: 'monospace',
                fontSize: 11,
                lineHeight: 1.5,
                color: '#a5d6a7',
                marginBottom: '20px',
                textAlign: 'left'
              }}
            >
              {syncLogs.map((log, idx) => (
                <div key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', padding: '2px 0' }}>{log}</div>
              ))}
            </div>
          )}

          {/* Information Notice */}
          {status === 'idle' && (
            <div style={{ background: 'rgba(92, 124, 250, 0.05)', border: '1px solid rgba(92, 124, 250, 0.15)', borderRadius: '10px', padding: '12px', textAlign: 'left', marginBottom: '20px' }}>
              <h4 style={{ fontSize: 12, fontWeight: 800, color: '#5c7cfa', marginBottom: 4 }}>Hoe werkt Ring synchronisatie?</h4>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                De Colmi R02 Smart Ring slaat tot 7 dagen aan activiteit, stappen en slaapgegevens lokaal op. Met de synchronisatieknop maakt de app verbinding via Bluetooth en haalt deze gegevens automatisch op.
                <br />
                <span style={{ color: '#fff', fontWeight: 600 }}>Instructie:</span> Zorg ervoor dat Bluetooth is ingeschakeld op uw computer en dat de ring dichtbij is.
              </p>
            </div>
          )}

          {status === 'error' && (
            <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: '10px', padding: '12px', color: '#ef4444', fontSize: 12, marginBottom: '20px', textAlign: 'left' }}>
              <strong>Koppeling mislukt:</strong> {errorMsg}
            </div>
          )}

          {status === 'completed' && (
            <div style={{ background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.15)', borderRadius: '10px', padding: '12px', textAlign: 'left', marginBottom: '20px' }}>
              <h4 style={{ fontSize: 12, fontWeight: 800, color: '#f59e0b', marginBottom: 4 }}>Bèta Protocol Opmerking</h4>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                De fysieke Bluetooth-koppeling en tijdsynchronisatie met uw Colmi Ring zijn succesvol uitgevoerd!
                <br /><br />
                Omdat de decryptie van het binaire sportprotocol van de ring momenteel nog in actieve ontwikkeling is in deze pilotfase, zijn de ingeladen stappen en slaapuren tijdelijk <strong>demonstratie-waarden</strong>. 
                <br /><br />
                U kunt in de tussentijd de knop <strong>+ Log Handmatig</strong> rechtsboven op het dashboard gebruiken om uw werkelijke daggegevens in te voeren.
              </p>
            </div>
          )}
        </div>

        <div className="modal-footer" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button 
            className="btn-secondary" 
            onClick={onClose} 
            disabled={status === 'scanning' || status === 'connecting' || status === 'syncing'}
            style={{ margin: 0 }}
          >
            Annuleren
          </button>
          
          {status === 'completed' ? (
            <button className="btn-primary" style={{ background: '#10b981', color: '#09090b', margin: 0 }} onClick={onClose}>
              Sluiten
            </button>
          ) : (
            <>
              <button 
                className="btn-secondary" 
                style={{ margin: 0, border: '1px solid rgba(255,255,255,0.1)' }}
                onClick={() => handleSync(true)}
                disabled={status === 'scanning' || status === 'connecting' || status === 'syncing'}
              >
                Simulatie Testen
              </button>
              <button 
                className="btn-primary" 
                style={{ 
                  background: status === 'scanning' || status === 'connecting' || status === 'syncing' ? 'rgba(92, 124, 250, 0.2)' : '#5c7cfa',
                  color: status === 'scanning' || status === 'connecting' || status === 'syncing' ? '#5c7cfa' : '#09090b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  margin: 0
                }}
                onClick={() => handleSync(false)}
                disabled={status === 'scanning' || status === 'connecting' || status === 'syncing'}
              >
                {(status === 'scanning' || status === 'connecting' || status === 'syncing') ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" /> Synchroniseren...
                  </>
                ) : (
                  'Start Synchronisatie'
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
