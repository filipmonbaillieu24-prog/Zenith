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
              background: 'linear-gradient(135deg, #10b981 0%, #38bdf8 100%)',
              padding: '6px 14px',
              borderRadius: '20px',
              color: '#09090b',
              fontWeight: 900,
              fontSize: 11,
              letterSpacing: '1px'
            }}>
              WELCOME TO ZENITH
            </div>
            <Sparkles size={16} color="#34d399" />
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>
            Step {step} of 3
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{ height: 4, width: '100%', background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginBottom: 28, overflow: 'hidden' }}>
          <div style={{ 
            height: '100%', 
            width: `${(step / 3) * 100}%`, 
            background: 'linear-gradient(90deg, #10b981, #38bdf8)', 
            transition: 'width 0.3s ease' 
          }} />
        </div>

        {/* STEP 1: Personal Profile */}
        {step === 1 && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <User size={24} color="#34d399" />
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 900, color: '#ffffff', margin: '0 0 6px' }}>Set up your profile</h2>
              <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Tell us a bit about yourself to personalize your athletic experience.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 800, display: 'block', marginBottom: 6 }}>Full Name</label>
                <input 
                  type="text" 
                  className="zh-profile-input" 
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                  placeholder="Your full name"
                  style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 14px', borderRadius: 10, color: '#fff', fontSize: 13 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 800, display: 'block', marginBottom: 6 }}>Gender</label>
                  <select 
                    className="zh-profile-select" 
                    value={gender} 
                    onChange={e => setGender(e.target.value)}
                    style={{ width: '100%', background: '#121218', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 14px', borderRadius: 10, color: '#fff', fontSize: 13 }}
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 800, display: 'block', marginBottom: 6 }}>Height (cm)</label>
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
                <label style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 800, display: 'block', marginBottom: 6 }}>Date of Birth</label>
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
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <Target size={24} color="#34d399" />
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 900, color: '#ffffff', margin: '0 0 6px' }}>What is your primary goal?</h2>
              <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Select your main athletic focus in Zenith.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { id: 'weight_loss', title: 'Weight Loss & Fat Burn', desc: 'Streamline body weight & fat mass with Vigor and calorie analysis.' },
                { id: 'endurance', title: 'Cycling Endurance & Aero Performance', desc: 'Build stamina, FTP, and custom routes in Zenith Aero.' },
                { id: 'strength', title: 'Muscle Growth & Strength (Kratos)', desc: 'Build muscle mass and balance muscle load in Kratos.' },
                { id: 'general', title: 'General Health & Fitness', desc: 'Maintain sleep quality, daily steps, and overall weight balance.' }
              ].map(item => (
                <div 
                  key={item.id}
                  onClick={() => setGoal(item.id)}
                  style={{ 
                    padding: '14px 16px', 
                    borderRadius: '12px', 
                    border: goal === item.id ? '2px solid #10b981' : '1px solid rgba(255,255,255,0.08)',
                    background: goal === item.id ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.02)',
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
                  {goal === item.id && <CheckCircle2 size={20} color="#34d399" />}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 3: Plan Selection */}
        {step === 3 && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <ShieldCheck size={24} color="#34d399" />
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 900, color: '#ffffff', margin: '0 0 6px' }}>Choose Your Membership</h2>
              <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Unlock the full potential of the Zenith Ecosystem.</p>
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
                <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: '6px 0' }}>€0 <span style={{ fontSize: 11, color: '#64748b' }}>/ free</span></div>
                <ul style={{ fontSize: 10, color: '#94a3b8', padding: 0, listStyle: 'none', margin: '12px 0 0', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <li>✓ Weight & Steps tracking</li>
                  <li>✓ Basic cycling & calendar</li>
                  <li>✓ Basic workouts in Kratos</li>
                  <li style={{ color: '#64748b' }}>✗ Route generator & GPX export</li>
                  <li style={{ color: '#64748b' }}>✗ Progress photos & circumferences</li>
                </ul>
              </div>

              {/* Pro Plan Option */}
              <div 
                onClick={() => setSelectedPlan('pro')}
                style={{ 
                  padding: '20px 16px', 
                  borderRadius: '14px', 
                  border: selectedPlan === 'pro' ? '2px solid #10b981' : '1px solid rgba(16, 185, 129, 0.2)',
                  background: selectedPlan === 'pro' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.04)',
                  cursor: 'pointer',
                  textAlign: 'center',
                  position: 'relative'
                }}
              >
                <div style={{ position: 'absolute', top: -10, right: 12, background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', fontSize: 9, fontWeight: 900, padding: '2px 8px', borderRadius: 10 }}>
                  RECOMMENDED
                </div>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#34d399', letterSpacing: '0.5px' }}>Zenith Pro</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: '6px 0' }}>€9.99 <span style={{ fontSize: 11, color: '#94a3b8' }}>/ month</span></div>
                <div style={{ fontSize: 10, color: '#34d399', fontWeight: 800, marginBottom: 8 }}>14-day free trial</div>
                <ul style={{ fontSize: 10, color: '#e2e8f0', padding: 0, listStyle: 'none', margin: '8px 0 0', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <li>✓ Aero Route Generator & GPX export</li>
                  <li>✓ Progress Photos & Comparator</li>
                  <li>✓ Circumferences (8 zones) & Fat %</li>
                  <li>✓ Colmi Smart Ring Sleep Stages</li>
                  <li>✓ All future Pro features</li>
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
              Back
            </button>
          )}

          {step < 3 ? (
            <button 
              type="button" 
              className="zh-btn-save" 
              onClick={handleNext}
              style={{ flex: 2, height: 44, fontSize: 13, background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: 'none', color: '#fff', borderRadius: 10, cursor: 'pointer', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              Next Step <ArrowRight size={16} />
            </button>
          ) : (
            <button 
              type="button" 
              className="zh-btn-save" 
              onClick={handleFinish}
              disabled={saving}
              style={{ flex: 2, height: 44, fontSize: 13, background: 'linear-gradient(135deg, #10b981 0%, #38bdf8 100%)', border: 'none', color: '#09090b', borderRadius: 10, cursor: 'pointer', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              {saving ? 'Completing...' : selectedPlan === 'pro' ? 'Start 14-Day Free Trial' : 'Complete on Free Plan'}
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
        planName="Zenith Pro (14-Day Free Trial)"
        priceDisplay="€9.99 / month"
      />
    </div>
  );
};
