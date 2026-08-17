import React, { useState } from 'react';
import { Sparkles, CheckCircle2, ArrowRight, User, Target, ShieldCheck } from 'lucide-react';
import { supabase } from '../utils/supabaseClient';
import { PayPalModal } from './PayPalModal';

interface OnboardingModalProps {
  isOpen: boolean;
  userId: string;
  userEmail: string;
  initialName?: string;
  onCompleted: (updatedProfile: any, isProChosen: boolean) => Promise<void>;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  userId,
  userEmail,
  initialName = '',
  onCompleted,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState(initialName || 'Atleet');
  const [gender, setGender] = useState('male');
  const [birthDate, setBirthDate] = useState('1995-01-01');
  const [height, setHeight] = useState('180');
  const [goal, setGoal] = useState('general');
  const [selectedPlan, setSelectedPlan] = useState<'free' | 'pro'>('pro');
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleNext = () => {
    if (step === 1 && !name.trim()) {
      alert('Vul a.u.b. je naam in.');
      return;
    }
    if (step < 3) {
      setStep((prev) => (prev + 1) as any);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep((prev) => (prev - 1) as any);
    }
  };

  const [showPayPalModal, setShowPayPalModal] = useState(false);

  const executeSaveOnboarding = async (isProChosen: boolean) => {
    try {
      setSaving(true);

      const profilePayload = {
        id: userId,
        name: name.trim(),
        gender,
        birth_date: birthDate,
        height_cm: parseFloat(height) || 175,
        training_goal: goal,
        updated_at: new Date().toISOString()
      };

      // Save to profiles table
      const { error: profError } = await supabase
        .from('profiles')
        .upsert(profilePayload);

      if (profError) throw profError;

      // Update user metadata
      await supabase.auth.updateUser({
        data: {
          name: name.trim(),
          onboarding_completed: true,
          is_pro: isProChosen
        }
      });

      await onCompleted(profilePayload, isProChosen);
    } catch (err: any) {
      console.error('Fout bij opslaan onboarding:', err);
      alert('Fout bij opslaan: ' + (err.message || String(err)));
    } finally {
      setSaving(false);
    }
  };

  const handleFinish = async () => {
    const isFounder = userEmail.toLowerCase() === 'filip.monbaillieu.24@gmail.com';
    if (selectedPlan === 'pro' && !isFounder) {
      setShowPayPalModal(true);
    } else {
      await executeSaveOnboarding(isFounder || selectedPlan === 'pro');
    }
  };

