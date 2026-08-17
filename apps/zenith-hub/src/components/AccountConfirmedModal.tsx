import React, { useEffect, useState } from 'react';
import { CheckCircle2, Sparkles, ArrowRight } from 'lucide-react';

interface AccountConfirmedModalProps {
  onProceed: () => void;
  userName?: string;
}

export const AccountConfirmedModal: React.FC<AccountConfirmedModalProps> = ({
  onProceed,
  userName = 'Atleet'
}) => {
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          onProceed();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onProceed]);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: 'rgba(9, 9, 11, 0.92)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999,
      fontFamily: 'Outfit, sans-serif'
    }}>
      <div style={{
        maxWidth: '480px',
        width: '90%',
        background: 'linear-gradient(145deg, rgba(30, 27, 46, 0.95) 0%, rgba(18, 18, 24, 0.98) 100%)',
        border: '1px solid rgba(57, 255, 20, 0.4)',
        borderRadius: '24px',
        padding: '40px 32px',
        textAlign: 'center',
        boxShadow: '0 20px 60px rgba(57, 255, 20, 0.2), 0 0 30px rgba(168, 85, 247, 0.2)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Top Glow Accent */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '80%',
          height: '4px',
          background: 'linear-gradient(90deg, #a855f7 0%, #39ff14 100%)',
          borderRadius: '2px'
        }} />

        {/* Animated Icon Circle */}
        <div style={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          background: 'rgba(57, 255, 20, 0.12)',
          border: '2px solid #39ff14',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px',
          boxShadow: '0 0 25px rgba(57, 255, 20, 0.4)'
        }}>
          <CheckCircle2 size={38} color="#39ff14" />
        </div>

        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: 'rgba(168, 85, 247, 0.12)',
          border: '1px solid rgba(168, 85, 247, 0.3)',
          padding: '4px 14px',
          borderRadius: 20,
          color: '#c084fc',
          fontSize: 11,
          fontWeight: 800,
          marginBottom: 16
        }}>
          <Sparkles size={13} /> E-MAILBEVESTIGING VOLTOOID
        </div>

        <h2 style={{ fontSize: 26, fontWeight: 900, color: '#fff', margin: '0 0 10px' }}>
          Account Bevestigd! 🎉
        </h2>

        <p style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.6, margin: '0 0 24px' }}>
          Welkom bij Zenith, <strong style={{ color: '#fff' }}>{userName}</strong>! Je e-mailadres is succesvol geverifieerd. Je account is nu volledig actief.
        </p>

        <div style={{
          background: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 14,
          padding: '12px',
          fontSize: 12,
          color: '#cbd5e1',
          marginBottom: 24
        }}>
          Automatisch doorsturen over <span style={{ color: '#39ff14', fontWeight: 900 }}>{countdown}s</span>...
        </div>

        <button
          onClick={onProceed}
          style={{
            width: '100%',
            background: 'linear-gradient(135deg, #a855f7 0%, #39ff14 100%)',
            color: '#09090b',
            fontWeight: 900,
            fontSize: 14,
            padding: '14px',
            borderRadius: 14,
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            boxShadow: '0 8px 25px rgba(57, 255, 20, 0.3)'
          }}
        >
          Naar Zenith Dashboard <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
};
