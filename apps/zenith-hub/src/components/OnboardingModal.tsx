import React, { useState } from 'react';
import { Sparkles, CheckCircle2, ArrowRight, User, Target, ShieldCheck, Ruler, Scale } from 'lucide-react';
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
  const [name, setName] = useState(initialName || 'Athlete');
  const [gender, setGender] = useState('male');
  const [birthDate, setBirthDate] = useState('1995-01-01');
  
  // Unit System State
  const [unitSystem, setUnitSystem] = useState<'metric' | 'imperial'>('metric');
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>('kg');
  
  const [height, setHeight] = useState('180'); // cm or inches
  const [initialWeight, setInitialWeight] = useState('75'); // kg or lbs
  const [goal, setGoal] = useState('general');
  const [selectedPlan, setSelectedPlan] = useState<'free' | 'pro'>('pro');
  const [saving, setSaving] = useState(false);
  const [showPayPalModal, setShowPayPalModal] = useState(false);

  if (!isOpen) return null;

  const handleNext = () => {
    if (step === 1 && !name.trim()) {
      alert('Please enter your full name.');
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

  const executeSaveOnboarding = async (isProChosen: boolean) => {
    try {
      setSaving(true);

      // Convert height to cm if imperial inches entered
      const numericHeight = parseFloat(height) || 175;
      const heightInCm = unitSystem === 'imperial' ? Math.round(numericHeight * 2.54) : numericHeight;

      // Convert weight to kg for standard internal storage if lbs entered
      const numericWeight = parseFloat(initialWeight) || 75;
      const weightInKg = weightUnit === 'lbs' ? parseFloat((numericWeight * 0.453592).toFixed(1)) : numericWeight;

      const profilePayload = {
        id: userId,
        name: name.trim(),
        gender,
        birth_date: birthDate || null,
        height_cm: heightInCm || null,
        training_goal: goal,
        unit_system: unitSystem,
        weight_unit: weightUnit,
        updated_at: new Date().toISOString()
      };

      // Save to profiles table
      const { error: profError } = await supabase
        .from('profiles')
        .upsert(profilePayload);

      if (profError) {
        console.warn('Profiles table upsert warning:', profError.message);
      }

      // Also log initial weight measurement if provided
      if (weightInKg > 0) {
        await supabase
          .from('vigor_weight')
          .insert({
            user_id: userId,
            weight: weightInKg,
            logged_at: new Date().toISOString()
          });
      }

      // Update user metadata
      await supabase.auth.updateUser({
        data: {
          name: name.trim(),
          unit_system: unitSystem,
          weight_unit: weightUnit,
          onboarding_completed: true,
          is_pro: isProChosen
        }
      });

      await onCompleted(profilePayload, isProChosen);
    } catch (err: any) {
      console.error('Error saving onboarding data:', err);
      alert('Error saving profile: ' + (err.message || String(err)));
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
        background: 'rgba(5, 5, 8, 0.88)', 
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)'
      }}
    >
      <div 
        className="modal-content animate-slide-up" 
        style={{ 
          maxWidth: '580px', 
          width: '92%',
          background: 'linear-gradient(145deg, #121218 0%, #1a1a26 100%)',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.85)',
          borderRadius: '22px',
          padding: '32px'
        }}
      >
        {/* Step Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ 
              background: 'linear-gradient(135deg, #38bdf8 0%, #3b82f6 100%)',
              padding: '6px 14px',
              borderRadius: '20px',
              color: '#09090b',
              fontWeight: 900,
              fontSize: 11,
              letterSpacing: '1px'
            }}>
              WELCOME TO ZENITH
            </div>
            <Sparkles size={16} color="#38bdf8" />
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
            background: 'linear-gradient(90deg, #38bdf8, #3b82f6)', 
            transition: 'width 0.3s ease' 
          }} />
        </div>

        {/* STEP 1: Personal Profile & Unit Preferences */}
        {step === 1 && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <User size={24} color="#38bdf8" />
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 900, color: '#ffffff', margin: '0 0 6px' }}>Set Up Your Profile & Units</h2>
              <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Configure your personal preferences for length, distance, and weight tracking.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Name */}
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

              {/* Unit System Selectors (Imperial vs Metric & KG vs LBS) */}
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Ruler size={13} /> Unit System Preferences
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {/* Weight Unit Toggle */}
                  <div>
                    <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, display: 'block', marginBottom: 6 }}>
                      <Scale size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Weight Unit
                    </label>
                    <div style={{ display: 'flex', background: '#09090b', borderRadius: 8, padding: 3, border: '1px solid rgba(255,255,255,0.08)' }}>
                      <button
                        type="button"
                        onClick={() => setWeightUnit('kg')}
                        style={{
                          flex: 1,
                          padding: '6px',
                          border: 'none',
                          borderRadius: 6,
                          background: weightUnit === 'kg' ? '#38bdf8' : 'transparent',
                          color: weightUnit === 'kg' ? '#09090b' : '#94a3b8',
                          fontWeight: 800,
                          fontSize: 12,
                          cursor: 'pointer'
                        }}
                      >
                        KG (kg)
                      </button>
                      <button
                        type="button"
                        onClick={() => setWeightUnit('lbs')}
                        style={{
                          flex: 1,
                          padding: '6px',
                          border: 'none',
                          borderRadius: 6,
                          background: weightUnit === 'lbs' ? '#38bdf8' : 'transparent',
                          color: weightUnit === 'lbs' ? '#09090b' : '#94a3b8',
                          fontWeight: 800,
                          fontSize: 12,
                          cursor: 'pointer'
                        }}
                      >
                        LBS (lbs)
                      </button>
                    </div>
                  </div>

                  {/* System Toggle (Metric vs Imperial) */}
                  <div>
                    <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, display: 'block', marginBottom: 6 }}>
                      System Measurement
                    </label>
                    <div style={{ display: 'flex', background: '#09090b', borderRadius: 8, padding: 3, border: '1px solid rgba(255,255,255,0.08)' }}>
                      <button
                        type="button"
                        onClick={() => setUnitSystem('metric')}
                        style={{
                          flex: 1,
                          padding: '6px',
                          border: 'none',
                          borderRadius: 6,
                          background: unitSystem === 'metric' ? '#38bdf8' : 'transparent',
                          color: unitSystem === 'metric' ? '#09090b' : '#94a3b8',
                          fontWeight: 800,
                          fontSize: 12,
                          cursor: 'pointer'
                        }}
                      >
                        Metric (cm/km)
                      </button>
                      <button
                        type="button"
                        onClick={() => setUnitSystem('imperial')}
                        style={{
                          flex: 1,
                          padding: '6px',
                          border: 'none',
                          borderRadius: 6,
                          background: unitSystem === 'imperial' ? '#38bdf8' : 'transparent',
                          color: unitSystem === 'imperial' ? '#09090b' : '#94a3b8',
                          fontWeight: 800,
                          fontSize: 12,
                          cursor: 'pointer'
                        }}
                      >
                        Imperial (in/mi)
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Gender, Height & Initial Weight */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
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
                  <label style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 800, display: 'block', marginBottom: 6 }}>
                    Height ({unitSystem === 'metric' ? 'cm' : 'inches'})
                  </label>
                  <input 
                    type="number" 
                    className="zh-profile-input" 
                    value={height} 
                    onChange={e => setHeight(e.target.value)} 
                    placeholder={unitSystem === 'metric' ? '180' : '71'}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 14px', borderRadius: 10, color: '#fff', fontSize: 13 }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 800, display: 'block', marginBottom: 6 }}>
                    Current Weight ({weightUnit})
                  </label>
                  <input 
                    type="number" 
                    step="0.1"
                    className="zh-profile-input" 
                    value={initialWeight} 
                    onChange={e => setInitialWeight(e.target.value)} 
                    placeholder={weightUnit === 'kg' ? '75.0' : '165.0'}
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
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <Target size={24} color="#38bdf8" />
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 900, color: '#ffffff', margin: '0 0 6px' }}>What is your primary goal?</h2>
              <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Select your main athletic focus in Zenith.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { id: 'weight_loss', title: 'Weight Loss & Fat Burn', desc: 'Track body weight & fat percentage with Vigor and calorie guidance.' },
                { id: 'endurance', title: 'Cycling Endurance & Aero Performance', desc: 'Build stamina, FTP, and custom routes in Zenith Aero.' },
                { id: 'strength', title: 'Muscle Growth & Strength (Kratos)', desc: 'Build muscle mass and balance muscle fatigue in Kratos.' },
                { id: 'general', title: 'General Health & Fitness', desc: 'Track sleep quality, daily steps, and overall weight balance.' }
              ].map(item => (
                <div 
                  key={item.id}
                  onClick={() => setGoal(item.id)}
                  style={{ 
                    padding: '14px 16px', 
                    borderRadius: '12px', 
                    border: goal === item.id ? '2px solid #38bdf8' : '1px solid rgba(255,255,255,0.08)',
                    background: goal === item.id ? 'rgba(56, 189, 248, 0.1)' : 'rgba(255,255,255,0.02)',
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
                  {goal === item.id && <CheckCircle2 size={20} color="#38bdf8" />}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 3: Membership Plan Selection */}
        {step === 3 && (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <ShieldCheck size={24} color="#38bdf8" />
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
                  border: selectedPlan === 'pro' ? '2px solid #38bdf8' : '1px solid rgba(56, 189, 248, 0.2)',
                  background: selectedPlan === 'pro' ? 'rgba(56, 189, 248, 0.12)' : 'rgba(56, 189, 248, 0.04)',
                  cursor: 'pointer',
                  textAlign: 'center',
                  position: 'relative'
                }}
              >
                <div style={{ position: 'absolute', top: -10, right: 12, background: 'linear-gradient(135deg, #38bdf8, #3b82f6)', color: '#09090b', fontSize: 9, fontWeight: 900, padding: '2px 8px', borderRadius: 10 }}>
                  RECOMMENDED
                </div>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#38bdf8', letterSpacing: '0.5px' }}>Zenith Pro</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: '6px 0' }}>€9.99 <span style={{ fontSize: 11, color: '#94a3b8' }}>/ month</span></div>
                <div style={{ fontSize: 10, color: '#38bdf8', fontWeight: 800, marginBottom: 8 }}>14-day free trial</div>
                <ul style={{ fontSize: 10, color: '#e2e8f0', padding: 0, listStyle: 'none', margin: '8px 0 0', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <li>✓ Aero AI Route Generator & GPX export</li>
                  <li>✓ Progress Photos & Comparator</li>
                  <li>✓ Body Circumferences (8 zones) & Fat %</li>
                  <li>✓ Zenith ML Sleep & Recovery Score Engine</li>
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
              style={{ flex: 2, height: 44, fontSize: 13, background: 'linear-gradient(135deg, #38bdf8 0%, #3b82f6 100%)', border: 'none', color: '#09090b', borderRadius: 10, cursor: 'pointer', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              Next Step <ArrowRight size={16} />
            </button>
          ) : (
            <button 
              type="button" 
              className="zh-btn-save" 
              onClick={handleFinish}
              disabled={saving}
              style={{ flex: 2, height: 44, fontSize: 13, background: 'linear-gradient(135deg, #38bdf8 0%, #3b82f6 100%)', border: 'none', color: '#09090b', borderRadius: 10, cursor: 'pointer', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
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