  return (
    <div 
      className="modal-overlay" 
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
        zIndex: 99999, 
        background: 'rgba(5, 5, 8, 0.85)', 
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)'
      }}
    >
      <div 
        className="modal-content animate-slide-up" 
        style={{ 
          maxWidth: '560px', 
          width: '90%',
          background: 'linear-gradient(145deg, #121218 0%, #1a1a26 100%)',
          border: '1px solid rgba(168, 85, 247, 0.3)',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8)',
          borderRadius: '20px',
          padding: '32px'
        }}
      >
        {/* Step Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ 
              background: 'linear-gradient(135deg, #6c5ce7 0%, #a855f7 100%)',
              padding: '6px 14px',
              borderRadius: '20px',
              color: '#ffffff',
              fontWeight: 900,
              fontSize: 11,
              letterSpacing: '1px'
            }}>
              WELKOM BIJ ZENITH
            </div>
            <Sparkles size={16} color="#a855f7" />
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>
            Stap {step} van 3
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{ height: 4, width: '100%', background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginBottom: 28, overflow: 'hidden' }}>
          <div style={{ 
            height: '100%', 
            width: `${(step / 3) * 100}%`, 
            background: 'linear-gradient(90deg, #6c5ce7, #a855f7)', 
            transition: 'width 0.3s ease' 
          }} />
        </div>

        {/* STEP 1: Personal Profile */}
        {step === 1 && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(168, 85, 247, 0.12)', border: '1px solid rgba(168, 85, 247, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <User size={24} color="#a855f7" />
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 900, color: '#ffffff', margin: '0 0 6px' }}>Stel je profiel in</h2>
              <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Laat ons weten wie je bent om je ervaring te personaliseren.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 800, display: 'block', marginBottom: 6 }}>Naam</label>
                <input 
                  type="text" 
                  className="zh-profile-input" 
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                  placeholder="Je volledige naam"
                  style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 14px', borderRadius: 10, color: '#fff', fontSize: 13 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 800, display: 'block', marginBottom: 6 }}>Geslacht</label>
                  <select 
                    className="zh-profile-select" 
                    value={gender} 
                    onChange={e => setGender(e.target.value)}
                    style={{ width: '100%', background: '#121218', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 14px', borderRadius: 10, color: '#fff', fontSize: 13 }}
                  >
                    <option value="male">Man</option>
                    <option value="female">Vrouw</option>
                    <option value="other">Anders</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 800, display: 'block', marginBottom: 6 }}>Lengte (cm)</label>
                  <input 
                    type="number" 
                    className="zh-profile-input" 
                    value={height} 
                    onChange={e => setHeight(e.target.value)} 
                    placeholder="180"
                    style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 14px', borderRadius: 10, color: '#fff', fontSize: 13 }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 800, display: 'block', marginBottom: 6 }}>Geboortedatum</label>
                <input 
                  type="date" 
                  className="zh-profile-input" 
                  value={birthDate} 
                  onChange={e => setBirthDate(e.target.value)} 
                  style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 14px', borderRadius: 10, color: '#fff', fontSize: 13 }}
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Primary Goal */}
        {step === 2 && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(168, 85, 247, 0.12)', border: '1px solid rgba(168, 85, 247, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <Target size={24} color="#a855f7" />
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 900, color: '#ffffff', margin: '0 0 6px' }}>Wat is je hoofddoel?</h2>
              <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Selecteer je voornaamste trainingsdoel binnen Zenith.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { id: 'weight_loss', title: 'Gewichtsverlies & Vetverbranding', desc: 'Gewicht en vetmassa stroomlijnen met Vigor en calorie-analyse.' },
                { id: 'endurance', title: 'Fietsconditie & Aero Prestaties', desc: 'Uithoudingsvermogen, FTP en routes bouwen in Zenith Aero.' },
                { id: 'strength', title: 'Spieropbouw & Kracht (Kratos)', desc: 'Spiermassa vergroten en spiergroepen uitbalanceren in Kratos.' },
                { id: 'general', title: 'Algemene Gezondheid & Fitheid', desc: 'Slaap, beweging en gewicht in balans houden.' }
              ].map(item => (
                <div 
                  key={item.id}
                  onClick={() => setGoal(item.id)}
                  style={{ 
                    padding: '14px 16px', 
                    borderRadius: '12px', 
                    border: goal === item.id ? '2px solid #a855f7' : '1px solid rgba(255,255,255,0.08)',
                    background: goal === item.id ? 'rgba(168, 85, 247, 0.1)' : 'rgba(255,255,255,0.02)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: '#fff' }}>{item.title}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{item.desc}</div>
                  </div>
                  {goal === item.id && <CheckCircle2 size={20} color="#a855f7" />}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 3: Plan Selection */}
        {step === 3 && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(168, 85, 247, 0.12)', border: '1px solid rgba(168, 85, 247, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <ShieldCheck size={24} color="#a855f7" />
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 900, color: '#ffffff', margin: '0 0 6px' }}>Kies je Lidmaatschap</h2>
              <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Ontgrendel het volledige potentieel van de Zenith suite.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              {/* Free Plan Option */}
              <div 
                onClick={() => setSelectedPlan('free')}
                style={{ 
                  padding: '20px 16px', 
                  borderRadius: '14px', 
                  border: selectedPlan === 'free' ? '2px solid #64748b' : '1px solid rgba(255,255,255,0.08)',
                  background: selectedPlan === 'free' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255,255,255,0.02)',
                  cursor: 'pointer',
                  textAlign: 'center',
                  position: 'relative'
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.5px' }}>Zenith Free</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: '6px 0' }}>€0 <span style={{ fontSize: 11, color: '#64748b' }}>/ gratis</span></div>
                <ul style={{ fontSize: 10, color: '#94a3b8', padding: 0, listStyle: 'none', margin: '12px 0 0', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <li>✓ Gewichts & Stappen tracking</li>
                  <li>✓ Basisfietsritten & kalender</li>
                  <li>✓ Basis workouts in Kratos</li>
                  <li style={{ color: '#64748b' }}>✗ Routegenerator & GPX export</li>
                  <li style={{ color: '#64748b' }}>✗ Voortgangsfoto's & omtrekken</li>
                </ul>
              </div>

              {/* Pro Plan Option */}
              <div 
                onClick={() => setSelectedPlan('pro')}
                style={{ 
                  padding: '20px 16px', 
                  borderRadius: '14px', 
                  border: selectedPlan === 'pro' ? '2px solid #a855f7' : '1px solid rgba(168, 85, 247, 0.2)',
                  background: selectedPlan === 'pro' ? 'rgba(168, 85, 247, 0.12)' : 'rgba(168, 85, 247, 0.04)',
                  cursor: 'pointer',
                  textAlign: 'center',
                  position: 'relative'
                }}
              >
                <div style={{ position: 'absolute', top: -10, right: 12, background: 'linear-gradient(135deg, #a855f7, #7e22ce)', color: '#fff', fontSize: 9, fontWeight: 900, padding: '2px 8px', borderRadius: 10 }}>
                  AANBEVOLEN
                </div>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#c084fc', letterSpacing: '0.5px' }}>Zenith Pro</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: '6px 0' }}>€9,99 <span style={{ fontSize: 11, color: '#94a3b8' }}>/ maand</span></div>
                <div style={{ fontSize: 10, color: '#39ff14', fontWeight: 800, marginBottom: 8 }}>14 dagen gratis proefperiode</div>
                <ul style={{ fontSize: 10, color: '#e2e8f0', padding: 0, listStyle: 'none', margin: '8px 0 0', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <li>✓ Aero Routegenerator & GPX export</li>
                  <li>✓ Voortgangsfoto's & Vergelijker</li>
                  <li>✓ Omtrekken (8 zones) & Vet %</li>
                  <li>✓ Colmi Smart Ring Slaapfases</li>
                  <li>✓ Alle toekomstige Pro functies</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          {step > 1 && (
            <button 
              type="button" 
              className="zh-btn-cancel" 
              onClick={handleBack}
              disabled={saving}
              style={{ flex: 1, height: 44, fontSize: 13, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#cbd5e1', borderRadius: 10, cursor: 'pointer', fontWeight: 700 }}
            >
              Vorige
            </button>
          )}

          {step < 3 ? (
            <button 
              type="button" 
              className="zh-btn-save" 
              onClick={handleNext}
              style={{ flex: 2, height: 44, fontSize: 13, background: 'linear-gradient(135deg, #6c5ce7 0%, #a855f7 100%)', border: 'none', color: '#fff', borderRadius: 10, cursor: 'pointer', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              Volgende Stap <ArrowRight size={16} />
            </button>
          ) : (
            <button 
              type="button" 
              className="zh-btn-save" 
              onClick={handleFinish}
              disabled={saving}
              style={{ flex: 2, height: 44, fontSize: 13, background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)', border: 'none', color: '#fff', borderRadius: 10, cursor: 'pointer', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              {saving ? 'Afronden...' : selectedPlan === 'pro' ? 'Start 14 Dagen Gratis Proefperiode' : 'Afronden op Gratis Plan'}
            </button>
          )}
        </div>
      </div>

      <PayPalModal
        isOpen={showPayPalModal}
        onClose={() => setShowPayPalModal(false)}
        onSuccess={async () => {
          await executeSaveOnboarding(true);
        }}
        planName="Zenith Pro (14 Dagen Gratis Proefperiode)"
        priceDisplay="€9,99 / maand"
      />
    </div>
  );
};
