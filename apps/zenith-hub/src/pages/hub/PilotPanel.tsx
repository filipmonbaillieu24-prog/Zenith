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
  const [selectedApp, setSelectedApp] = useState<'pulse' | 'daily' | 'kratos' | 'pilot'>('pulse');

  useEffect(() => {
    const fetchIp = async () => {
      try {
        const ip = await invoke<string>('get_local_ip');
        setLocalIp(ip);
      } catch (err) {
        console.error('Could not fetch local IP:', err);
      }
    };
    fetchIp();
  }, []);

  const isDev = import.meta.env.DEV;
  const downloadUrl = selectedApp === 'pulse'
    ? ((useLocalDevLink && localIp)
        ? `http://${localIp}:1420/pulse-debug.apk`
        : `https://github.com/filipmonbaillieu24-prog/Zenith/raw/main/apk/pulse-debug.apk?t=${Date.now()}`)
    : selectedApp === 'pilot'
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
    if (selectedApp === 'pulse') return 'Zenith Pulse';
    if (selectedApp === 'pilot') return 'Aero Pilot';
    if (selectedApp === 'kratos') return 'Kratos Pilot';
    return 'Zenith Daily';
  };

  const getAppVersion = () => {
    if (selectedApp === 'pulse') return 'Version 1.0.2 • 17.5 MB';
    if (selectedApp === 'pilot') return 'Version 1.0.0-alpha • 14.8 MB';
    if (selectedApp === 'kratos') return 'Version 1.36 • 15.8 MB';
    return 'Version 1.0.0 • 41.6 MB';
  };

  return (
    <div className="zh-hub-container">
      {/* Background radial glow */}
      <div className="zh-hub-glow" style={{ background: 'radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.1) 0%, transparent 60%)' }} />

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
              {selectedApp === 'pulse' ? (
                <>ZENITH <span style={{ fontWeight: 400, color: '#38bdf8', fontSize: '16px' }}>PULSE</span></>
              ) : selectedApp === 'pilot' ? (
                <>AERO <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '16px' }}>PILOT</span></>
              ) : selectedApp === 'kratos' ? (
                <>KRATOS <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '16px' }}>PILOT</span></>
              ) : (
                <>ZENITH <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '16px' }}>DAILY</span></>
              )}
            </h1>
            <p className="zh-hub-subtitle" style={{ fontSize: '9px', color: 'var(--text-muted)', margin: '4px 0 0', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              {selectedApp === 'pulse'
                ? `Android Health Connect Ecosystem Sync for ${userName}`
                : selectedApp === 'pilot' 
                ? `Android Audio Companion for ${userName}`
                : selectedApp === 'kratos'
                ? `Android Strength Training Tracker for ${userName}`
                : `Android Nutrition & Health Tracker for ${userName}`}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#64748b' }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#38bdf8', display: 'inline-block' }} />
          <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {useLocalDevLink ? 'Local dev build' : 'Production APK build'} available
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
              onClick={() => setSelectedApp('pulse')}
              style={{
                background: selectedApp === 'pulse' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                border: selectedApp === 'pulse' ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid transparent',
                color: selectedApp === 'pulse' ? '#38bdf8' : '#94a3b8',
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
              Zenith Pulse
            </button>
            <button 
              onClick={() => setSelectedApp('daily')}
              style={{
                background: selectedApp === 'daily' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                border: selectedApp === 'daily' ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid transparent',
                color: selectedApp === 'daily' ? '#38bdf8' : '#94a3b8',
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
                color: selectedApp === 'kratos' ? '#38bdf8' : '#94a3b8',
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
                color: selectedApp === 'pilot' ? '#38bdf8' : '#94a3b8',
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
              ? `Scan the QR code with your Android phone on the same Wi-Fi network to download your local ${getAppName()} APK.`
              : `Scan the QR code with your Android camera to download and install the ${getAppName()} app.`}
          </p>

          <a 
            href="#"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              background: '#38bdf8',
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
              boxShadow: '0 4px 12px rgba(56, 189, 248, 0.25)'
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
            <Download size={16} /> Direct Download (.apk)
          </a>
          
          {isDev && localIp && (
            <button
              onClick={() => setUseLocalDevLink(!useLocalDevLink)}
              style={{
                marginTop: 14,
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: useLocalDevLink ? '#38bdf8' : '#94a3b8',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: 10,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.2s'
              }}
            >
              {useLocalDevLink ? '✓ Connected to Local PC' : 'Connect to Local PC (Dev)'}
            </button>
          )}
          
          <span style={{ fontSize: 9, color: '#64748b', marginTop: 10 }}>{getAppVersion()}</span>
        </div>

        {/* Right Column: Key Features & Instructions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          
          {/* App Info Card */}
          <div className="zh-pilot-card" style={{ padding: '24px 28px' }}>
            {selectedApp === 'pulse' ? (
              <>
                <h3 className="zh-pilot-card-title" style={{ fontSize: 14, marginBottom: 12 }}>
                  <Smartphone size={16} /> Mobile Health Connect Ecosystem Bridge
                </h3>
                <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 16px', lineHeight: 1.6 }}>
                  Directly bridges Google Fit, Samsung Health, Fitbit, Polar, and Garmin data via Android Health Connect into Zenith Vigor &amp; Stride.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <Wifi size={16} style={{ color: '#38bdf8', flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <h4 style={{ margin: '0 0 2px', fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>Background Cloud Sync</h4>
                      <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>
                        Syncs automatically over Wi-Fi or 4G/5G straight to Supabase, authenticated as you - no local server, no pairing step.
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <ShieldCheck size={16} style={{ color: '#a855f7', flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <h4 style={{ margin: '0 0 2px', fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>Comprehensive Biometrics</h4>
                      <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>
                        Background tracking for steps, heart rate, HRV (RMSSD), sleep stages, active calories, weight, and SpO2.
                      </p>
                    </div>
                  </div>
                </div>
              </>
            ) : selectedApp === 'daily' ? (
              <>
                <h3 className="zh-pilot-card-title" style={{ fontSize: 14, marginBottom: 12 }}>
                  <Smartphone size={16} /> Mobile Nutrition & Weight Tracker
                </h3>
                <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 16px', lineHeight: 1.6 }}>
                  Log daily nutrition (Fuel) with barcode scanning and automatic Health Connect step & weight synchronization.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <Apple size={16} style={{ color: '#38bdf8', flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <h4 style={{ margin: '0 0 2px', fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>Barcode & Fuel Tracker</h4>
                      <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>
                        Scan product barcodes with your camera or search the database to log calories and macros in seconds.
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <ShieldCheck size={16} style={{ color: '#38bdf8', flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <h4 style={{ margin: '0 0 2px', fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>Health Connect & Weight Log</h4>
                      <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>
                        Quickly enter body weight and automatically sync steps and active energy via Android Health Connect.
                      </p>
                    </div>
                  </div>
                </div>
              </>
            ) : selectedApp === 'kratos' ? (
              <>
                <h3 className="zh-pilot-card-title" style={{ fontSize: 14, marginBottom: 12 }}>
                  <Smartphone size={16} /> Mobile Strength Training Companion
                </h3>
                <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 16px', lineHeight: 1.6 }}>
                  On-the-go companion for strength workouts with built-in rest timer and autoregulation.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <Wifi size={16} style={{ color: '#cbd5e1', flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <h4 style={{ margin: '0 0 2px', fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>Set & Rep Logging</h4>
                      <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>
                        Log your sets, reps, and RIR easily from the gym floor. Fully offline-first.
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <ShieldCheck size={16} style={{ color: '#cbd5e1', flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <h4 style={{ margin: '0 0 2px', fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>Rest & Recovery Timer</h4>
                      <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>
                        Built-in rest timer that scales automatically and alerts you with audio-focus notifications.
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
                  Live cycling coach that connects directly to your sensors and delivers audio instructions during your ride.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <Wifi size={16} style={{ color: '#cbd5e1', flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <h4 style={{ margin: '0 0 2px', fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>Sensor Integration</h4>
                      <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>
                        Connects directly with Bluetooth (BLE) heart rate, cadence, and power meters.
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <ShieldCheck size={16} style={{ color: '#cbd5e1', flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <h4 style={{ margin: '0 0 2px', fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>Audio Guidance</h4>
                      <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>
                        Receive real-time in-ear audio feedback regarding target training zones and workout intervals.
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
              Installation Instructions
            </h3>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: 8, lineHeight: 1.5 }}>
              <li>
                <strong style={{ color: '#f1f5f9' }}>Download APK:</strong> Scan the QR code with your phone camera or click the download button.
              </li>
              <li>
                <strong style={{ color: '#f1f5f9' }}>Allow Unknown Sources:</strong> Tap the download notification and enable installation from your browser settings if prompted.
              </li>
              <li>
                <strong style={{ color: '#f1f5f9' }}>Install & Launch:</strong> Follow the prompts to complete installation and open the <strong style={{ color: '#cbd5e1' }}>{getAppName()}</strong> app.
              </li>
              <li>
                <strong style={{ color: '#f1f5f9' }}>Sign In with Zenith:</strong> Use your Zenith credentials to connect your profile and sync data live.
              </li>
            </ol>
          </div>

        </div>

      </div>
    </div>
  );
};
