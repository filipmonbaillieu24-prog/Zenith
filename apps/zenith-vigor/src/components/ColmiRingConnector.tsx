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
        addLog(`Saved MAC address found: ${targetMac}. Targeted connection started...`);
      }
    } catch (err) {
      console.error('Error fetching target MAC:', err);
    }

    if (window.parent !== window) {
      // In an iframe (Desktop Hub mode)
      addLog('Sending request to Zenith Hub for Bluetooth synchronization...');
      
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
                addLog(`Connected to device: ${result.device_name} (${result.mac_address || 'onbekend MAC'})`);
                addLog('Syncing historical steps & sleep data started...');

                // Process steps: upsert per day (replace existing entries for that day)
                if (result.steps && result.steps.length > 0) {
                  let stepsSaved = 0;
                  for (const s of result.steps) {
                    // Use the `date` field from the ring if available, else derive from timestamp
                    const dateStr = s.date || new Date(s.timestamp * 1000).toISOString().split('T')[0];
                    const startOfDay = `${dateStr}T00:00:00.000Z`;
                    const endOfDay = `${dateStr}T23:59:59.999Z`;

                    // Delete existing entry for this day before inserting (upsert-by-day)
                    await supabase.from('vigor_steps')
                      .delete()
                      .eq('user_id', userId)
                      .gte('logged_at', startOfDay)
                      .lte('logged_at', endOfDay);

                    const { error: stepsError } = await supabase.from('vigor_steps').insert([{
                      user_id: userId,
                      step_count: s.step_count,
                      logged_at: startOfDay
                    }]);
                    if (stepsError) throw stepsError;
                    stepsSaved++;
                  }
                  addLog(`Success: ${stepsSaved} days of steps saved.`);
                } else {
                  addLog('No step data received from the smart ring.');
                }

                // Process sleep: upsert per day with all sleep phases
                if (result.sleep && result.sleep.length > 0) {
                  let sleepSaved = 0;
                  for (const s of result.sleep) {
                    const dateStr = s.date || new Date(s.timestamp * 1000).toISOString().split('T')[0];
                    const startOfDay = `${dateStr}T00:00:00.000Z`;
                    const endOfDay = `${dateStr}T23:59:59.999Z`;

                    // Delete existing sleep entry for this day
                    await supabase.from('vigor_sleep')
                      .delete()
                      .eq('user_id', userId)
                      .gte('logged_at', startOfDay)
                      .lte('logged_at', endOfDay);

                    const { error: sleepError } = await supabase.from('vigor_sleep').insert([{
                      user_id: userId,
                      duration_minutes: s.duration_minutes,
                      deep_minutes: s.deep_minutes,
                      light_minutes: s.light_minutes,
                      rem_minutes: s.rem_minutes,
                      awake_minutes: s.awake_minutes,
                      quality_score: s.quality_score,
                      logged_at: startOfDay
                    }]);
                    if (sleepError) throw sleepError;
                    sleepSaved++;
                    addLog(`Slaap ${dateStr}: ${s.duration_minutes}min totaal, ${s.deep_minutes}min diep, ${s.light_minutes}min licht, ${s.rem_minutes}min REM`);
                  }
                  addLog(`Success: ${sleepSaved} nights of sleep data saved.`);
                } else {
                  addLog('No sleep data received from the ring (the ring may not have recorded sleep sessions).');
                }

                setStatus('completed');
                addLog('Synchronization fully completed!');
                if (onPairingSuccess) {
                  onPairingSuccess('Colmi', 'R02', result.mac_address);
                }
                onSyncComplete();
              } catch (err: any) {
                console.error('Ring sync processing error:', err);
                setStatus('error');
                setErrorMsg(err.message || 'Error processing smart ring data.');
                addLog(`Error: ${err.message || 'Processing error'}`);
              }
            } else {
              setStatus('error');
              setErrorMsg(event.data.error || 'No Colmi Smart Ring found nearby. Check if the ring is powered on.');
              addLog(`Error: ${event.data.error || 'Connection error'}`);
            }
          }
        }
      };

      window.addEventListener('message', messageListener);
      window.parent.postMessage({ type: 'request-colmi-sync', simulate, targetMac }, '*');
      setStatus('connecting');
      addLog('Scanning for Colmi Smart Ring nearby...');
      addLog('Waiting for response from Zenith Hub...');
    } else {
      try {
        // Physical BLE Mode via Tauri Rust Bridge (direct if not in iframe)
        if (!(window as any).__TAURI__ && !(window as any).__TAURI_INTERNALS__) {
          throw new Error('Physical Bluetooth sync is only available in the desktop app.');
        }

        const { invoke } = await import('@tauri-apps/api/core');
        addLog('Communicating with Tauri Native BLE Bridge...');
        
        setStatus('connecting');
        addLog('Scanning for Colmi Smart Ring nearby...');
        
        const resultStr = await invoke<string>('sync_colmi_ring', { simulate, targetMac });
        const result = JSON.parse(resultStr);

        setStatus('syncing');
        addLog(`Connected to device: ${result.device_name} (${result.mac_address || 'onbekend MAC'})`);
        addLog('Syncing historical steps & sleep data started...');

        // Process steps (1 record per day OVERWRITE)
        if (result.steps && result.steps.length > 0) {
          for (const s of result.steps) {
            const dateStr = new Date(s.timestamp * 1000).toISOString().split('T')[0];
            const startOfDay = `${dateStr}T00:00:00.000Z`;
            const endOfDay = `${dateStr}T23:59:59.999Z`;

            await supabase.from('vigor_steps')
              .delete()
              .eq('user_id', userId)
              .gte('logged_at', startOfDay)
              .lte('logged_at', endOfDay);

            const { error: stepsError } = await supabase.from('vigor_steps').insert([{
              user_id: userId,
              step_count: s.step_count,
              logged_at: startOfDay
            }]);
            if (stepsError) throw stepsError;
          }
          addLog(`Success: ${result.steps.length} step records updated.`);
        }

        // Process sleep (1 record per day OVERWRITE)
        if (result.sleep && result.sleep.length > 0) {
          for (const s of result.sleep) {
            const dateStr = new Date(s.timestamp * 1000).toISOString().split('T')[0];
            const startOfDay = `${dateStr}T00:00:00.000Z`;
            const endOfDay = `${dateStr}T23:59:59.999Z`;

            await supabase.from('vigor_sleep')
              .delete()
              .eq('user_id', userId)
              .gte('logged_at', startOfDay)
              .lte('logged_at', endOfDay);

            const { error: sleepError } = await supabase.from('vigor_sleep').insert([{
              user_id: userId,
              duration_minutes: s.duration_minutes,
              deep_minutes: s.deep_minutes || Math.round(s.duration_minutes * 0.25),
              light_minutes: s.light_minutes || Math.round(s.duration_minutes * 0.55),
              rem_minutes: s.rem_minutes || Math.round(s.duration_minutes * 0.18),
              awake_minutes: s.awake_minutes || Math.round(s.duration_minutes * 0.02),
              quality_score: s.quality_score,
              logged_at: startOfDay
            }]);
            if (sleepError) throw sleepError;
          }
          addLog(`Success: ${result.sleep.length} sleep records updated.`);
        }

        setStatus('completed');
        addLog('Synchronization fully completed!');
        if (onPairingSuccess) {
          onPairingSuccess('Colmi', 'R02', result.mac_address);
        }
        onSyncComplete();
      } catch (err: any) {
        console.error('Ring sync error:', err);
        setStatus('error');
        setErrorMsg(err.message || 'No Colmi Smart Ring found nearby. Check if the ring is powered on.');
        addLog(`Error: ${err.message || 'Connection failed'}`);
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
                  <span style={{ fontSize: 10, fontWeight: 800, marginTop: 4, textTransform: 'uppercase' }}>Error</span>
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
                The Colmi R02 Smart Ring stores up to 7 days of activity, steps, and sleep data locally. Using the sync button maakt de app verbinding via Bluetooth en haalt deze gegevens automatisch op.
                <br />
                <span style={{ color: '#fff', fontWeight: 600 }}>Instruction:</span> Ensure Bluetooth is enabled on your computer and the ring is nearby.
              </p>
            </div>
          )}

          {status === 'error' && (
            <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: '10px', padding: '12px', color: '#ef4444', fontSize: 12, marginBottom: '20px', textAlign: 'left' }}>
              <strong>Koppeling mislukt:</strong> {errorMsg}
            </div>
          )}

          {status === 'completed' && (
            <div style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.15)', borderRadius: '10px', padding: '12px', textAlign: 'left', marginBottom: '20px' }}>
              <h4 style={{ fontSize: 12, fontWeight: 800, color: '#10b981', marginBottom: 4 }}>Synchronisatie Geslaagd!</h4>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                Your Colmi R02 ring has successfully synchronized. Steps and sleep data have been saved to your profile.
                <br /><br />
                <span style={{ color: '#cbd5e1' }}>💡 Tip:</span> Synchronize daily for maximum accuracy. The ring stores up to 7 days of data.
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
            Cancel
          </button>
          
          {status === 'completed' ? (
            <button className="btn-primary" style={{ background: '#10b981', color: '#09090b', margin: 0 }} onClick={onClose}>
              Sluiten
            </button>
          ) : (
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
          )}
        </div>
      </div>
    </div>
  );
}
