import React, { useEffect, useState, useMemo } from 'react';
import { User, AlertCircle, Check, Sparkles, CreditCard, ShieldCheck, CheckCircle2, XCircle, Zap, Target, Bike, Camera, Ruler, Scale, Moon, Dumbbell, Footprints } from 'lucide-react';
import { supabase } from '../../utils/supabaseClient';
import { activateProTrial, isFounderEmail } from '@zenith/shared';
import { PayPalModal } from '../../components/PayPalModal';
import './ProfilePage.css';
import './ZenithHub.css';

interface ProfilePageProps {
  initialProfile: any;
  userId: string;
  userEmail?: string;
  onBack?: () => void;
  onSave: (updatedProfile: any) => Promise<void>;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({
  initialProfile,
  userId,
  userEmail = '',
  onBack,
  onSave,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'subscription'>('profile');
  const [name, setName] = useState(initialProfile.name || '');
  const [gender, setGender] = useState(initialProfile.gender || '');
  const [birthDate, setBirthDate] = useState(initialProfile.birthDate || '');
  const [height, setHeight] = useState<string>(initialProfile.height?.toString() || '');
  
  const [unitSystem, setUnitSystem] = useState<'metric' | 'imperial'>(initialProfile.unit_system || 'metric');
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>(initialProfile.weight_unit || 'kg');

  const [latestWeight, setLatestWeight] = useState<number | null>(null);
  const [weightDate, setWeightDate] = useState<string | null>(null);

  // Zenith Health Goals states
  const [targetWeight, setTargetWeight] = useState<string>('');
  const [targetSteps, setTargetSteps] = useState<string>('10000');
  const [targetSleep, setTargetSleep] = useState<string>('8');
  const [targetRate, setTargetRate] = useState<string>('0.5');
  const [dietType, setDietType] = useState<string>('balanced');

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Compute Pro Status
  const isFounder = useMemo(() => {
    return isFounderEmail(userEmail);
  }, [userEmail]);

  const [isProUser, setIsProUser] = useState<boolean>(isFounder || initialProfile.isPro === true);

  // Fetch Vigor Profile & Fuel Profile Health Goals
  useEffect(() => {
    const fetchGoals = async () => {
      try {
        // Fetch Vigor Profile
        const { data: vigorData, error: vError } = await supabase
          .from('vigor_profile')
          .select('*')
          .eq('user_id', userId)
          .single();

        if (vError && vError.code !== 'PGRST116') throw vError;
        if (vigorData) {
          setTargetWeight(vigorData.target_weight?.toString() || '');
          setTargetSteps(vigorData.target_steps?.toString() || '10000');
          setTargetSleep(vigorData.target_sleep_hours?.toString() || '8');
        }

        // Fetch Fuel Profile
        const { data: fuelData, error: fError } = await supabase
          .from('fuel_profile')
          .select('*')
          .eq('user_id', userId)
          .single();

        if (fError && fError.code !== 'PGRST116') throw fError;
        if (fuelData) {
          // Sync target weight if Vigor didn't have it set
          if (!vigorData?.target_weight && fuelData.target_weight) {
            setTargetWeight(fuelData.target_weight.toString());
          }
          setTargetRate(fuelData.target_rate_kg_per_week?.toString() || '0.5');
          setDietType(fuelData.diet_type || 'balanced');
        }
      } catch (err) {
        console.error('Error fetching user goals:', err);
      }
    };
    fetchGoals();
  }, [userId]);

  // Fetch the latest weight measurement from Vigor weight logs & sync Pro metadata
  useEffect(() => {
    const fetchLatestWeight = async () => {
      try {
        const { data, error } = await supabase
          .from('vigor_weight')
          .select('weight, logged_at')
          .eq('user_id', userId)
          .order('logged_at', { ascending: false })
          .limit(1);

        if (error) throw error;

        if (data && data.length > 0) {
          setLatestWeight(data[0].weight);
          const dateStr = new Date(data[0].logged_at).toLocaleDateString('en-US', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
          setWeightDate(dateStr);
        }
      } catch (err) {
        console.error('Could not fetch latest weight from Vigor:', err);
      }
    };

    fetchLatestWeight();
  }, [userId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    // Validate inputs
    if (!name.trim()) {
      setErrorMsg('Name cannot be empty.');
      setSaving(false);
      return;
    }

    if (height && (parseFloat(height) < 50 || parseFloat(height) > 250)) {
      setErrorMsg('Please enter a valid height (between 50 and 250 cm).');
      setSaving(false);
      return;
    }

    try {
      const updatedProfile = {
        ...initialProfile,
        name: name.trim(),
        gender: gender || undefined,
        birthDate: birthDate || undefined,
        height: height ? parseFloat(height) : undefined,
        unit_system: unitSystem,
        weight_unit: weightUnit,
        weight: latestWeight !== null ? latestWeight : initialProfile.weight
      };

      await onSave(updatedProfile);

      const parsedWeight = targetWeight ? parseFloat(targetWeight) : null;

      // 2. Save Vigor Profile Goals
      const { error: vigorErr } = await supabase
        .from('vigor_profile')
        .upsert({
          user_id: userId,
          target_weight: parsedWeight,
          target_steps: targetSteps ? parseInt(targetSteps) : null,
          target_sleep_hours: targetSleep ? parseFloat(targetSleep) : null,
          updated_at: new Date().toISOString()
        });
      if (vigorErr) throw vigorErr;

      // 3. Save Fuel Profile Goals
      const { error: fuelErr } = await supabase
        .from('fuel_profile')
        .upsert({
          user_id: userId,
          target_weight: parsedWeight,
          target_rate_kg_per_week: targetRate ? parseFloat(targetRate) : 0.5,
          diet_type: dietType,
          height: height ? parseFloat(height) : null,
          last_calculated_at: new Date().toISOString()
        });
      if (fuelErr) throw fuelErr;

      setSuccessMsg('Profile and Health Goals successfully updated!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error updating profile.');
    } finally {
      setSaving(false);
    }
  };

  const [showPayPalModal, setShowPayPalModal] = useState(false);

  const handleActivateProAfterPayment = async () => {
    try {
      setSaving(true);
      await activateProTrial(supabase);
      setIsProUser(true);
      setSuccessMsg('Gefeliciteerd! Je betaling via PayPal is verwerkt. Zenith Pro is geactiveerd.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg('Error activating Pro: ' + (err.message || String(err)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="zh-hub-container">
      {/* Background radial glow */}
      <div className="zh-hub-glow" style={{ background: 'radial-gradient(circle at 50% 30%, rgba(168, 85, 247, 0.08) 0%, transparent 60%)' }} />

      <header className="zh-hub-header animate-slide-down">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#64748b' }}>
          <Sparkles size={12} style={{ color: '#38bdf8' }} />
          <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Personal Profile & Subscription
          </span>
        </div>
      </header>

      {/* Profile & Subscription Navigation Sub-tabs */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, justifyContent: 'center' }} className="animate-slide-down">
        <button
          onClick={() => setActiveTab('profile')}
          style={{
            background: activeTab === 'profile' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.03)',
            border: activeTab === 'profile' ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.08)',
            padding: '10px 20px',
            borderRadius: 12,
            color: activeTab === 'profile' ? '#34d399' : '#94a3b8',
            fontWeight: 800,
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            transition: 'all 0.2s ease',
            fontFamily: 'inherit'
          }}
        >
          <User size={16} /> Personal Profile
        </button>

        <button
          onClick={() => setActiveTab('subscription')}
          style={{
            background: activeTab === 'subscription' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.03)',
            border: activeTab === 'subscription' ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.08)',
            padding: '10px 20px',
            borderRadius: 12,
            color: activeTab === 'subscription' ? '#34d399' : '#94a3b8',
            fontWeight: 800,
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            transition: 'all 0.2s ease',
            fontFamily: 'inherit'
          }}
        >
          <CreditCard size={16} /> Subscription & Pro
          {isFounder ? (
            <span style={{ background: '#7e22ce', color: '#fff', fontSize: 9, padding: '2px 6px', borderRadius: 4 }}>FOUNDER</span>
          ) : isProUser ? (
            <span style={{ background: '#34d399', color: '#09090b', fontSize: 9, padding: '2px 6px', borderRadius: 4, fontWeight: 900 }}>PRO</span>
          ) : (
            <span style={{ background: '#64748b', color: '#fff', fontSize: 9, padding: '2px 6px', borderRadius: 4 }}>FREE</span>
          )}
        </button>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="zh-notification success" style={{ maxWidth: 640, margin: '0 auto 20px' }}>
          <Check size={16} style={{ flexShrink: 0 }} />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="zh-notification error" style={{ maxWidth: 640, margin: '0 auto 20px' }}>
          <AlertCircle size={16} style={{ flexShrink: 0 }} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* TAB 1: Profile Basics */}
      {activeTab === 'profile' && (
        <form onSubmit={handleSubmit} className="zh-profile-form" style={{ display: 'block' }}>
          <div className="zh-profile-grid animate-slide-up">
            {/* Card 1: Personal Information */}
            <div className="zh-profile-card">
              <h2 className="zh-profile-card-title">
                <User size={16} style={{ color: '#10b981' }} />
                Personal Information
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Name */}
                <div className="zh-profile-row">
                  <label htmlFor="profileName">Full Name</label>
                  <input
                    id="profileName"
                    type="text"
                    className="zh-profile-input"
                    placeholder="Your full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>

                {/* Gender */}
                <div className="zh-profile-row">
                  <label htmlFor="profileGender">Gender</label>
                  <select
                    id="profileGender"
                    className="zh-profile-select"
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                  >
                    <option value="">Not specified</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                {/* Date of Birth */}
                <div className="zh-profile-row">
                  <label htmlFor="profileBirth">Date of Birth</label>
                  <input
                    id="profileBirth"
                    type="date"
                    className="zh-profile-input"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    max={new Date().toISOString().split('T')[0]}
                  />
                </div>

                {/* Height */}
                <div className="zh-profile-row">
                  <label htmlFor="profileHeight">Height <span>(cm)</span></label>
                  <input
                    id="profileHeight"
                    type="number"
                    min="50"
                    max="250"
                    className="zh-profile-input"
                    placeholder="—"
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                  />
                </div>

                {/* Weight Unit */}
                <div className="zh-profile-row">
                  <label htmlFor="profileWeightUnit">Weight Unit</label>
                  <select
                    id="profileWeightUnit"
                    className="zh-profile-select"
                    value={weightUnit}
                    onChange={(e) => setWeightUnit(e.target.value as 'kg' | 'lbs')}
                  >
                    <option value="kg">Kilograms (kg)</option>
                    <option value="lbs">Pounds (lbs)</option>
                  </select>
                </div>

                {/* Unit System */}
                <div className="zh-profile-row">
                  <label htmlFor="profileUnitSystem">System Measurement</label>
                  <select
                    id="profileUnitSystem"
                    className="zh-profile-select"
                    value={unitSystem}
                    onChange={(e) => setUnitSystem(e.target.value as 'metric' | 'imperial')}
                  >
                    <option value="metric">Metric (cm / km)</option>
                    <option value="imperial">Imperial (inches / miles)</option>
                  </select>
                </div>

                {/* Weight (Read-only, linked to Vigor) */}
                <div className="zh-profile-row">
                  <label>Weight <span>(kg)</span></label>
                  <input
                    type="text"
                    className="zh-profile-input"
                    disabled
                    value={latestWeight !== null ? `${latestWeight} kg` : 'No measurement yet'}
                  />
                  <p className="zh-profile-note">
                    {latestWeight !== null ? (
                      <>
                        Last logged: <strong>{latestWeight} kg</strong> on {weightDate} via Zenith Vigor.
                      </>
                    ) : (
                      <>
                        No weight log found yet. Log a measurement using the <strong>Vigor</strong> extension.
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Card 2: Health Goals & Devices */}
            <div className="zh-profile-card">
              <h2 className="zh-profile-card-title">
                <Target size={16} style={{ color: '#10b981' }} />
                Zenith Health Goals
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Target Weight */}
                <div className="zh-profile-row">
                  <label htmlFor="goalWeight">Target Weight <span>(kg)</span></label>
                  <input
                    id="goalWeight"
                    type="number"
                    step="0.1"
                    className="zh-profile-input"
                    placeholder="e.g. 78.0"
                    value={targetWeight}
                    onChange={(e) => setTargetWeight(e.target.value)}
                  />
                </div>

                {/* Step Goal */}
                <div className="zh-profile-row">
                  <label htmlFor="goalSteps">Daily Step Goal</label>
                  <input
                    id="goalSteps"
                    type="number"
                    className="zh-profile-input"
                    value={targetSteps}
                    onChange={(e) => setTargetSteps(e.target.value)}
                  />
                </div>

                {/* Sleep Goal */}
                <div className="zh-profile-row">
                  <label htmlFor="goalSleep">Sleep Goal <span>(hours)</span></label>
                  <input
                    id="goalSleep"
                    type="number"
                    step="0.5"
                    className="zh-profile-input"
                    value={targetSleep}
                    onChange={(e) => setTargetSleep(e.target.value)}
                  />
                </div>

                {/* targetRate (deficit/surplus target speed) */}
                <div className="zh-profile-row">
                  <label htmlFor="goalRate">Weekly Target Rate <span>(kg/week)</span></label>
                  <input
                    id="goalRate"
                    type="number"
                    step="0.05"
                    min="0.1"
                    max="1.5"
                    className="zh-profile-input"
                    value={targetRate}
                    onChange={(e) => setTargetRate(e.target.value)}
                  />
                </div>

                {/* dietType */}
                <div className="zh-profile-row">
                  <label htmlFor="goalDiet">Diet Preference</label>
                  <select
                    id="goalDiet"
                    className="zh-profile-select"
                    value={dietType}
                    onChange={(e) => setDietType(e.target.value)}
                  >
                    <option value="balanced">Balanced (2.0g/kg Pro, moderate Carbs/Fat)</option>
                    <option value="high-carb">High-Carb (1.7g/kg Pro, high Carbs)</option>
                    <option value="low-carb">Low-Carb (2.3g/kg Pro, low Carbs)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="zh-profile-actions" style={{ maxWidth: 1000, margin: '24px auto 0' }}>
            <button
              type="button"
              className="zh-btn-cancel"
              onClick={onBack}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="zh-btn-save"
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: Subscription & Zenith Pro */}
      {activeTab === 'subscription' && (
        <div style={{ maxWidth: 760, margin: '0 auto' }} className="animate-slide-up">
          {/* Active Status Banner */}
          <div style={{ 
            background: isFounder 
              ? 'linear-gradient(135deg, rgba(126, 34, 206, 0.15) 0%, rgba(9, 9, 11, 0.95) 100%)' 
              : isProUser 
              ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(9, 9, 11, 0.95) 100%)'
              : 'linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0%, rgba(9, 9, 11, 0.95) 100%)',
            border: isFounder || isProUser ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '24px',
            marginBottom: 24,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', color: '#34d399', letterSpacing: '0.8px' }}>
                CURRENT SUBSCRIPTION
              </div>
              <h2 style={{ fontSize: 24, fontWeight: 900, color: '#fff', margin: '4px 0 6px' }}>
                {isFounder ? 'Zenith Pro (Administrator / Founder)' : isProUser ? 'Zenith Pro Active' : 'Zenith Free'}
              </h2>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
                {isFounder 
                  ? 'Lifetime unlimited access to all Zenith Pro features & administrative privileges.' 
                  : isProUser 
                  ? 'You have full access to all advanced features across Aero, Vigor, and Kratos.' 
                  : 'You are currently on the free plan. Upgrade to Zenith Pro to unlock all features.'}
              </p>
            </div>

            <div>
              {isFounder ? (
                <div style={{ background: '#7e22ce', padding: '8px 16px', borderRadius: 20, color: '#fff', fontWeight: 900, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ShieldCheck size={16} /> LIFETIME
                </div>
              ) : isProUser ? (
                <div style={{ background: '#10b981', padding: '8px 16px', borderRadius: 20, color: '#fff', fontWeight: 900, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle2 size={16} /> PRO ACTIVE
                </div>
              ) : (
                <button 
                  onClick={() => setShowPayPalModal(true)} 
                  disabled={saving}
                  style={{ 
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', 
                    color: '#fff', 
                    fontWeight: 900, 
                    fontSize: 12, 
                    padding: '10px 20px', 
                    borderRadius: 12, 
                    border: 'none', 
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontFamily: 'inherit'
                  }}
                >
                  <Zap size={16} /> Upgrade to Pro (€9.99/mo)
                </button>
              )}
            </div>
          </div>

          {/* Feature Matrix Table */}
          <div className="zh-profile-card">
            <h3 style={{ fontSize: 14, fontWeight: 900, textTransform: 'uppercase', color: '#fff', letterSpacing: '0.8px', marginBottom: 16 }}>
              Comparison Matrix: Zenith Free vs Zenith Pro
            </h3>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', textAlign: 'left' }}>
                  <th style={{ padding: '12px', width: '50%' }}>Feature</th>
                  <th style={{ padding: '12px', textAlign: 'center', width: '25%' }}>Zenith Free</th>
                  <th style={{ padding: '12px', textAlign: 'center', width: '25%', color: '#34d399' }}>Zenith Pro</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '12px', color: '#fff', fontWeight: 700 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Bike size={15} style={{ flexShrink: 0, color: '#94a3b8' }} /> Aero Route Generator (GPX / TCX export)</span></td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#ef4444' }}><XCircle size={16} style={{ margin: '0 auto' }} /></td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#34d399' }}><CheckCircle2 size={16} style={{ margin: '0 auto' }} /></td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '12px', color: '#fff', fontWeight: 700 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Camera size={15} style={{ flexShrink: 0, color: '#94a3b8' }} /> Vigor Progress Photos & Comparator</span></td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#ef4444' }}><XCircle size={16} style={{ margin: '0 auto' }} /></td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#34d399' }}><CheckCircle2 size={16} style={{ margin: '0 auto' }} /></td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '12px', color: '#fff', fontWeight: 700 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Ruler size={15} style={{ flexShrink: 0, color: '#94a3b8' }} /> Vigor Body Circumferences (8 Zones)</span></td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#ef4444' }}><XCircle size={16} style={{ margin: '0 auto' }} /></td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#34d399' }}><CheckCircle2 size={16} style={{ margin: '0 auto' }} /></td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '12px', color: '#fff', fontWeight: 700 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Scale size={15} style={{ flexShrink: 0, color: '#94a3b8' }} /> Vigor Body Fat & Muscle Mass Breakdown</span></td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#ef4444' }}><XCircle size={16} style={{ margin: '0 auto' }} /></td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#34d399' }}><CheckCircle2 size={16} style={{ margin: '0 auto' }} /></td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '12px', color: '#fff', fontWeight: 700 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Moon size={15} style={{ flexShrink: 0, color: '#94a3b8' }} /> Colmi Smart Ring Deep & REM Sleep Stages</span></td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#ef4444' }}><XCircle size={16} style={{ margin: '0 auto' }} /></td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#34d399' }}><CheckCircle2 size={16} style={{ margin: '0 auto' }} /></td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '12px', color: '#fff', fontWeight: 700 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Dumbbell size={15} style={{ flexShrink: 0, color: '#94a3b8' }} /> Kratos Muscle Heatmap Sync & Workouts</span></td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#34d399' }}><CheckCircle2 size={16} style={{ margin: '0 auto' }} /></td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#34d399' }}><CheckCircle2 size={16} style={{ margin: '0 auto' }} /></td>
                </tr>
                <tr>
                  <td style={{ padding: '12px', color: '#fff', fontWeight: 700 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Footprints size={15} style={{ flexShrink: 0, color: '#94a3b8' }} /> Weight (kg) & Steps Logging</span></td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#34d399' }}><CheckCircle2 size={16} style={{ margin: '0 auto' }} /></td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#34d399' }}><CheckCircle2 size={16} style={{ margin: '0 auto' }} /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <PayPalModal
        isOpen={showPayPalModal}
        onClose={() => setShowPayPalModal(false)}
        onSuccess={handleActivateProAfterPayment}
        planName="Zenith Pro Monthly Subscription"
        priceDisplay="€9.99 / month"
      />
    </div>
  );
};
