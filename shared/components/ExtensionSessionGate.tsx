import React from 'react';

interface ExtensionSessionGateProps {
  /** Extension name shown next to the ZENITH wordmark, e.g. "Aero", "Vigor", "Kratos". */
  appName: string;
  /** Icon element, e.g. <Bike size={28} /> from lucide-react. */
  icon: React.ReactNode;
}

/**
 * Shown by every extension (Aero/Vigor/Kratos/Fuel/Stride) when it's opened
 * without an active Zenith session - e.g. directly, outside the Hub iframe.
 * One shared component so this state looks and behaves the same everywhere,
 * instead of each extension having its own wordmark treatment, copy, and
 * (in Kratos's case) no way back to the Hub at all.
 */
export const ExtensionSessionGate: React.FC<ExtensionSessionGateProps> = ({ appName, icon }) => {
  const goToHub = () => {
    const isDev = typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV;
    window.location.href = isDev ? 'http://localhost:1420' : window.location.origin;
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      width: '100vw',
      background: '#09090b',
      // The same ground the rest of Zenith stands on. This was flat black with
      // an emerald and a sky bloom on it - a third palette, on the one screen
      // every extension shows before anything else.
      backgroundImage: 'linear-gradient(135deg, #090a0c 0%, #0d2634 100%)',
      fontFamily: "'Outfit', 'Inter', system-ui, -apple-system, sans-serif",
      color: '#f8fafc',
      padding: '24px',
      boxSizing: 'border-box'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '420px',
        background: 'linear-gradient(135deg, rgba(18, 18, 22, 0.85) 0%, rgba(12, 12, 14, 0.9) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        borderRadius: '20px',
        padding: '40px 32px',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(20px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '20px',
        boxSizing: 'border-box',
        textAlign: 'center'
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          background: 'rgba(56, 189, 248, 0.12)',
          border: '1px solid rgba(56, 189, 248, 0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#7dd3fc'
        }}>
          {icon}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <h1 style={{
            fontSize: '24px',
            fontWeight: 900,
            margin: 0,
            letterSpacing: '1px',
            background: 'linear-gradient(135deg, #fff 0%, #cbd5e1 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            ZENITH <span style={{ fontWeight: 400 }}>{appName.toUpperCase()}</span>
          </h1>
          <p style={{
            fontSize: '13px',
            color: '#94a3b8',
            margin: 0,
            maxWidth: 320,
            lineHeight: 1.6,
            fontWeight: 500
          }}>
            Open Zenith Hub and log in to access this extension.
          </p>
        </div>

        <button
          onClick={goToHub}
          style={{
            background: '#38bdf8',
            color: '#09090b',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '10px',
            fontFamily: 'inherit',
            fontWeight: 800,
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            cursor: 'pointer'
          }}
        >
          Open Zenith Hub
        </button>
      </div>
    </div>
  );
};
