import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  Settings,
  Zap,
  Clock,
  ShieldCheck,
  Sliders,
  ArrowRight,
  Copy,
  Check,
  Globe,
  Smartphone
} from 'lucide-react';
import {
  supabaseUrl,
  supabaseAnonKey
} from '@zenith/shared';
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
  const defaultWebhookUrl = `${supabaseUrl}/rest/v1/rpc/health_connect_ingest?apikey=${supabaseAnonKey}`;

  const [services, setServices] = useState<IntegrationService[]>(() => {
    // Health Connect (via Zenith Pulse) is the one integration that's actually built:
    // Pulse authenticates with Supabase and pushes data to it directly in the
    // background — there's no local server or manual pull step on Hub's side. It's
    // re-seeded fresh on every load (rather than trusted from saved config) so an
    // out-of-date cached shape can never hide or misrepresent it.
    const defaultHealthConnect: IntegrationService = {
      id: 'health_connect',
      name: 'Google Health Connect & Zenith Pulse',
      category: 'Official Active Companion Sync',
      icon: 'https://upload.wikimedia.org/wikipedia/commons/c/ca/Google_Health_Connect_icon.svg',
      accentColor: '#38BDF8',
      connected: true,
      autoSync: true,
      description: 'Official active health & workout sync pathway for Zenith using the Zenith Pulse app. Automatically syncs steps, heart rate, HRV, sleep, calories, weight, and workouts directly to Supabase in the background.',
      features: ['Steps & Heart Rate Sync', 'HRV & Sleep Stages Ingestion', 'Biometric Weight Logging', 'Background WorkManager Sync']
    };

    const saved = localStorage.getItem('zenith_integrations_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const withoutHealthConnect = parsed.filter((s: IntegrationService) => s.id !== 'health_connect');
          return [defaultHealthConnect, ...withoutHealthConnect];
        }
      } catch (e) {
        console.error("Error loading integrations config:", e);
      }
    }
    return [
      defaultHealthConnect,
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
  const [editClientId, setEditClientId] = useState('');
  const [editClientSecret, setEditClientSecret] = useState('');
  const [copiedUrl, setCopiedUrl] = useState(false);

  useEffect(() => {
    localStorage.setItem('zenith_integrations_config', JSON.stringify(services));
  }, [services]);

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
          <p>Google Health Connect syncs automatically via the Zenith Pulse app. Everything else below is coming soon.</p>
        </div>
      </div>

      {/* Grid of Integration Cards */}
      <div className="integrations-grid">
        {services.map((service) => {
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
                      <Clock size={12} /> Sync:
                    </span>
                    <span className="witha-value">Automatic, in the background</span>
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
