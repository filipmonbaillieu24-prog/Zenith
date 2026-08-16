import React, { useEffect, useState } from 'react';
import { Download, ShieldCheck, Smartphone, Wifi, Apple } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { invoke } from '@tauri-apps/api/core';
import './ZenithHub.css';

interface PilotPanelProps {
  userName: string;
}

export const PilotPanel: React.FC<PilotPanelProps> = ({ userName }) => {
  const [localIp, setLocalIp] = useState<string | null>(null);
  const [useLocalDevLink, setUseLocalDevLink] = useState(false);
  const [selectedApp, setSelectedApp] = useState<'pilot' | 'kratos' | 'daily'>('daily');

  useEffect(() => {
    const fetchIp = async () => {
      try {
        const ip = await invoke<string>('get_local_ip');
        setLocalIp(ip);
      } catch (err) {
        console.error('Kon lokale IP niet ophalen:', err);
      }
    };
    fetchIp();
  }, []);

  const isDev = import.meta.env.DEV;
  const downloadUrl = selectedApp === 'pilot'
    ? ((useLocalDevLink && localIp)
        ? `http://${localIp}:1420/app-debug.apk` 
        : `https://github.com/filipmonbaillieu24-prog/Zenith/raw/main/apk/app-debug.apk?t=${Date.now()}`)
    : selectedApp === 'kratos'
    ? ((useLocalDevLink && localIp)
        ? `http://${localIp}:1420/kratos.apk` 
        : `https://github.com/filipmonbaillieu24-prog/Zenith/raw/main/apk/kratos.apk?t=${Date.now()}`)
    : ((useLocalDevLink && localIp)
        ? `http://${localIp}:1420/daily-debug.apk` 
        : `https://github.com/filipmonbaillieu24-prog/Zenith/raw/main/apk/daily-debug.apk?t=${Date.now()}`);

  const getAppName = () => {
    if (selectedApp === 'pilot') return 'Aero Pilot';
    if (selectedApp === 'kratos') return 'Kratos Pilot';
    return 'Zenith Daily';
  };

  const getAppVersion = () => {
    if (selectedApp === 'pilot') return 'Versie 1.0.0-alpha • 14.8 MB';
    if (selectedApp === 'kratos') return 'Versie 1.36 • 15.8 MB';
    return 'Versie 1.0.0 • 41.6 MB';
  };

  return (
    <div className="zh-hub-container">
      {/* Background radial glow */}
      <div className="zh-hub-glow" style={{ background: 'radial-gradient(circle at 80% 20%, rgba(203, 213, 225, 0.1) 0%, transparent 60%)' }} />

      {/* Header */}
      <header className="zh-hub-header animate-slide-down" style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)', 
        padding: '16px 24px', 
        background: 'transparent',
        height: '70px',
        boxSizing: 'border-box',
        flexShrink: 0,
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div>
            <h1 className="zh-hub-title" style={{ fontSize: '20px', fontWeight: 900, color: '#ffffff', margin: 0, letterSpacing: '0.5px', lineHeight: '1.2' }}>
              {selectedApp === 'pilot' ? (
                <>AERO <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '16px' }}>PILOT</span></>
              ) : selectedApp === 'kratos' ? (
                <>KRATOS <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '16px' }}>PILOT</span></>
              ) : (
                <>ZENITH <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '16px' }}>DAILY</span></>
              )}
            </h1>
            <p className="zh-hub-subtitle" style={{ fontSize: '9px', color: 'var(--text-muted)', margin: '4px 0 0', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              {selectedApp === 'pilot' 
                ? `Android Audio Companion voor ${userName}`
                : selectedApp === 'kratos'
                ? `Android Krachttraining Tracker voor ${userName}`
                : `Android Voeding & Gezondheid Tracker voor ${userName}`}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#64748b' }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--color-primary)', display: 'inline-block' }} />
          <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {useLocalDevLink ? 'Lokale dev build' : 'Production APK build'} beschikbaar
          </span>
        </div>
      </header>

      {/* Main Grid */}
      <div className="zh-pilot-grid animate-slide-up" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '32px', marginTop: 16 }}>
        
        {/* Left Column: QR Code & Download Action */}
        <div className="zh-pilot-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', textAlign: 'center' }}>
          
          {/* App Switcher */}
          <div style={{ 
            display: 'flex', 
            gap: 4, 
            marginBottom: 20, 
            background: 'rgba(255,255,255,0.02)', 
            padding: 4, 
            borderRadius: 8, 
            border: '1px solid rgba(255,255,255,0.06)' 
          }}>
            <button 
              onClick={() => setSelectedApp('daily')}
              style={{
                background: selectedApp === 'daily' ? 'rgba(74, 222, 128, 0.15)' : 'transparent',
                border: selectedApp === 'daily' ? '1px solid rgba(74, 222, 128, 0.3)' : '1px solid transparent',
                color: selectedApp === 'daily' ? '#4ade80' : '#94a3b8',
                padding: '6px 14px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 800,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}
            >
              Zenith Daily
            </button>
            <button 
              onClick={() => setSelectedApp('kratos')}
              style={{
                background: selectedApp === 'kratos' ? 'rgba(255,255,255,0.08)' : 'transparent',
                border: '1px solid transparent',
                color: selectedApp === 'kratos' ? '#39ff14' : '#94a3b8',
                padding: '6px 14px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 800,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}
            >
              Kratos Pilot
            </button>
            <button 
              onClick={() => setSelectedApp('pilot')}
              style={{
                background: selectedApp === 'pilot' ? 'rgba(255,255,255,0.08)' : 'transparent',
                border: '1px solid transparent',
                color: selectedApp === 'pilot' ? '#39ff14' : '#94a3b8',
                padding: '6px 14px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 800,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}
            >
              Aero Pilot
            </button>
          </div>

          <div style={{ 
            background: '#ffffff',
            borderRadius: 16,
            padding: 16,
            marginBottom: 24,
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            display: 'inline-block'
          }}>
            <QRCodeSVG
              value={downloadUrl}
              size={180}
              bgColor={"#ffffff"}
              fgColor={"#09090b"}
              level={"M"}
              includeMargin={false}
            />
          </div>

          <h2 style={{ fontSize: 20, fontWeight: 900, color: '#f8fafc', margin: '0 0 6px', fontFamily: 'Outfit, sans-serif' }}>
            Download {getAppName()}
          </h2>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 24px', maxWidth: 280, lineHeight: 1.5 }}>
            {useLocalDevLink 
              ? `Scan de QR-code met uw Android-telefoon op hetzelfde wifi-netwerk om uw zojuist gebouwde lokale ${getAppName()} APK direct te downloaden.`
              : `Scan de QR-code met de camera van uw Android-telefoon om de ${getAppName()} app direct te downloaden en te installeren.`}
          </p>

          <a 
            href="#"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              background: selectedApp === 'daily' ? '#4ade80' : '#cbd5e1',
              color: '#09090b',
              textDecoration: 'none',
              padding: '12px 24px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 800,
              width: '100%',
              maxWidth: 240,
              boxSizing: 'border-box',
              transition: 'all 0.2s',
              boxShadow: '0 4px 12px rgba(74, 222, 128, 0.2)'
            }}
            onClick={async (e) => {
              e.preventDefault();
              try {
                await openUrl(downloadUrl);
              } catch (err) {
                console.error(err);
              }
            }}
          >
            <Download size={16} /> Directe Download (.apk)
          </a>
          
          {isDev && localIp && (
            <button
              onClick={() => setUseLocalDevLink(!useLocalDevLink)}
              style={{
                marginTop: 14,
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: useLocalDevLink ? '#39ff14' : '#94a3b8',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: 10,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.2s'
              }}
            >
              {useLocalDevLink ? '✓ Gekoppeld aan Lokale PC' : 'Koppel aan Lokale PC (Dev)'}
            </button>
          )}
          
          <span style={{ fontSize: 9, color: '#64748b', marginTop: 10 }}>{getAppVersion()}</span>
        </div>

        {/* Right Column: Key Features & Instructions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          
          {/* App Info Card */}
          <div className="zh-pilot-card" style={{ padding: '24px 28px' }}>
            {selectedApp === 'daily' ? (
              <>
                <h3 className="zh-pilot-card-title" style={{ fontSize: 14, marginBottom: 12 }}>
                  <Smartphone size={16} /> Mobiele Calorie & Gewicht Tracker
                </h3>
                <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 16px', lineHeight: 1.6 }}>
                  Dagelijkse voeding (Fuel) loggen met barcode scanner en automatische Health Connect stappen- & gewichts-sync.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <Apple size={16} style={{ color: '#4ade80', flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <h4 style={{ margin: '0 0 2px', fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>Barcode & Fuel Tracker</h4>
                      <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>
                        Scan verpakkingen met je camera of zoek in de database om calorieën en macro's binnen seconden te loggen.
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <ShieldCheck size={16} style={{ color: '#4ade80', flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <h4 style={{ margin: '0 0 2px', fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>Health Connect & Gewichtslog</h4>
                      <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>
                        Voer je gewicht snel in en synchroniseer automatisch stappen en verbrande energie via Android Health Connect.
                      </p>
                    </div>
                  </div>
                </div>
              </>
            ) : selectedApp === 'kratos' ? (
              <>
                <h3 className="zh-pilot-card-title" style={{ fontSize: 14, marginBottom: 12 }}>
                  <Smartphone size={16} /> Mobiele Krachttraining Tracker
                </h3>
                <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 16px', lineHeight: 1.6 }}>
                  Mobiele companion voor krachttraining met ingebouwde rusttimer en autoregulatie.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <Wifi size={16} style={{ color: '#cbd5e1', flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <h4 style={{ margin: '0 0 2px', fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>Set & Rep Logging</h4>
                      <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>
                        Log uw sets, reps en RIR eenvoudig vanaf de trainingsvloer. Werkt volledig offline-first.
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <ShieldCheck size={16} style={{ color: '#cbd5e1', flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <h4 style={{ margin: '0 0 2px', fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>Rust & Herstel</h4>
                      <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>
                        Ingebouwde rusttimer die automatisch schaalt en met de nieuwe luide audio-focus meldingen herinneringen geeft.
                      </p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <h3 className="zh-pilot-card-title" style={{ fontSize: 14, marginBottom: 12 }}>
                  <Smartphone size={16} /> Live In-Ear Audio Coach
                </h3>
                <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 16px', lineHeight: 1.6 }}>
                  Live fietscoach die verbinding maakt met uw sensoren en u audio-instructies geeft tijdens uw rit.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <Wifi size={16} style={{ color: '#cbd5e1', flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <h4 style={{ margin: '0 0 2px', fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>Sensor Integratie</h4>
                      <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>
                        Maakt rechtstreeks verbinding met uw Bluetooth (BLE) hartslag-, cadans- en vermogensmeters.
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <ShieldCheck size={16} style={{ color: '#cbd5e1', flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <h4 style={{ margin: '0 0 2px', fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>Audio Begeleiding</h4>
                      <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>
                        Ontvang directe in-ear audio-feedback over uw trainingszones en schema-instructies tijdens het rijden.
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Installation steps */}
          <div className="zh-pilot-card" style={{ padding: '24px 28px' }}>
            <h3 className="zh-pilot-card-title" style={{ fontSize: 14, marginBottom: 12 }}>
              Installatie-instructies
            </h3>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: 8, lineHeight: 1.5 }}>
              <li>
                <strong style={{ color: '#f1f5f9' }}>Download de APK:</strong> Scan de QR-code met de camera van uw telefoon of druk op de downloadknop.
              </li>
              <li>
                <strong style={{ color: '#f1f5f9' }}>Sta onbekende bronnen toe:</strong> Tik op de gedownloade melding en sta in de browserinstellingen toe om bestanden van deze bron te installeren indien gevraagd.
              </li>
              <li>
                <strong style={{ color: '#f1f5f9' }}>Installeer & Start:</strong> Volg de prompts om de installatie te voltooien en open de <strong style={{ color: '#cbd5e1' }}>{getAppName()}</strong> app.
              </li>
              <li>
                <strong style={{ color: '#f1f5f9' }}>Log in met Zenith:</strong> Gebruik uw Zenith inloggegevens om verbinding te maken met uw profiel en uw gegevens te synchroniseren.
              </li>
            </ol>
          </div>

        </div>

      </div>
    </div>
  );
};
