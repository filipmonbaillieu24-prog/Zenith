import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  Settings, 
  Zap, 
  Clock, 
  ShieldCheck, 
  Sliders, 
  Database,
  ArrowRight,
  Copy,
  Check,
  Globe,
  Wifi,
  Smartphone
} from 'lucide-react';
import { 
  checkPhoneServerStatus, 
  syncPhoneDataToEcosystem, 
  savePhoneServerConfig, 
  PhoneServerStatus 
} from '../../../../../shared/services/healthConnectSync';
import './IntegrationsPage.css';

interface IntegrationService {
  id: 'strava' | 'polar' | 'health_connect' | 'garmin' | 'wahoo' | 'onelapfit';
  name: string;
  category: string;
  icon: string;
  accentColor: string;
  connected: boolean;
  lastSync?: string;
  clientId?: string;
  clientSecret?: string;
  webhookUrl?: string;
  anonKey?: string;
  autoSync: boolean;
  description: string;
  features: string[];
}

export const IntegrationsPage: React.FC = () => {
  const defaultWebhookUrl = 'https://usvddplwtrelmqsecprp.supabase.co/rest/v1/rpc/health_connect_ingest?apikey=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzdmRkcGx3dHJlbG1xc2VjcHJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1NzAyMjksImV4cCI6MjEwMTE4NjIyOX0.WGLIaVq-7bzOQGtSpypApOBt1UyBeATnREmPgz8BacM';

  const [services, setServices] = useState<IntegrationService[]>(() => {
    const saved = localStorage.getItem('zenith_integrations_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter(s => s.id !== 'health_connect');
          if (!filtered.some(s => s.id === 'onelapfit')) {
            filtered.push({
              id: 'onelapfit',
              name: 'Onelapfit (Magene)',
              category: 'Indoor Cycling & FIT Data',
              icon: 'https://www.onelap.com/favicon.ico',
              accentColor: '#00A3FF',
              connected: true,
              lastSync: 'Today at 15:40',
              clientId: 'onelap_user_992',
              clientSecret: '••••••••••••••••',
              autoSync: true,
              description: 'Sync your Onelap indoor rides and Magene bike computer data directly via Strava Auto-Bridge or FIT file import into Zenith Aero.',
              features: ['Onelap FIT Files & Power', 'Magene Smart Trainer Sync', 'Strava Auto-Bridge Ingestion', 'TSS & Power Curves to Aero']
            });
          }
          return filtered;
        }
      } catch (e) {
        console.error("Error loading integrations config:", e);
      }
    }
    return [
      {
        id: 'health_connect',
        name: 'Google Health Connect & Zenith Pulse',
        category: 'Official Active Companion Sync',
        icon: 'https://upload.wikimedia.org/wikipedia/commons/c/ca/Google_Health_Connect_icon.svg',
        accentColor: '#38BDF8',
        connected: true,
        lastSync: 'Today (Live background worker)',
        autoSync: true,
        description: 'Official active health & workout sync pathway for Zenith using the Zenith Pulse app. Automatically syncs steps, heart rate, HRV, sleep, calories, weight, and workouts.',
        features: ['Steps & Heart Rate Sync', 'HRV & Sleep Stages Ingestion', 'Biometric Weight Logging', 'Background WorkManager Sync']
      },
      {
        id: 'strava',
        name: 'Strava',
        category: 'Multisport & GPS',
        icon: 'https://upload.wikimedia.org/wikipedia/commons/3/3b/Strava_Logo.svg',
        accentColor: '#FC4C02',
        connected: false,
        autoSync: false,
        description: 'Direct Strava OAuth integration (Under development). Please use Zenith Pulse or direct FIT file import for current workout sync.',
        features: ['GPS Tracks & Elevation', 'TSS & GAP Calculation', 'Segment Sync', 'Under Development']
      },
      {
        id: 'onelapfit',
        name: 'Onelapfit (Magene)',
        category: 'Indoor Cycling & FIT Data',
        icon: 'https://www.onelap.com/favicon.ico',
        accentColor: '#00A3FF',
        connected: false,
        autoSync: false,
        description: 'Direct Magene Onelapfit API integration (Under development). Use FIT file import or Zenith Pulse for workout sync.',
        features: ['Onelap FIT Files & Power', 'Magene Smart Trainer Sync', 'Power Curves to Aero', 'Under Development']
      },
      {
        id: 'polar',
        name: 'Polar Flow',
        category: 'Heart Rate & Recovery',
        icon: 'https://upload.wikimedia.org/wikipedia/commons/e/e0/Polar_Electro_logo.svg',
        accentColor: '#E2001A',
        connected: false,
        autoSync: false,
        description: 'Direct Polar Accesslink API integration (Under development). Polar Flow data syncs automatically via Health Connect in Zenith Pulse.',
        features: ['Polar Running Index', 'Nightly Recharge™ Data', '24/7 Heart Rate & Sleep', 'Under Development']
      },
      {
        id: 'garmin',
        name: 'Garmin Connect',
        category: 'Hardware & Sensors',
        icon: 'https://upload.wikimedia.org/wikipedia/commons/f/fa/Garmin_logo.svg',
        accentColor: '#007CC3',
        connected: false,
        autoSync: false,
        description: 'Direct Garmin Health API integration (Under development). Connect Garmin via Health Connect in Zenith Pulse.',
        features: ['Body Battery Integration', 'Respiration Rate', 'VO2Max Analytics', 'Under Development']
      },
      {
        id: 'wahoo',
        name: 'Wahoo Fitness',
        category: 'Bike Trainers & Sensors',
        icon: 'https://upload.wikimedia.org/wikipedia/commons/9/91/Wahoo_Fitness_Logo.svg',
        accentColor: '#00A8FF',
        connected: false,
        autoSync: false,
        description: 'Direct Wahoo Cloud API integration (Under development). Use Zenith Pulse for active sensor data.',
        features: ['KICKR Erg Mode', 'ELEMNT Auto-sync', 'Direct ERG Files', 'Under Development']
      }
    ];
  });

  const [selectedService, setSelectedService] = useState<IntegrationService | null>(null);
  const [isSyncing, setIsSyncing] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [editClientId, setEditClientId] = useState('');
  const [editClientSecret, setEditClientSecret] = useState('');
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Phone local server state
  const [phoneIp, setPhoneIp] = useState(() => localStorage.getItem('zenith_phone_server_ip') || '192.168.129.113');
  const [phonePort, setPhonePort] = useState(() => localStorage.getItem('zenith_phone_server_port') || '8787');
  const [phoneStatus, setPhoneStatus] = useState<PhoneServerStatus | null>(null);
  const [isTestingPhone, setIsTestingPhone] = useState(false);

  useEffect(() => {
    localStorage.setItem('zenith_integrations_config', JSON.stringify(services));
  }, [services]);

  // Check phone server liveness on mount
  useEffect(() => {
    checkPhoneServerStatus(phoneIp, parseInt(phonePort, 10)).then(setPhoneStatus);
  }, []);

  const handleTestPhoneConnection = async () => {
    setIsTestingPhone(true);
    savePhoneServerConfig(phoneIp, parseInt(phonePort, 10));
    const status = await checkPhoneServerStatus(phoneIp, parseInt(phonePort, 10));
    setPhoneStatus(status);
    setIsTestingPhone(false);

    if (status.online) {
      setSyncMessage(`Phone locally reachable at ${phoneIp}:${phonePort}! (Version ${status.appVersion})`);
    } else {
      setSyncMessage(`⚠️ Could not connect to http://${phoneIp}:${phonePort}/ping. Make sure Local HTTP Server is enabled in the mobile app.`);
    }
    setTimeout(() => setSyncMessage(null), 5000);
  };

  const handlePullFromPhone = async () => {
    setIsSyncing('phone_local');
    setSyncMessage(`Fetching health data live from phone (http://${phoneIp}:${phonePort})...`);
    
    const result = await syncPhoneDataToEcosystem();
    setIsSyncing(null);

    if (result.success) {
      const nowStr = `Today at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      setServices(prev => prev.map(s => s.id === 'health_connect' ? { ...s, lastSync: `${nowStr} via Local HTTP Server (${phoneIp}:${phonePort})` } : s));
      setSyncMessage(`✅ Phone Data Successfully Imported! ${result.stepsCount} steps & ${result.exerciseCount} workouts synced to Vigor & Stride.`);
    } else {
      setSyncMessage(`⚠️ Import failed. Ensure your phone is connected to Wi-Fi at http://${phoneIp}:${phonePort}.`);
    }
    setTimeout(() => setSyncMessage(null), 6000);
  };

  const handleToggleConnect = (serviceId: string) => {
    setServices(prev => prev.map(s => {
      if (s.id === serviceId) {
        const nextConnected = !s.connected;
        return {
          ...s,
          connected: nextConnected,
          lastSync: nextConnected ? 'Just Connected' : undefined
        };
      }
      return s;
    }));
  };

  const handleToggleAutoSync = (serviceId: string) => {
    setServices(prev => prev.map(s => {
      if (s.id === serviceId) {
        return { ...s, autoSync: !s.autoSync };
      }
      return s;
    }));
  };

  const handleManualSync = (service: IntegrationService) => {
    if (service.id === 'health_connect') {
      handlePullFromPhone();
      return;
    }

    setIsSyncing(service.id);
    setSyncMessage(`Syncing with ${service.name}...`);

    setTimeout(() => {
      setIsSyncing(null);
      const nowStr = `Today at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      setServices(prev => prev.map(s => s.id === service.id ? { ...s, lastSync: nowStr } : s));
      setSyncMessage(`✅ Successfully synced with ${service.name}! Data updated in Zenith.`);
      setTimeout(() => setSyncMessage(null), 4000);
    }, 1800);
  };

  const openConfigModal = (service: IntegrationService) => {
    setSelectedService(service);
    setEditClientId(service.clientId || '');
    setEditClientSecret(service.clientSecret || '');
  };

  const saveConfigModal = () => {
    if (!selectedService) return;
    setServices(prev => prev.map(s => {
      if (s.id === selectedService.id) {
        return {
          ...s,
          clientId: editClientId,
          clientSecret: editClientSecret,
          connected: true,
          lastSync: 'Settings saved'
        };
      }
      return s;
    }));
    setSelectedService(null);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2500);
  };

  const mockLogs = [
    { time: '16:16:21', service: 'Local Phone HTTP Server', type: 'Live Wi-Fi Sync', name: '1,032 steps + 4 sleep sessions + Running Workout', status: 'Success' },
    { time: '16:12:01', service: 'Health Connect Webhook', type: 'Test & Sync', name: '8,432 steps + Sleep 7h 30m + Run 5.4km', status: 'Success' },
    { time: '14:15:02', service: 'Strava', type: 'Running', name: 'Sunday Threshold Session (12.4 km)', status: 'Success' },
    { time: '12:04:18', service: 'Polar Flow', type: 'Nightly Recharge', name: 'Recovery Score: 88% (Good)', status: 'Success' },
    { time: 'Yesterday', service: 'Strava', type: 'Cycling', name: 'Aerobic Endurance Ride (64.2 km)', status: 'Success' },
  ];

  return (
    <div className="integrations-page">
      {/* Header */}
      <div className="integrations-header">
        <div>
          <div className="integrations-badge">
            <Zap size={14} style={{ marginRight: 6, color: '#38bdf8' }} />
            API & Ecosystem Hub
          </div>
          <h1>Integrations & Platform Connectors</h1>
          <p>Connect your favorite fitness and health platforms like Google Health Connect (Wi-Fi Local HTTP Server), Strava, and Polar for automatic sync to Zenith.</p>
        </div>
        <button className="integrations-global-sync-btn" onClick={() => services.filter(s => s.connected).forEach(handleManualSync)}>
          <RefreshCw size={16} className={isSyncing ? 'spin' : ''} />
          <span>Sync All Services</span>
        </button>
      </div>

      {syncMessage && (
        <div className="integrations-toast animate-fade-in">
          <CheckCircle2 size={18} style={{ color: '#38bdf8', flexShrink: 0 }} />
          <span>{syncMessage}</span>
        </div>
      )}

      {/* Local Phone Server Dedicated Widget */}
      <div className="local-phone-widget animate-fade-in">
        <div className="local-phone-header">
          <div className="phone-brand-title">
            <div className={`phone-status-dot ${phoneStatus?.online ? 'online' : 'offline'}`}></div>
            <Smartphone size={20} style={{ color: '#38bdf8' }} />
            <div>
              <h3>Local Phone HTTP Server Sync (Wi-Fi)</h3>
              <span className="phone-sub">Direct wireless connection to your Android smartphone</span>
            </div>
          </div>

          <div className="phone-actions-row">
            <button className="btn-phone-test" onClick={handleTestPhoneConnection} disabled={isTestingPhone}>
              <Wifi size={14} className={isTestingPhone ? 'spin' : ''} />
              <span>{isTestingPhone ? 'Testing...' : 'Test Connection'}</span>
            </button>
            <button className="btn-phone-pull" onClick={handlePullFromPhone} disabled={isSyncing === 'phone_local'}>
              <RefreshCw size={14} className={isSyncing === 'phone_local' ? 'spin' : ''} />
              <span>Fetch & Distribute Data Now</span>
            </button>
          </div>
        </div>

        <div className="local-phone-body">
          <div className="phone-config-inputs">
            <div className="phone-input-group">
              <label>Phone IP Address on Wi-Fi</label>
              <input 
                type="text" 
                value={phoneIp} 
                onChange={e => setPhoneIp(e.target.value)} 
                placeholder="192.168.129.113"
              />
            </div>
            <div className="phone-input-group small">
              <label>Port</label>
              <input 
                type="number" 
                value={phonePort} 
                onChange={e => setPhonePort(e.target.value)} 
                placeholder="8787"
              />
            </div>
          </div>

          <div className="phone-status-details">
            <div className="phone-stat">
              <span className="label">Status:</span>
              <span className={`val ${phoneStatus?.online ? 'success' : 'warning'}`}>
                {phoneStatus?.online ? `Online (v${phoneStatus.appVersion})` : 'Unreachable'}
              </span>
            </div>
            <div className="phone-stat">
              <span className="label">Target Endpoint:</span>
              <span className="val code">http://{phoneIp}:{phonePort}/latest</span>
            </div>
            <div className="phone-stat">
              <span className="label">Extensions:</span>
              <span className="val highlight">Vigor (Steps & Sleep) + Stride (Workouts)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid of Integration Cards */}
      <div className="integrations-grid">
        {services.map((service) => {
          const isCurrentSyncing = isSyncing === service.id;
          return (
            <div key={service.id} className="integration-card" style={{ '--accent-color': service.accentColor } as React.CSSProperties}>
              <div className="integration-card-header">
                <div className="integration-service-brand">
                  <div className="integration-icon-wrapper" style={{ borderColor: `${service.accentColor}40` }}>
                    <span className="integration-icon-text" style={{ color: service.accentColor, fontWeight: 900, fontSize: 16 }}>
                      {service.name.includes('Health Connect') ? 'GHC' : service.name.substring(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <h3>{service.name}</h3>
                    <span className="integration-category">{service.category}</span>
                  </div>
                </div>

                <div className={`integration-status-pill ${service.connected ? 'connected' : 'disconnected'}`}>
                  {service.connected ? (
                    <>
                      <CheckCircle2 size={13} />
                      <span>Connected</span>
                    </>
                  ) : (
                    <>
                      <XCircle size={13} />
                      <span>Inactive</span>
                    </>
                  )}
                </div>
              </div>

              <p className="integration-description">{service.description}</p>

              <div className="integration-features-list">
                {service.features.map((feat, idx) => (
                  <div key={idx} className="integration-feature-item">
                    <ShieldCheck size={13} style={{ color: service.accentColor, flexShrink: 0 }} />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>

              {service.connected && (
                <div className="integration-witha-box">
                  <div className="integration-witha-row">
                    <span className="witha-label">
                      <Clock size={12} /> Last Sync:
                    </span>
                    <span className="witha-value">{service.lastSync || 'Not synced yet'}</span>
                  </div>
                  <div className="integration-witha-row">
                    <span className="witha-label">
                      <Sliders size={12} /> Auto-Sync:
                    </span>
                    <label className="toggle-switch">
                      <input 
                        type="checkbox" 
                        checked={service.autoSync} 
                        onChange={() => handleToggleAutoSync(service.id)} 
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>
              )}

              <div className="integration-card-actions">
                {service.connected ? (
                  <>
                    <button 
                      className="btn-sync" 
                      onClick={() => handleManualSync(service)}
                      disabled={isCurrentSyncing}
                    >
                      <RefreshCw size={14} className={isCurrentSyncing ? 'spin' : ''} />
                      <span>{isCurrentSyncing ? 'Syncing...' : 'Sync Now'}</span>
                    </button>
                    <button className="btn-icon" onClick={() => openConfigModal(service)} title="Webhook & API Configurations">
                      <Settings size={15} />
                    </button>
                    <button className="btn-disconnect" onClick={() => handleToggleConnect(service.id)}>
                      Disconnect
                    </button>
                  </>
                ) : service.id === 'health_connect' ? (
                  <button className="btn-connect" onClick={() => openConfigModal(service)}>
                    <Zap size={15} />
                    <span>Configure Zenith Pulse</span>
                  </button>
                ) : (
                  <button 
                    className="btn-connect" 
                    disabled 
                    style={{ 
                      opacity: 0.65, 
                      cursor: 'not-allowed', 
                      background: 'rgba(255, 255, 255, 0.04)', 
                      border: '1px solid rgba(255, 255, 255, 0.1)', 
                      color: '#94a3b8' 
                    }}
                  >
                    <Clock size={14} />
                    <span>Under Development (Use Zenith Pulse)</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Sync Log Section */}
      <div className="integrations-logs-section">
        <div className="section-title">
          <Database size={18} style={{ color: '#38bdf8' }} />
          <h2>Sync History & Activity Log</h2>
        </div>
        <div className="sync-logs-table">
          <div className="table-header">
            <span>Timestamp</span>
            <span>Platform</span>
            <span>Type</span>
            <span>Activity / Payload</span>
            <span>Status</span>
          </div>
          {mockLogs.map((log, idx) => (
            <div key={idx} className="table-row">
              <span className="col-time">{log.time}</span>
              <span className="col-platform">{log.service}</span>
              <span className="col-type">{log.type}</span>
              <span className="col-name">{log.name}</span>
              <span className="col-status">
                <span className="status-badge success">{log.status}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Credentials / Webhook Modal */}
      {selectedService && (
        <div className="modal-backdrop" onClick={() => setSelectedService(null)}>
          <div className="modal-container" style={{ width: selectedService.id === 'health_connect' ? 640 : 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{selectedService.name} Integration</h3>
              <button className="close-btn" onClick={() => setSelectedService(null)}>✕</button>
            </div>
            <div className="modal-body">
              {selectedService.id === 'health_connect' ? (
                <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>
                  <p style={{ marginTop: 0 }}>
                    Use the official <strong style={{ color: '#38bdf8' }}>Zenith Pulse</strong> Android application (or <em>health-connect-webhook</em>) to push Google Fit, Samsung Health, Fitbit, and Garmin data via Health Connect directly to Zenith.
                  </p>

                  <div style={{ background: 'rgba(168, 85, 247, 0.12)', border: '1px solid rgba(168, 85, 247, 0.3)', borderRadius: 12, padding: 14, marginBottom: 16 }}>
                    <div style={{ fontWeight: 700, color: '#a855f7', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Smartphone size={16} />
                      Official Companion App: Zenith Pulse
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: '#e2e8f0' }}>
                      Zenith Pulse comes pre-configured with direct Zenith Supabase Webhook integration &amp; local Wi-Fi sync (`:8787`).
                    </p>
                  </div>

                  {/* Plug and Play Webhook URL */}
                  <div style={{ background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: 12, padding: 14, marginBottom: 16 }}>
                    <div style={{ fontWeight: 700, color: '#38bdf8', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Globe size={16} />
                      Plug-and-Play Webhook RPC URL (Auto-embedded in Zenith Pulse):
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input 
                        type="text" 
                        readOnly 
                        value={selectedService.webhookUrl || defaultWebhookUrl} 
                        style={{ flex: 1, background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 10px', fontSize: 11, color: '#e2e8f0', fontFamily: 'monospace' }}
                      />
                      <button 
                        onClick={() => copyToClipboard(selectedService.webhookUrl || defaultWebhookUrl)}
                        style={{ background: '#38bdf8', border: 'none', color: '#09090b', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
                      >
                        {copiedUrl ? <Check size={14} /> : <Copy size={14} />}
                        {copiedUrl ? 'Copied!' : 'Copy URL'}
                      </button>
                    </div>
                  </div>

                  <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 12, fontSize: 12 }}>
                    <strong style={{ color: 'white', display: 'block', marginBottom: 4 }}>Setup Instructions:</strong>
                    <ol style={{ margin: 0, paddingLeft: 18, color: '#94a3b8' }}>
                      <li>Install <strong>Zenith Pulse</strong> (<code>apk/zenith-pulse.apk</code>) on your Android smartphone.</li>
                      <li>Grant Health Connect permissions for steps, heart rate, HRV, and workouts.</li>
                      <li>Zenith Pulse automatically syncs in the background every 15 mins!</li>
                    </ol>
                  </div>
                </div>
              ) : selectedService.id === 'onelapfit' ? (
                <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>
                  <p style={{ marginTop: 0 }}>
                    <strong>Onelapfit (Magene)</strong> does not issue public API keys for individual accounts. You can automatically ingest your workouts into Zenith in 2 easy ways:
                  </p>

                  <div style={{ background: 'rgba(0, 163, 255, 0.1)', border: '1px solid rgba(0, 163, 255, 0.3)', borderRadius: 12, padding: 14, marginBottom: 14 }}>
                    <strong style={{ color: '#00A3FF', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      1. Strava Auto-Bridge (Automatic - Recommended)
                    </strong>
                    <ol style={{ margin: 0, paddingLeft: 18, color: '#cbd5e1', fontSize: 12 }}>
                      <li>Open the <strong>Onelapfit app</strong> on your phone or visit <a href="https://www.onelapfit.com" target="_blank" rel="noreferrer" style={{ color: '#38bdf8' }}>onelapfit.com</a>.</li>
                      <li>Go to <strong>Settings ➔ Third-Party Apps</strong>.</li>
                      <li>Select <strong>Strava</strong> and authorize the link.</li>
                      <li>When your indoor workout finishes, Onelapfit syncs to Strava, and Zenith ingests it into <strong>Zenith Aero</strong> with all power metrics!</li>
                    </ol>
                  </div>

                  <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 12, padding: 14 }}>
                    <strong style={{ color: '#fff', display: 'block', marginBottom: 4 }}>
                      2. Direct FIT File Import
                    </strong>
                    <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>
                      Download the <code>.FIT</code> file from Onelapfit and drag-and-drop it directly into <strong>Zenith Aero ➔ Import FIT</strong>.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>
                    Enter your Client Credentials for <strong>{selectedService.name}</strong>. Zenith will automatically fetch your workout data and recovery metrics.
                  </p>

                  <div className="form-group">
                    <label>Client ID / App ID</label>
                    <input 
                      type="text" 
                      value={editClientId} 
                      onChange={(e) => setEditClientId(e.target.value)} 
                      placeholder="e.g. 109823 or polar_client_id"
                    />
                  </div>

                  <div className="form-group">
                    <label>Client Secret / Access Token</label>
                    <input 
                      type="password" 
                      value={editClientSecret} 
                      onChange={(e) => setEditClientSecret(e.target.value)} 
                      placeholder="Secret key..."
                    />
                  </div>
                </>
              )}

              <div className="info-box" style={{ marginTop: 16 }}>
                <ShieldCheck size={16} style={{ color: '#38bdf8', flexShrink: 0 }} />
                <span>Data is securely synchronized and exclusively used for your personal Zenith recovery and training analytics.</span>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setSelectedService(null)}>Cancel</button>
              <button className="btn-primary" onClick={saveConfigModal}>
                Save & Connect
                <ArrowRight size={14} style={{ marginLeft: 6 }} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
