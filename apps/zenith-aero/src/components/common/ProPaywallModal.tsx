import React from 'react';
import { X, Sparkles, Compass, Activity, Zap, Map, CheckCircle2 } from 'lucide-react';

interface ProPaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubscribe?: () => void;
  featureName?: string;
  featureDescription?: string;
}

export const ProPaywallModal: React.FC<ProPaywallModalProps> = ({
  isOpen,
  onClose,
  onSubscribe,
  featureName,
  featureDescription,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }}>
      <div 
        className="modal-content animate-slide-up" 
        style={{ 
          maxWidth: '520px', 
          background: 'linear-gradient(145deg, #121218 0%, #1a1a24 100%)',
          border: '1px solid rgba(203, 213, 225, 0.2)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7)',
          padding: '28px'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ 
              background: 'linear-gradient(135deg, #cbd5e1 0%, #64748b 100%)',
              padding: '6px 12px',
              borderRadius: '8px',
              color: '#09090b',
              fontWeight: 900,
              fontSize: 11,
              letterSpacing: '1px'
            }}>
              ZENITH PRO
            </div>
            <Sparkles size={16} color="#cbd5e1" />
          </div>
          <button 
            onClick={onClose} 
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Dynamic Feature Callout */}
        <div style={{ textAlign: 'center', margin: '16px 0 24px' }}>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: '#ffffff', margin: '0 0 8px', letterSpacing: '0.5px' }}>
            {featureName ? `Ontgrendel ${featureName}` : 'Upgrade naar Zenith Pro'}
          </h2>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
            {featureDescription || 'Krijg toegang tot geavanceerde trainingsleer, AI-routegeneratie en diepgaande prestatie-analyses.'}
          </p>
        </div>

        {/* Feature List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: 'rgba(255, 255, 255, 0.03)', padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
            <Compass size={18} color="#cbd5e1" style={{ marginTop: 2, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#f8fafc' }}>AI Route Generator & GPX Export</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Genereer GPX-routes op maat en bekijk hoogte- & windprofielen. Download direct voor Garmin & Wahoo.</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: 'rgba(255, 255, 255, 0.03)', padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
            <Activity size={18} color="#cbd5e1" style={{ marginTop: 2, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#f8fafc' }}>PMC Conditiegrafiek (CTL / ATL / TSB)</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Volledige Fitness, Vermoeidheid en Forme geschiedenis (30d, 90d, 1 jaar) en toekomst-tapering voor doelwedstrijden.</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: 'rgba(255, 255, 255, 0.03)', padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
            <Zap size={18} color="#cbd5e1" style={{ marginTop: 2, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#f8fafc' }}>Power Duration Curve & W' Balance</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Vergelijk je maximale vermogen over seizoenen heen en analyseer de uitputtingssnelheid van je anaerobe batterij.</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: 'rgba(255, 255, 255, 0.03)', padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
            <Map size={18} color="#cbd5e1" style={{ marginTop: 2, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#f8fafc' }}>All-Time Cycling Heatmap & Climb Analysis</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>View all your ridden roads on a glowing map and automatically analyze climbs with VAM ascent speed.</div>
            </div>
          </div>
        </div>

        {/* Pricing & CTA */}
        <div style={{ 
          background: 'rgba(203, 213, 225, 0.06)', 
          border: '1px solid rgba(203, 213, 225, 0.15)', 
          borderRadius: '12px', 
          padding: '16px', 
          textAlign: 'center',
          marginBottom: 20 
        }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#94a3b8', fontWeight: 800, letterSpacing: '0.5px' }}>Zenith Pro Subscription</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#ffffff', margin: '4px 0' }}>
            €9.99 <span style={{ fontSize: 13, fontWeight: 500, color: '#94a3b8' }}>/ month</span>
          </div>
          <div style={{ fontSize: 11, color: '#38bdf8', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <CheckCircle2 size={12} /> 14-day free trial, cancel anytime
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button 
            type="button" 
            className="btn-secondary" 
            onClick={onClose} 
            style={{ flex: 1, height: '44px', fontSize: 13 }}
          >
            Close
          </button>
          <button 
            type="button" 
            className="btn-primary" 
            onClick={() => {
              if (onSubscribe) {
                onSubscribe();
              }
              onClose();
            }} 
            style={{ flex: 2, height: '44px', fontSize: 13, background: 'linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%)', color: '#09090b', fontWeight: 900 }}
          >
            Start Gratis Proefperiode
          </button>
        </div>
      </div>
    </div>
  );
};
