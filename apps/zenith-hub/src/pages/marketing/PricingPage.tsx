import React, { useState } from 'react';
import { 
  ArrowLeft, 
  CheckCircle2, 
  XCircle, 
  Zap, 
  ShieldCheck, 
  Sparkles, 
  HelpCircle, 
  Lock 
} from 'lucide-react';
import { PayPalModal } from '../../components/PayPalModal';

interface PricingPageProps {
  onBack: () => void;
  isPro?: boolean;
  onActivatePro?: () => Promise<void>;
}

export const PricingPage: React.FC<PricingPageProps> = ({
  onBack,
  isPro = false,
  onActivatePro,
}) => {
  const [showPayPalModal, setShowPayPalModal] = useState(false);

  const handlePaymentSuccess = async () => {
    if (onActivatePro) {
      await onActivatePro();
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#09090b',
      color: '#f8fafc',
      fontFamily: 'Outfit, sans-serif',
      padding: '32px 24px 60px',
      maxWidth: '1100px',
      margin: '0 auto',
      position: 'relative'
    }}>
      {/* Header Back Button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 40 }}>
        <button 
          onClick={onBack} 
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            color: '#fff',
            fontWeight: 700,
            fontSize: 13,
            padding: '8px 16px',
            borderRadius: 10,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <ArrowLeft size={16} /> Terug
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8' }}>
          <ShieldCheck size={14} style={{ color: '#a855f7' }} />
          <span>PayPal Beveiligd Abonnement</span>
        </div>
      </div>

      {/* Hero Section */}
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
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
          <Sparkles size={13} /> TRANSPARANTE ATLETEN PRIJZEN
        </div>

        <h1 style={{ fontSize: 36, fontWeight: 900, color: '#fff', margin: '0 0 12px' }}>
          Kies het plan dat bij je doelen past
        </h1>
        <p style={{ fontSize: 15, color: '#94a3b8', maxWidth: '600px', margin: '0 auto' }}>
          Begin gratis met de basisfuncties of ontgrendel de volledige kracht van het Zenith ecosysteem met Zenith Pro.
        </p>
      </div>

      {/* Plans Comparison Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, marginBottom: 60 }}>
        {/* Free Plan */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '20px',
          padding: '32px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.8px' }}>
              ZENITH FREE
            </div>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#fff', margin: '8px 0 16px' }}>
              €0 <span style={{ fontSize: 13, fontWeight: 500, color: '#64748b' }}>/ altijd gratis</span>
            </div>
            <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 24, lineHeight: 1.5 }}>
              Perfect voor atleten die hun basisgewicht, stappen en basistrainingen willen bijhouden.
            </p>

            <ul style={{ padding: 0, listStyle: 'none', fontSize: 12, color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: 10, margin: 0 }}>
              <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={16} color="#39ff14" /> Gewicht (kg) & Stappen loggen
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={16} color="#39ff14" /> Basisfietsritten & Kalenderoverzicht
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={16} color="#39ff14" /> Kratos krachttraining workouts
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={16} color="#39ff14" /> Fuel voedings- en hydratatielogger
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748b' }}>
                <XCircle size={16} color="#ef4444" /> Aero AI Routegenerator (GPX/TCX)
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748b' }}>
                <XCircle size={16} color="#ef4444" /> Vigor Voortgangsfoto's & Omtrekken
              </li>
            </ul>
          </div>

          <div style={{ marginTop: 32 }}>
            <button 
              disabled={true}
              style={{
                width: '100%',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#94a3b8',
                fontWeight: 700,
                fontSize: 13,
                padding: '12px',
                borderRadius: 12,
                cursor: 'default'
              }}
            >
              {isPro ? 'Standaard Inbegrepen' : 'Huidig Gratis Plan'}
            </button>
          </div>
        </div>

        {/* Pro Plan */}
        <div style={{
          background: 'linear-gradient(145deg, rgba(168, 85, 247, 0.12) 0%, rgba(18, 18, 24, 0.95) 100%)',
          border: '2px solid #a855f7',
          borderRadius: '20px',
          padding: '32px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          boxShadow: '0 15px 40px rgba(168, 85, 247, 0.2)'
        }}>
          <div style={{ position: 'absolute', top: -12, right: 24, background: 'linear-gradient(135deg, #a855f7, #7e22ce)', color: '#fff', fontSize: 10, fontWeight: 900, padding: '3px 12px', borderRadius: 12 }}>
            MEEST POPULAIR
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', color: '#c084fc', letterSpacing: '0.8px' }}>
              ZENITH PRO
            </div>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#fff', margin: '8px 0 4px' }}>
              €9,99 <span style={{ fontSize: 13, fontWeight: 500, color: '#94a3b8' }}>/ maand</span>
            </div>
            <div style={{ fontSize: 11, color: '#39ff14', fontWeight: 800, marginBottom: 16 }}>
              14 dagen gratis proefperiode • Opzegbaar via PayPal
            </div>
            <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 24, lineHeight: 1.5 }}>
              Voor de gedreven atleet die maximaal inzicht wil in routeplanning, lichaamstransformatie en slaapkwaliteit.
            </p>

            <ul style={{ padding: 0, listStyle: 'none', fontSize: 12, color: '#f8fafc', display: 'flex', flexDirection: 'column', gap: 10, margin: 0 }}>
              <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={16} color="#39ff14" /> 🚴 Aero AI Routegenerator & GPX/TCX Export
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={16} color="#39ff14" /> 📸 Vigor Voortgangsfoto's & Side-by-side Vergelijker
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={16} color="#39ff14" /> 📏 Vigor Lichaamsomtrekken (8 Zones)
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={16} color="#39ff14" /> ⚖️ Vetpercentage & Spiermassa Breakdown
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={16} color="#39ff14" /> 🌙 Colmi Smart Ring Diepe Slaap & REM Fases
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={16} color="#39ff14" /> 🔥 Kratos Muscle Heatmap & Rep Max Sync
              </li>
            </ul>
          </div>

          <div style={{ marginTop: 32 }}>
            {isPro ? (
              <div style={{
                background: 'rgba(57, 255, 20, 0.15)',
                border: '1px solid #39ff14',
                color: '#39ff14',
                fontWeight: 900,
                fontSize: 13,
                padding: '12px',
                borderRadius: 12,
                textAlign: 'center'
              }}>
                ✓ Zenith Pro Actief
              </div>
            ) : (
              <button 
                onClick={() => setShowPayPalModal(true)}
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)',
                  color: '#fff',
                  fontWeight: 900,
                  fontSize: 14,
                  padding: '14px',
                  borderRadius: 12,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  boxShadow: '0 8px 20px rgba(168, 85, 247, 0.4)'
                }}
              >
                <Zap size={16} /> Upgrade via PayPal (€9,99/m)
              </button>
            )}
          </div>
        </div>
      </div>

      {/* FAQ Section */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '20px',
        padding: '32px',
        marginBottom: 40
      }}>
        <h3 style={{ fontSize: 20, fontWeight: 900, color: '#fff', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <HelpCircle size={20} color="#a855f7" /> Veelgestelde Vragen (FAQ)
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
          <div>
            <h4 style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 6 }}>
              Hoe werkt de 14 dagen proefperiode?
            </h4>
            <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5, margin: 0 }}>
              Je kunt Zenith Pro 14 dagen lang volledig gratis uitproberen. Mocht het niet bevallen, kun je het abonnement binnen 14 dagen opzeggen zonder dat er kosten in rekening worden gebracht.
            </p>
          </div>

          <div>
            <h4 style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 6 }}>
              Hoe verloopt de betaling via PayPal?
            </h4>
            <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5, margin: 0 }}>
              Betalingen verlopen via het beveiligde PayPal Checkout platform. Je Pro lidmaatschap wordt automatisch geactiveerd op al je apparaten zodra de betaling is afgerond.
            </p>
          </div>

          <div>
            <h4 style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 6 }}>
              Kan ik mijn abonnement op elk moment opzeggen?
            </h4>
            <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5, margin: 0 }}>
              Ja, je abonnement is maandelijks opzegbaar via je PayPal account of direct op de profielpagina van Zenith.
            </p>
          </div>
        </div>
      </div>

      <PayPalModal
        isOpen={showPayPalModal}
        onClose={() => setShowPayPalModal(false)}
        onSuccess={handlePaymentSuccess}
        planName="Zenith Pro Maandabonnement"
        priceDisplay="€9,99 / maand"
      />
    </div>
  );
};
