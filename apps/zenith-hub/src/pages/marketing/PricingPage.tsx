import React, { useState } from 'react';
import { 
  ArrowLeft, 
  CheckCircle2, 
  XCircle, 
  Zap, 
  ShieldCheck, 
  Sparkles, 
  HelpCircle 
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
      height: '100vh',
      width: '100vw',
      overflowY: 'auto',
      overflowX: 'hidden',
      backgroundColor: '#09090b',
      color: '#f8fafc',
      fontFamily: "'Outfit', 'Inter', system-ui, -apple-system, sans-serif",
      padding: '32px 24px 60px',
      position: 'relative'
    }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
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
              gap: 8,
              fontFamily: 'inherit'
            }}
          >
            <ArrowLeft size={16} /> Back
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8' }}>
            <ShieldCheck size={14} style={{ color: '#10b981' }} />
            <span>PayPal Secure Subscription</span>
          </div>
        </div>

        {/* Hero Section */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            padding: '4px 16px',
            borderRadius: 20,
            color: '#34d399',
            fontSize: 11,
            fontWeight: 800,
            marginBottom: 16
          }}>
            <Sparkles size={13} /> TRANSPARENT ATHLETE PRICING
          </div>

          <h1 style={{ fontSize: 36, fontWeight: 900, color: '#fff', margin: '0 0 12px' }}>
            Choose the plan that fits your athletic goals
          </h1>
          <p style={{ fontSize: 15, color: '#94a3b8', maxWidth: '600px', margin: '0 auto' }}>
            Start for free with essential tracking or unlock the full power of the Zenith Ecosystem with Zenith Pro.
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
                €0 <span style={{ fontSize: 13, fontWeight: 500, color: '#64748b' }}>/ forever free</span>
              </div>
              <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 24, lineHeight: 1.5 }}>
                Perfect for athletes looking to track basic body weight, steps, and daily workouts.
              </p>

              <ul style={{ padding: 0, listStyle: 'none', fontSize: 12, color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: 10, margin: 0 }}>
                <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle2 size={16} color="#10b981" /> Weight (kg) & Steps tracking
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle2 size={16} color="#10b981" /> Basic Cycling Rides & Calendar overview
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle2 size={16} color="#10b981" /> Kratos Strength Training Workouts
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle2 size={16} color="#10b981" /> Fuel Nutrition & Hydration logger
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748b' }}>
                  <XCircle size={16} color="#ef4444" /> Aero AI Route Generator (GPX/TCX Export)
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748b' }}>
                  <XCircle size={16} color="#ef4444" /> Vigor Progress Photos & Body Circumferences
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
                  cursor: 'default',
                  fontFamily: 'inherit'
                }}
              >
                {isPro ? 'Included by Default' : 'Current Free Plan'}
              </button>
            </div>
          </div>

          {/* Pro Plan */}
          <div style={{
            background: 'linear-gradient(145deg, rgba(16, 185, 129, 0.1) 0%, rgba(18, 18, 24, 0.95) 100%)',
            border: '2px solid #10b981',
            borderRadius: '20px',
            padding: '32px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
            boxShadow: '0 15px 40px rgba(16, 185, 129, 0.2)'
          }}>
            <div style={{ position: 'absolute', top: -12, right: 24, background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', fontSize: 10, fontWeight: 900, padding: '3px 12px', borderRadius: 12 }}>
              MOST POPULAR
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', color: '#34d399', letterSpacing: '0.8px' }}>
                ZENITH PRO
              </div>
              <div style={{ fontSize: 32, fontWeight: 900, color: '#fff', margin: '8px 0 4px' }}>
                €9.99 <span style={{ fontSize: 13, fontWeight: 500, color: '#94a3b8' }}>/ month</span>
              </div>
              <div style={{ fontSize: 11, color: '#34d399', fontWeight: 800, marginBottom: 16 }}>
                14-day free trial • Cancel anytime via PayPal
              </div>
              <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 24, lineHeight: 1.5 }}>
                For dedicated athletes seeking maximum insights into route planning, body transformation, and sleep quality.
              </p>

              <ul style={{ padding: 0, listStyle: 'none', fontSize: 12, color: '#f8fafc', display: 'flex', flexDirection: 'column', gap: 10, margin: 0 }}>
                <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle2 size={16} color="#34d399" /> 🚴 Aero AI Route Generator & GPX/TCX Export
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle2 size={16} color="#34d399" /> 📸 Vigor Progress Photos & Side-by-Side Comparator
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle2 size={16} color="#34d399" /> 📏 Vigor Body Circumferences (8 Zones)
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle2 size={16} color="#34d399" /> ⚖️ Body Fat & Muscle Mass Breakdown
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle2 size={16} color="#34d399" /> 🌙 Colmi Smart Ring Deep & REM Sleep Stages
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckCircle2 size={16} color="#34d399" /> 🔥 Kratos Muscle Heatmap & Rep Max Sync
                </li>
              </ul>
            </div>

            <div style={{ marginTop: 32 }}>
              {isPro ? (
                <div style={{
                  background: 'rgba(52, 211, 153, 0.15)',
                  border: '1px solid #34d399',
                  color: '#34d399',
                  fontWeight: 900,
                  fontSize: 13,
                  padding: '12px',
                  borderRadius: 12,
                  textAlign: 'center'
                }}>
                  ✓ Zenith Pro Active
                </div>
              ) : (
                <button 
                  onClick={() => setShowPayPalModal(true)}
                  style={{
                    width: '100%',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
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
                    boxShadow: '0 8px 20px rgba(16, 185, 129, 0.4)',
                    fontFamily: 'inherit'
                  }}
                >
                  <Zap size={16} /> Upgrade via PayPal (€9.99/mo)
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
            <HelpCircle size={20} color="#10b981" /> Frequently Asked Questions (FAQ)
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
            <div>
              <h4 style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 6 }}>
                How does the 14-day free trial work?
              </h4>
              <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5, margin: 0 }}>
                You can try Zenith Pro completely free for 14 days. If you decide it's not for you, cancel anytime within 14 days with zero charges.
              </p>
            </div>

            <div>
              <h4 style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 6 }}>
                How does payment work via PayPal?
              </h4>
              <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5, margin: 0 }}>
                Payments are processed via the secure PayPal Checkout platform. Your Pro membership is instantly activated across all your devices upon payment.
              </p>
            </div>

            <div>
              <h4 style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 6 }}>
                Can I cancel my subscription at any time?
              </h4>
              <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5, margin: 0 }}>
                Yes, your subscription can be canceled monthly via your PayPal account or directly inside your Zenith Profile page.
              </p>
            </div>
          </div>
        </div>
      </div>

      <PayPalModal
        isOpen={showPayPalModal}
        onClose={() => setShowPayPalModal(false)}
        onSuccess={handlePaymentSuccess}
        planName="Zenith Pro Monthly Subscription"
        priceDisplay="€9.99 / month"
      />
    </div>
  );
};
