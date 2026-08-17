import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, Lock, CreditCard } from 'lucide-react';

interface PayPalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
  planName?: string;
  priceDisplay?: string;
}

export const PayPalModal: React.FC<PayPalModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  planName = 'Zenith Pro Maandabonnement',
  priceDisplay = '€9,99 / maand'
}) => {
  const [processing, setProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setProcessing(false);
      setPaymentSuccess(false);
      setErrorMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSimulatePayPalSuccess = async () => {
    try {
      setProcessing(true);
      setErrorMsg(null);
      
      // Simulate PayPal API verification delay
      await new Promise(resolve => setTimeout(resolve, 1500));

      setPaymentSuccess(true);
      
      await onSuccess();

      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err: any) {
      console.error('PayPal processing error:', err);
      setErrorMsg('Fout bij verwerken PayPal betaling. Probeer opnieuw.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div 
      style={{ 
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999999, 
        background: 'rgba(5, 5, 8, 0.88)', 
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)'
      }}
    >
      <div 
        className="modal-content animate-slide-up" 
        style={{ 
          maxWidth: '480px', 
          width: '92%',
          background: 'linear-gradient(145deg, #121218 0%, #1a1a26 100%)',
          border: '1px solid rgba(168, 85, 247, 0.35)',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.85), 0 0 30px rgba(168, 85, 247, 0.15)',
          borderRadius: '20px',
          padding: '28px',
          color: '#ffffff',
          position: 'relative'
        }}
      >
        <button 
          onClick={onClose}
          disabled={processing}
          style={{
            position: 'absolute',
            top: 20,
            right: 20,
            background: 'rgba(255, 255, 255, 0.06)',
            border: 'none',
            borderRadius: '50%',
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#94a3b8',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          <X size={18} />
        </button>

        {paymentSuccess ? (
          <div style={{ textAlign: 'center', padding: '24px 12px' }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'rgba(57, 255, 20, 0.15)',
              border: '2px solid #39ff14',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px'
            }}>
              <CheckCircle2 size={36} color="#39ff14" />
            </div>
            <h3 style={{ fontSize: 20, fontWeight: 900, color: '#fff', marginBottom: 8 }}>
              Betaling geslaagd!
            </h3>
            <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5, margin: 0 }}>
              Bedankt voor je betaling via PayPal. Je <strong>Zenith Pro</strong> abonnement is nu geactiveerd.
            </p>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{
                background: 'linear-gradient(135deg, #003087 0%, #0079C1 100%)',
                padding: '8px 14px',
                borderRadius: '10px',
                fontWeight: 900,
                fontSize: 13,
                color: '#fff',
                letterSpacing: '0.5px'
              }}>
                PayPal
              </div>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 900, margin: 0, color: '#fff' }}>
                  Zenith Pro Checkout
                </h3>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>Beveiligde SSL Transactie</span>
              </div>
            </div>

            {/* Order Summary Box */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '14px',
              padding: '16px',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#f8fafc' }}>{planName}</span>
                <span style={{ fontSize: 14, fontWeight: 900, color: '#a855f7' }}>{priceDisplay}</span>
              </div>
              <ul style={{ paddingLeft: 18, margin: 0, fontSize: 11, color: '#94a3b8', lineHeight: 1.6 }}>
                <li>Onbeperkte Aero Routegenerator (GPX / TCX export)</li>
                <li>Vigor Voortgangsfoto's, Omtrekken & Vet% breakdown</li>
                <li>Geavanceerde Slaapfases & Kratos Muscle Sync</li>
                <li>Maandelijks opzegbaar via je profiel of PayPal</li>
              </ul>
            </div>

            {errorMsg && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ef4444',
                fontSize: 12,
                padding: '10px 14px',
                borderRadius: '8px',
                marginBottom: 16
              }}>
                {errorMsg}
              </div>
            )}

            {/* PayPal Action Button */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button
                onClick={handleSimulatePayPalSuccess}
                disabled={processing}
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #0079C1 0%, #00457C 100%)',
                  color: '#ffffff',
                  fontWeight: 900,
                  fontSize: 14,
                  padding: '14px',
                  borderRadius: '12px',
                  border: 'none',
                  cursor: processing ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  boxShadow: '0 8px 20px rgba(0, 121, 193, 0.4)',
                  transition: 'all 0.2s ease',
                  opacity: processing ? 0.7 : 1
                }}
              >
                <CreditCard size={18} />
                {processing ? 'Verbinden met PayPal...' : 'Betalen via PayPal (€9,99/m)'}
              </button>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 10, color: '#64748b' }}>
                <Lock size={12} />
                <span>256-bit encryptie via PayPal Checkout</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
