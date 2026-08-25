import React from 'react';
import { X, Sparkles, Camera, Ruler, Activity, Moon, CheckCircle2 } from 'lucide-react';

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
          border: '1px solid rgba(168, 85, 247, 0.25)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7)',
          padding: '28px'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ 
              background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)',
              padding: '6px 12px',
              borderRadius: '8px',
              color: '#ffffff',
              fontWeight: 900,
              fontSize: 11,
              letterSpacing: '1px'
            }}>
              ZENITH PRO
            </div>
            <Sparkles size={16} color="#a855f7" />
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
            {featureName ? `Unlock ${featureName}` : 'Upgrade to Zenith Pro'}
          </h2>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
            {featureDescription || 'Get access to visual progress comparisons, body measurements, scale body fat %, and sleep stages.'}
          </p>
        </div>

        {/* Feature List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: 'rgba(255, 255, 255, 0.03)', padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
            <Camera size={18} color="#a855f7" style={{ marginTop: 2, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#f8fafc' }}>Progress Photos & Visual Comparer</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Upload photos (Front, Side, Back) and compare your physical transformation side-by-side with a slider.</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: 'rgba(255, 255, 255, 0.03)', padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
            <Ruler size={18} color="#a855f7" style={{ marginTop: 2, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#f8fafc' }}>Body Circumferences (All 8 Zones)</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Track measurements for Chest, Biceps, Thighs, Hips, Shoulders, Neck, Calves, and Waist over time.</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: 'rgba(255, 255, 255, 0.03)', padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
            <Activity size={18} color="#a855f7" style={{ marginTop: 2, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#f8fafc' }}>Body Composition (Fat % & Muscle Mass)</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Track Body Fat %, Muscle Mass kg, Visceral Fat, and Water % over time.</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: 'rgba(255, 255, 255, 0.03)', padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
            <Moon size={18} color="#a855f7" style={{ marginTop: 2, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#f8fafc' }}>Sleep Stages Breakdown</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Full breakdown of Deep Sleep (%), REM Sleep (%), Light Sleep (%), and Awake time.</div>
            </div>
          </div>
        </div>

        {/* Pricing & CTA */}
        <div style={{ 
          background: 'rgba(168, 85, 247, 0.08)', 
          border: '1px solid rgba(168, 85, 247, 0.25)', 
          borderRadius: '12px', 
          padding: '16px', 
          textAlign: 'center',
          marginBottom: 20 
        }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#c084fc', fontWeight: 800, letterSpacing: '0.5px' }}>Zenith Pro Membership</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#ffffff', margin: '4px 0' }}>
            €9,99 <span style={{ fontSize: 13, fontWeight: 500, color: '#94a3b8' }}>/ month</span>
          </div>
          <div style={{ fontSize: 11, color: '#39ff14', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
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
            style={{ flex: 2, height: '44px', fontSize: 13, background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)', color: '#ffffff', fontWeight: 900 }}
          >
            Start Free Trial
          </button>
        </div>
      </div>
    </div>
  );
};
