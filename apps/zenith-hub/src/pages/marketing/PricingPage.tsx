import React, { useState } from 'react';
import { 
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
      minHeight: '100%',
      width: '100%',
      boxSizing: 'border-box',
      backgroundColor: '#09090b',
      color: '#f8fafc',
      fontFamily: "'Outfit', 'Inter', system-ui, -apple-system, sans-serif",
      padding: '32px 40px 60px',
      position: 'relative'
    }}>
      <div style={{ width: '100%', maxWidth: '100%' }}>
        {/* Top Bar Status */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8', background: 'rgba(255,255,255,0.03)', padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
            <ShieldCheck size={14} style={{ color: '#38bdf8' }} />
            <span>PayPal Secure Subscription</span>
          </div>
        </div>

        {/* Hero Section */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(56, 189, 248, 0.12)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            padding: '4px 16px',
            borderRadius: 20,
            color: '#38bdf8',
            fontSize: 11,
            fontWeight: 800,
            marginBottom: 16
          }}>
            <Sparkles size={13} /> TRANSPARENT ATHLETE PRICING
          </div>

          <h1 style={{ fontSize: 38, fontWeight: 900, color: '#fff', margin: '0 0 12px' }}>
            Choose the plan that fits your athletic goals
          </h1>
          <p style={{ fontSize: 15, color: '#94a3b8', maxWidth: '640px', margin: '0 auto' }}>
            Start for free with essential tracking or unlock the full power of the Zenith Ecosystem with Zenith Pro.
          </p>
        </div>

        {/* Plans Comparison Cards (Full Grid Width) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 28, marginBottom: 60 }}>
          {/* Free Plan */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '22px',
            padding: '36px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.8px' }}>
                ZENITH FREE
              </div>
              <div style={{ fontSize: 36, fontWeight: 900, color: '#fff', margin: '8px 0 16px' }}>
                €0 <span style={{ fontSize: 13, fontWeight: 500, color: '#64748b' }}>/ forever free</span>
              </div>
              <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 24, lineHeight: 1.5 }}>
                Perfect for athletes looking to track basic body weight, steps, and daily workouts.
              </p>

              <ul style={{ padding: 0, listStyle: 'none', fontSize: 13, color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: 12, margin: 0 }}>
                <li style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <CheckCircle2 size={16} color="#38bdf8" /> Weight (kg) & Steps tracking
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <CheckCircle2 size={16} color="#38bdf8" /> Basic Cycling Rides & Calendar overview
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <CheckCircle2 size={16} color="#38bdf8" /> Kratos Strength Training Workouts
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <CheckCircle2 size={16} color="#38bdf8" /> Fuel Nutrition & Hydration logger
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#64748b' }}>
                  <XCircle size={16} color="#ef4444" /> Aero AI Route Generator (GPX/TCX Export)
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#64748b' }}>
                  <XCircle size={16} color="#ef4444" /> Vigor Progress Photos & Body Circumferences
                </li>
              </ul>
            </div>

            <div style={{ marginTop: 36 }}>
              <button 
                disabled={true}
                style={{
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#94a3b8',
                  fontWeight: 700,
                  fontSize: 13,
                  padding: '14px',
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
            background: 'linear-gradient(145deg, rgba(56, 189, 248, 0.1) 0%, rgba(18, 18, 24, 0.95) 100%)',
            border: '2px solid #38bdf8',
            borderRadius: '22px',
            padding: '36px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
            boxShadow: '0 15px 40px rgba(56, 189, 248, 0.2)'
          }}>
            <div style={{ position: 'absolute', top: -12, right: 28, background: 'linear-gradient(135deg, #38bdf8, #3b82f6)', color: '#09090b', fontSize: 10, fontWeight: 900, padding: '3px 12px', borderRadius: 12 }}>
              MOST POPULAR
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', color: '#38bdf8', letterSpacing: '0.8px' }}>
                ZENITH PRO
              </div>
              <div style={{ fontSize: 36, fontWeight: 900, color: '#fff', margin: '8px 0 4px' }}>
                €9.99 <span style={{ fontSize: 13, fontWeight: 500, color: '#94a3b8' }}>/ month</span>
              </div>
              <div style={{ fontSize: 11, color: '#38bdf8', fontWeight: 800, marginBottom: 16 }}>
                14-day free trial • Cancel anytime via PayPal
              </div>
              <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 24, lineHeight: 1.5 }}>
                For dedicated athletes seeking maximum insights into route planning, body transformation, and sleep quality.
              </p>

              <ul style={{ padding: 0, listStyle: 'none', fontSize: 13, color: '#f8fafc', display: 'flex', flexDirection: 'column', gap: 12, margin: 0 }}>
                <li style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <CheckCircle2 size={16} color="#38bdf8" /> 🚴 Aero AI Route Generator & GPX/TCX Export
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <CheckCircle2 size={16} color="#38bdf8" /> 📸 Vigor Progress Photos & Side-by-Side Comparator
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <CheckCircle2 size={16} color="#38bdf8" /> 📏 Vigor Body Circumferences (8 Zones)
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <CheckCircle2 size={16} color="#38bdf8" /> ⚖️ Body Fat & Muscle Mass Breakdown
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <CheckCircle2 size={16} color="#38bdf8" /> 🌙 Zenith ML Sleep & Recovery Score Engine
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <CheckCircle2 size={16} color="#38bdf8" /> 🔥 Kratos Muscle Heatmap & Rep Max Sync
                </li>
              </ul>
            </div>

            <div style={{ marginTop: 36 }}>
              {isPro ? (
                <div style={{
                  background: 'rgba(56, 189, 248, 0.15)',
                  border: '1px solid #38bdf8',
                  color: '#38bdf8',
                  fontWeight: 900,
                  fontSize: 13,
                  padding: '14px',
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
                    background: 'linear-gradient(135deg, #38bdf8 0%, #3b82f6 100%)',
                    color: '#09090b',
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
                    boxShadow: '0 8px 20px rgba(56, 189, 248, 0.35)',
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
          borderRadius: '22px',
          padding: '36px',
          marginBottom: 40
        }}>
          <h3 style={{ fontSize: 20, fontWeight: 900, color: '#fff', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
            <HelpCircle size={20} color="#38bdf8" /> Frequently Asked Questions (FAQ)
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 28 }}>
            <div>
              <h4 style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 8 }}>
                How does the 14-day free trial work?
              </h4>
              <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6, margin: 0 }}>
                You can try Zenith Pro completely free for 14 days. If you decide it's not for you, cancel anytime within 14 days with zero charges.
              </p>
            </div>

            <div>
              <h4 style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 8 }}>
                How does payment work via PayPal?
              </h4>
              <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6, margin: 0 }}>
                Payments are processed via the secure PayPal Checkout platform. Your Pro membership is instantly activated across all your devices upon payment.
              </p>
            </div>

            <div>
              <h4 style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 8 }}>
                Can I cancel my subscription at any time?
              </h4>
              <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6, margin: 0 }}>
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
