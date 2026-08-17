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
              lastSync: 'Vandaag om 15:40',
              clientId: 'onelap_user_992',
              clientSecret: '••••••••••••••••',
              autoSync: true,
              description: 'Synchroniseer je Onelap indoor ritten en Magene fietstecomputer data direct via Strava Auto-Bridge of FIT-bestand import naar Zenith Aero.',
              features: ['Onelap FIT-Bestanden & Vermogen', 'Magene Smart Trainer Sync', 'Strava Auto-Bridge Ingestie', 'TSS & Vermogenscurves naar Aero']
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
        id: 'strava',
        name: 'Strava',
        category: 'Multisport & GPS',
        icon: 'https://upload.wikimedia.org/wikipedia/commons/3/3b/Strava_Logo.svg',
        accentColor: '#FC4C02',
        connected: true,
        lastSync: 'Vandaag om 14:15',
        clientId: '109823',
        clientSecret: '••••••••••••••••',
        autoSync: true,
        description: 'Automatische synchronisatie van hardloop- en wielrensessies, inclusief GPS tracks, segmenten en vermogen.',
        features: ['GPS Tracks & Elevation', 'TSS & GAP Berekening', 'Segment Synchronisatie', 'Automatische Import naar Aero & Stride']
      },
      {
        id: 'onelapfit',
        name: 'Onelapfit (Magene)',
        category: 'Indoor Cycling & FIT Data',
        icon: 'https://www.onelap.com/favicon.ico',
        accentColor: '#00A3FF',
        connected: true,
        lastSync: 'Vandaag om 15:40',
        clientId: 'onelap_user_992',
        clientSecret: '••••••••••••••••',
        autoSync: true,
        description: 'Synchroniseer je Onelap indoor ritten en Magene fietstecomputer data direct via Strava Auto-Bridge of FIT-bestand import naar Zenith Aero.',
        features: ['Onelap FIT-Bestanden & Vermogen', 'Magene Smart Trainer Sync', 'Strava Auto-Bridge Ingestie', 'TSS & Vermogenscurves naar Aero']
      },
      {
        id: 'polar',
        name: 'Polar Flow',
        category: 'Hartslag & Herstel',
        icon: 'https://upload.wikimedia.org/wikipedia/commons/e/e0/Polar_Electro_logo.svg',
        accentColor: '#E2001A',
        connected: true,
        lastSync: 'Gisteren om 22:30',
        clientId: 'polar_app_88412',
        clientSecret: '••••••••••••••••',
        autoSync: true,
        description: 'Haal trainingen, Nightly Recharge™ herstelscores, slaapanalyse en continue hartslaggegevens op uit Polar Accesslink API.',
        features: ['Polar Running Index', 'Nightly Recharge™ Data', '24/7 Hartslag & Slaap', 'Directe GPX / TCX Import']
      },
      {
        id: 'garmin',
        name: 'Garmin Connect',
        category: 'Hardware & Sensoren',
        icon: 'https://upload.wikimedia.org/wikipedia/commons/f/fa/Garmin_logo.svg',
        accentColor: '#007CC3',
        connected: false,
        autoSync: false,
        description: 'Koppel je Garmin Edge of Forerunner sporthorloge voor directe sync via Garmin Health API.',
        features: ['Body Battery Integration', 'Respiratiesnelheid', 'Vo2Max Analytics', 'Binnenkort beschikbaar']
      },
      {
        id: 'wahoo',
        name: 'Wahoo Fitness',
        category: 'Fietstrainers & Sensoren',
        icon: 'https://upload.wikimedia.org/wikipedia/commons/9/91/Wahoo_Fitness_Logo.svg',
        accentColor: '#00A8FF',
        connected: false,
        autoSync: false,
        description: 'Synchroniseer je Wahoo ELEMNT fietstecomputers en Kickr smart trainers direct met Zenith.',
        features: ['KICKR Erg Modus', 'ELEMNT Auto-sync', 'Directe ERG bestanden', 'Binnenkort beschikbaar']
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
      setSyncMessage(` Telefoon lokaal bereikbaar op ${phoneIp}:${phonePort}! (Versie ${status.appVersion})`);
    } else {
      setSyncMessage(`⚠️ Kon geen verbinding maken met http://${phoneIp}:${phonePort}/ping. Zorg dat Local HTTP Server aan staat in de telefoon-app.`);
    }
    setTimeout(() => setSyncMessage(null), 5000);
  };

  const handlePullFromPhone = async () => {
    setIsSyncing('phone_local');
    setSyncMessage(`Gezondheidsdata live ophalen van telefoon (http://${phoneIp}:${phonePort})...`);
    
    const result = await syncPhoneDataToEcosystem();
    setIsSyncing(null);

    if (result.success) {
      const nowStr = `Vandaag om ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      setServices(prev => prev.map(s => s.id === 'health_connect' ? { ...s, lastSync: `${nowStr} via Local HTTP Server (${phoneIp}:${phonePort})` } : s));
      setSyncMessage(`✅ Telefoondata Succesvol Geïmporteerd! ${result.stepsCount} stappen & ${result.exerciseCount} workouts overgezet naar Vigor & Stride.`);
    } else {
      setSyncMessage(`⚠️ Importeren mislukt. Controleer of de telefoon verbonden is met Wi-Fi op http://${phoneIp}:${phonePort}.`);
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
          lastSync: nextConnected ? 'Zojuist gekoppeld' : undefined
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
    setSyncMessage(`Synchroniseren met ${service.name}...`);

    setTimeout(() => {
      setIsSyncing(null);
      const nowStr = `Vandaag om ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      setServices(prev => prev.map(s => s.id === service.id ? { ...s, lastSync: nowStr } : s));
      setSyncMessage(`✅ Succesvol gesynchroniseerd met ${service.name}! Gegevens bijgewerkt in Zenith.`);
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
          lastSync: 'Instellingen opgeslagen'
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
    { time: '16:16:21', service: 'Local Phone HTTP Server', type: 'Live Wi-Fi Sync', name: '1.032 stappen + 4 slaapsessies + Running Workout', status: 'Succes' },
    { time: '16:12:01', service: 'Health Connect Webhook', type: 'Test & Sync', name: '8.432 stappen + Slaap 7u 30m + Hardlopen 5,4km', status: 'Succes' },
    { time: '14:15:02', service: 'Strava', type: 'Hardlopen', name: 'Zondagse Drempeltraining (12.4 km)', status: 'Succes' },
    { time: '12:04:18', service: 'Polar Flow', type: 'Nightly Recharge', name: 'Herstel Score: 88% (Goed)', status: 'Succes' },
    { time: 'Gisteren', service: 'Strava', type: 'Wielrennen', name: 'Aerobe Duurrit (64.2 km)', status: 'Succes' },
  ];

  return (
    <div className="integrations-page">
      {/* Header */}
      <div className="integrations-header">
        <div>
          <div className="integrations-badge">
            <Zap size={14} style={{ marginRight: 6, color: '#3b82f6' }} />
            API & Ecosystem Hub
          </div>
          <h1>Integraties & Platform Connectoren</h1>
          <p>Koppel je favoriete sport- en gezondheidsplatformen zoals Google Health Connect (Wi-Fi Local HTTP Server), Strava en Polar voor automatische synchronisatie naar Zenith.</p>
        </div>
        <button className="integrations-global-sync-btn" onClick={() => services.filter(s => s.connected).forEach(handleManualSync)}>
          <RefreshCw size={16} className={isSyncing ? 'spin' : ''} />
          <span>Alles Synchroniseren</span>
        </button>
      </div>

      {syncMessage && (
        <div className="integrations-toast animate-fade-in">
          <CheckCircle2 size={18} style={{ color: '#10b981', flexShrink: 0 }} />
          <span>{syncMessage}</span>
        </div>
      )}

      {/* Local Phone Server Dedicated Widget */}
      <div className="local-phone-widget animate-fade-in">
        <div className="local-phone-header">
          <div className="phone-brand-title">
            <div className={`phone-status-dot ${phoneStatus?.online ? 'online' : 'offline'}`}></div>
            <Smartphone size={20} style={{ color: '#34A853' }} />
            <div>
              <h3>Lokale Telefoon HTTP Server Sync (Wi-Fi)</h3>
              <span className="phone-sub">Directe draadloze verbinding met je Android smartphone</span>
            </div>
          </div>

          <div className="phone-actions-row">
            <button className="btn-phone-test" onClick={handleTestPhoneConnection} disabled={isTestingPhone}>
              <Wifi size={14} className={isTestingPhone ? 'spin' : ''} />
              <span>{isTestingPhone ? 'Testen...' : 'Verbinding Testen'}</span>
            </button>
            <button className="btn-phone-pull" onClick={handlePullFromPhone} disabled={isSyncing === 'phone_local'}>
              <RefreshCw size={14} className={isSyncing === 'phone_local' ? 'spin' : ''} />
              <span>Nu Data Ophalen & Verdelen</span>
            </button>
          </div>
        </div>

        <div className="local-phone-body">
          <div className="phone-config-inputs">
            <div className="phone-input-group">
              <label>Telefoon IP-Adres op Wi-Fi</label>
              <input 
                type="text" 
                value={phoneIp} 
                onChange={e => setPhoneIp(e.target.value)} 
                placeholder="192.168.129.113"
              />
            </div>
            <div className="phone-input-group small">
              <label>Poort</label>
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
                {phoneStatus?.online ? `Online (v${phoneStatus.appVersion})` : 'Niet bereikbaar'}
              </span>
            </div>
            <div className="phone-stat">
              <span className="label">Target Endpoint:</span>
              <span className="val code">http://{phoneIp}:{phonePort}/latest</span>
            </div>
            <div className="phone-stat">
              <span className="label">Extensies:</span>
              <span className="val highlight">Vigor (Stappen & Slaap) + Stride (Workouts)</span>
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
                      <span>Gekoppeld</span>
                    </>
                  ) : (
                    <>
                      <XCircle size={13} />
                      <span>Niet Actief</span>
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
                <div className="integration-meta-box">
                  <div className="integration-meta-row">
                    <span className="meta-label">
                      <Clock size={12} /> Laatste Sync:
                    </span>
                    <span className="meta-value">{service.lastSync || 'Nog niet gesynchroniseerd'}</span>
                  </div>
                  <div className="integration-meta-row">
                    <span className="meta-label">
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
                      <span>{isCurrentSyncing ? 'Syncing...' : 'Nu Synchroniseren'}</span>
                    </button>
                    <button className="btn-icon" onClick={() => openConfigModal(service)} title="Webhook & API Configuraties">
                      <Settings size={15} />
                    </button>
                    <button className="btn-disconnect" onClick={() => handleToggleConnect(service.id)}>
                      Ontkoppelen
                    </button>
                  </>
                ) : (
                  <button className="btn-connect" onClick={() => openConfigModal(service)}>
                    <Zap size={15} />
                    <span>Koppelen via Webhook / API</span>
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
          <Database size={18} style={{ color: '#3b82f6' }} />
          <h2>Synchronisatie Historie & Activiteiten Log</h2>
        </div>
        <div className="sync-logs-table">
          <div className="table-header">
            <span>Tijdstip</span>
            <span>Platform</span>
            <span>Type</span>
            <span>Activiteit / Gegevens</span>
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
              <h3>{selectedService.name} Integratie</h3>
              <button className="close-btn" onClick={() => setSelectedService(null)}>✕</button>
            </div>
            <div className="modal-body">
              {selectedService.id === 'health_connect' ? (
                <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>
                  <p style={{ marginTop: 0 }}>
                    Gebruik de open-source Android app <strong style={{ color: '#34A853' }}>mcnaveen/health-connect-webhook</strong> om Google Fit, Samsung Health, Fitbit en Garmin data via Health Connect rechtstreeks naar Zenith te pushen.
                  </p>

                  {/* Plug and Play Webhook URL */}
                  <div style={{ background: 'rgba(52, 168, 83, 0.12)', border: '1px solid rgba(52, 168, 83, 0.3)', borderRadius: 12, padding: 14, marginBottom: 16 }}>
                    <div style={{ fontWeight: 700, color: '#34A853', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Globe size={16} />
                      Plug-and-Play Webhook RPC URL (Kopieer naar Android App):
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
                        style={{ background: '#34A853', border: 'none', color: 'white', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
                      >
                        {copiedUrl ? <Check size={14} /> : <Copy size={14} />}
                        {copiedUrl ? 'Gekopieerd!' : 'URL Kopiëren'}
                      </button>
                    </div>
                  </div>

                  <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 12, fontSize: 12 }}>
                    <strong style={{ color: 'white', display: 'block', marginBottom: 4 }}>Hoe in te stellen:</strong>
                    <ol style={{ margin: 0, paddingLeft: 18, color: '#94a3b8' }}>
                      <li>Open <a href="https://github.com/mcnaveen/health-connect-webhook" target="_blank" rel="noreferrer" style={{ color: '#38bdf8' }}>health-connect-webhook</a> op je Android smartphone.</li>
                      <li>Plak de gekopieerde RPC URL in het <strong>URL / Endpoint</strong> veld van de app.</li>
                      <li>Druk op **Test** of **Sync**. De Android app ontvangt direct <code>{"{\"success\": true}"}</code> en <code>HTTP 200 OK</code>!</li>
                    </ol>
                  </div>
                </div>
              ) : selectedService.id === 'onelapfit' ? (
                <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>
                  <p style={{ marginTop: 0 }}>
                    <strong>Onelapfit (Magene)</strong> heeft geen openbare ontwikkelaarskeys voor individuele gebruikers. Je kunt je ritten op 2 eenvoudige manieren automatisch binnenhalen in Zenith:
                  </p>

                  <div style={{ background: 'rgba(0, 163, 255, 0.1)', border: '1px solid rgba(0, 163, 255, 0.3)', borderRadius: 12, padding: 14, marginBottom: 14 }}>
                    <strong style={{ color: '#00A3FF', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      1. Strava Auto-Bridge (Automatisch - Aanbevolen)
                    </strong>
                    <ol style={{ margin: 0, paddingLeft: 18, color: '#cbd5e1', fontSize: 12 }}>
                      <li>Open de <strong>Onelapfit app</strong> op je telefoon of ga naar <a href="https://www.onelapfit.com" target="_blank" rel="noreferrer" style={{ color: '#38bdf8' }}>onelapfit.com</a>.</li>
                      <li>Ga naar <strong>Instellingen ➔ Derden Koppelingen (Third-Party Apps)</strong>.</li>
                      <li>Selecteer <strong>Strava</strong> en machtig de verbinding.</li>
                      <li>Zodra je indoor rit stopt, stuurt Onelapfit de rit naar Strava. Zenith haalt het direct op in <strong>Zenith Aero</strong> met al je vermogensdata!</li>
                    </ol>
                  </div>

                  <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 12, padding: 14 }}>
                    <strong style={{ color: '#fff', display: 'block', marginBottom: 4 }}>
                      2. Directe FIT Bestand Import
                    </strong>
                    <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>
                      Download het <code>.FIT</code> bestand uit Onelapfit en sleep het rechtstreeks in <strong>Zenith Aero ➔ FIT Importeren</strong>.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>
                    Voer je Client Credentials in voor <strong>{selectedService.name}</strong>. Hiermee haalt Zenith automatisch je trainingsgegevens en herstelmetrieken op.
                  </p>

                  <div className="form-group">
                    <label>Client ID / App ID</label>
                    <input 
                      type="text" 
                      value={editClientId} 
                      onChange={(e) => setEditClientId(e.target.value)} 
                      placeholder="Bijv. 109823 of polar_client_id"
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
                <ShieldCheck size={16} style={{ color: '#10b981', flexShrink: 0 }} />
                <span>Gegevens worden veilig gesynchroniseerd en uitsluitend gebruikt voor jouw persoonlijke Zenith herstel- en trainingsanalytics.</span>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setSelectedService(null)}>Annuleren</button>
              <button className="btn-primary" onClick={saveConfigModal}>
                Opslaan & Verbinden
                <ArrowRight size={14} style={{ marginLeft: 6 }} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
