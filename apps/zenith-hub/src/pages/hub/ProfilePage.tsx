import React, { useEffect, useState, useMemo } from 'react';
import { ArrowLeft, User, AlertCircle, Check, Sparkles, CreditCard, ShieldCheck, CheckCircle2, XCircle, Zap } from 'lucide-react';
import { supabase } from '../../utils/supabaseClient';
import { PayPalModal } from '../../components/PayPalModal';
import './ProfilePage.css';
import './ZenithHub.css';

interface ProfilePageProps {
  initialProfile: any;
  userId: string;
  userEmail?: string;
  onBack: () => void;
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
  
  const [latestWeight, setLatestWeight] = useState<number | null>(null);
  const [weightDate, setWeightDate] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Compute Pro Status
  const isFounder = useMemo(() => {
    return userEmail.toLowerCase() === 'filip.monbaillieu.24@gmail.com';
  }, [userEmail]);

  const [isProUser, setIsProUser] = useState<boolean>(isFounder || initialProfile.isPro === true);

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
          const dateStr = new Date(data[0].logged_at).toLocaleDateString('nl-NL', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
          setWeightDate(dateStr);
        }
      } catch (err) {
        console.error('Kon laatste gewicht van Vigor niet ophalen:', err);
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
      setErrorMsg('Naam mag niet leeg zijn.');
      setSaving(false);
      return;
    }

    if (height && (parseFloat(height) < 50 || parseFloat(height) > 250)) {
      setErrorMsg('Voer een geldige lengte in (tussen 50 en 250 cm).');
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
        weight: latestWeight !== null ? latestWeight : initialProfile.weight
      };

      await onSave(updatedProfile);
      setSuccessMsg('Profiel succesvol bijgewerkt!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Fout bij het bijwerken van het profiel.');
    } finally {
      setSaving(false);
    }
  };

  const [showPayPalModal, setShowPayPalModal] = useState(false);

  const handleActivateProAfterPayment = async () => {
    try {
      setSaving(true);
      await supabase.auth.updateUser({
        data: { is_pro: true }
      });
      setIsProUser(true);
      setSuccessMsg('Gefeliciteerd! Je betaling via PayPal is verwerkt. Zenith Pro is geactiveerd.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg('Fout bij activeren Pro: ' + (err.message || String(err)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="zh-hub-container">
      {/* Background radial glow */}
      <div className="zh-hub-glow" style={{ background: 'radial-gradient(circle at 50% 30%, rgba(168, 85, 247, 0.08) 0%, transparent 60%)' }} />

      <header className="zh-hub-header animate-slide-down">
        <button onClick={onBack} className="zh-back-btn">
          <ArrowLeft size={14} /> Hub
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#64748b' }}>
          <Sparkles size={12} style={{ color: '#a855f7' }} />
          <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Persoonlijk Profiel & Abonnement
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
        <div className="zh-profile-grid animate-slide-up">
          <div className="zh-profile-card">
            <h2 className="zh-profile-card-title">
              <User size={16} style={{ color: '#10b981' }} />
              Personal Information
            </h2>

            <form onSubmit={handleSubmit} className="zh-profile-form">
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

              {/* Actions */}
              <div className="zh-profile-actions">
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
          </div>
        </div>
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
                  <td style={{ padding: '12px', color: '#fff', fontWeight: 700 }}>🚴 Aero Route Generator (GPX / TCX export)</td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#ef4444' }}><XCircle size={16} style={{ margin: '0 auto' }} /></td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#34d399' }}><CheckCircle2 size={16} style={{ margin: '0 auto' }} /></td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '12px', color: '#fff', fontWeight: 700 }}>📸 Vigor Progress Photos & Comparator</td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#ef4444' }}><XCircle size={16} style={{ margin: '0 auto' }} /></td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#34d399' }}><CheckCircle2 size={16} style={{ margin: '0 auto' }} /></td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '12px', color: '#fff', fontWeight: 700 }}>📏 Vigor Body Circumferences (8 Zones)</td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#ef4444' }}><XCircle size={16} style={{ margin: '0 auto' }} /></td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#34d399' }}><CheckCircle2 size={16} style={{ margin: '0 auto' }} /></td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '12px', color: '#fff', fontWeight: 700 }}>⚖️ Vigor Body Fat & Muscle Mass Breakdown</td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#ef4444' }}><XCircle size={16} style={{ margin: '0 auto' }} /></td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#34d399' }}><CheckCircle2 size={16} style={{ margin: '0 auto' }} /></td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '12px', color: '#fff', fontWeight: 700 }}>🌙 Colmi Smart Ring Deep & REM Sleep Stages</td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#ef4444' }}><XCircle size={16} style={{ margin: '0 auto' }} /></td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#34d399' }}><CheckCircle2 size={16} style={{ margin: '0 auto' }} /></td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '12px', color: '#fff', fontWeight: 700 }}>🔥 Kratos Muscle Heatmap Sync & Workouts</td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#34d399' }}><CheckCircle2 size={16} style={{ margin: '0 auto' }} /></td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#34d399' }}><CheckCircle2 size={16} style={{ margin: '0 auto' }} /></td>
                </tr>
                <tr>
                  <td style={{ padding: '12px', color: '#fff', fontWeight: 700 }}>⚖️ Weight (kg) & Steps Logging</td>
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
