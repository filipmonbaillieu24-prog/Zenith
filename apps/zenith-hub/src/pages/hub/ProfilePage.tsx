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
            padding: '10px 20px',
            borderRadius: '12px',
            border: '1px solid',
            borderColor: activeTab === 'profile' ? '#a855f7' : 'rgba(255,255,255,0.08)',
            background: activeTab === 'profile' ? 'rgba(168, 85, 247, 0.12)' : 'rgba(255,255,255,0.02)',
            color: activeTab === 'profile' ? '#fff' : '#94a3b8',
            fontWeight: 800,
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            transition: 'all 0.2s ease'
          }}
        >
          <User size={16} /> Basisgegevens
        </button>

        <button
          onClick={() => setActiveTab('subscription')}
          style={{
            padding: '10px 20px',
            borderRadius: '12px',
            border: '1px solid',
            borderColor: activeTab === 'subscription' ? '#a855f7' : 'rgba(255,255,255,0.08)',
            background: activeTab === 'subscription' ? 'rgba(168, 85, 247, 0.12)' : 'rgba(255,255,255,0.02)',
            color: activeTab === 'subscription' ? '#fff' : '#94a3b8',
            fontWeight: 800,
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            transition: 'all 0.2s ease'
          }}
        >
          <CreditCard size={16} /> Abonnement & Pro
          {isFounder ? (
            <span style={{ background: '#7e22ce', color: '#fff', fontSize: 9, padding: '2px 6px', borderRadius: 4 }}>FOUNDER</span>
          ) : isProUser ? (
            <span style={{ background: '#39ff14', color: '#000', fontSize: 9, padding: '2px 6px', borderRadius: 4, fontWeight: 900 }}>PRO</span>
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
              <User size={16} style={{ color: '#a855f7' }} />
              Persoonlijke Basisgegevens
            </h2>

            <form onSubmit={handleSubmit} className="zh-profile-form">
              {/* Naam */}
              <div className="zh-profile-row">
                <label htmlFor="profileName">Naam</label>
                <input
                  id="profileName"
                  type="text"
                  className="zh-profile-input"
                  placeholder="Je volledige naam"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              {/* Geslacht */}
              <div className="zh-profile-row">
                <label htmlFor="profileGender">Geslacht</label>
                <select
                  id="profileGender"
                  className="zh-profile-select"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                >
                  <option value="">Niet opgegeven</option>
                  <option value="male">Man</option>
                  <option value="female">Vrouw</option>
                  <option value="other">Anders</option>
                </select>
              </div>

              {/* Geboortedatum */}
              <div className="zh-profile-row">
                <label htmlFor="profileBirth">Geboortedatum</label>
                <input
                  id="profileBirth"
                  type="date"
                  className="zh-profile-input"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>

              {/* Lengte */}
              <div className="zh-profile-row">
                <label htmlFor="profileHeight">Lengte <span>(cm)</span></label>
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

              {/* Gewicht (Read-only, linked to Vigor) */}
              <div className="zh-profile-row">
                <label>Gewicht <span>(kg)</span></label>
                <input
                  type="text"
                  className="zh-profile-input"
                  disabled
                  value={latestWeight !== null ? `${latestWeight} kg` : 'Nog geen meting'}
                />
                <p className="zh-profile-note">
                  {latestWeight !== null ? (
                    <>
                      Laatst gemeten: <strong>{latestWeight} kg</strong> op {weightDate} via de Vigor-extensie.
                    </>
                  ) : (
                    <>
                      Er is nog geen gewichtsmeting gevonden in de database. Log een meting via de <strong>Vigor</strong> extensie.
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
                  Annuleren
                </button>
                <button
                  type="submit"
                  className="zh-btn-save"
                  disabled={saving}
                >
                  {saving ? 'Opslaan...' : 'Opslaan'}
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
              ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(9, 9, 11, 0.95) 100%)'
              : 'linear-gradient(135deg, rgba(255, 255, 255, 0.03) 0%, rgba(9, 9, 11, 0.95) 100%)',
            border: isFounder || isProUser ? '1px solid rgba(168, 85, 247, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '24px',
            marginBottom: 24,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', color: '#c084fc', letterSpacing: '0.8px' }}>
                HUIDIG ABONNEMENT
              </div>
              <h2 style={{ fontSize: 24, fontWeight: 900, color: '#fff', margin: '4px 0 6px' }}>
                {isFounder ? 'Zenith Pro (Administrator / Founder)' : isProUser ? 'Zenith Pro Actief' : 'Zenith Free'}
              </h2>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>
                {isFounder 
                  ? 'Levenslange onbeperkte toegang tot alle Zenith Pro features & beheerdersrechten.' 
                  : isProUser 
                  ? 'Je hebt volledige toegang tot alle geavanceerde features in Aero, Vigor en Kratos.' 
                  : 'Je maakt momenteel gebruik van het gratis basisplan. Upgrade naar Zenith Pro voor alle functies.'}
              </p>
            </div>

            <div>
              {isFounder ? (
                <div style={{ background: '#7e22ce', padding: '8px 16px', borderRadius: 20, color: '#fff', fontWeight: 900, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ShieldCheck size={16} /> LEVENSLANG
                </div>
              ) : isProUser ? (
                <div style={{ background: '#39ff14', padding: '8px 16px', borderRadius: 20, color: '#000', fontWeight: 900, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle2 size={16} /> PRO ACTIEF
                </div>
              ) : (
                <button 
                  onClick={() => setShowPayPalModal(true)} 
                  disabled={saving}
                  style={{ 
                    background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)', 
                    color: '#fff', 
                    fontWeight: 900, 
                    fontSize: 12, 
                    padding: '10px 20px', 
                    borderRadius: 12, 
                    border: 'none', 
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <Zap size={16} /> Upgrade naar Pro (€9,99/m)
                </button>
              )}
            </div>
          </div>

          {/* Feature Matrix Table */}
          <div className="zh-profile-card">
            <h3 style={{ fontSize: 14, fontWeight: 900, textTransform: 'uppercase', color: '#fff', letterSpacing: '0.8px', marginBottom: 16 }}>
              Vergelijkingstabel: Zenith Free vs Zenith Pro
            </h3>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', textAlign: 'left' }}>
                  <th style={{ padding: '12px', width: '50%' }}>Functionaliteit</th>
                  <th style={{ padding: '12px', textAlign: 'center', width: '25%' }}>Zenith Free</th>
                  <th style={{ padding: '12px', textAlign: 'center', width: '25%', color: '#c084fc' }}>Zenith Pro</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '12px', color: '#fff', fontWeight: 700 }}>🚴 Aero Routegenerator (GPX / TCX export)</td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#ef4444' }}><XCircle size={16} style={{ margin: '0 auto' }} /></td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#39ff14' }}><CheckCircle2 size={16} style={{ margin: '0 auto' }} /></td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '12px', color: '#fff', fontWeight: 700 }}>📸 Vigor Voortgangsfoto's & Vergelijker</td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#ef4444' }}><XCircle size={16} style={{ margin: '0 auto' }} /></td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#39ff14' }}><CheckCircle2 size={16} style={{ margin: '0 auto' }} /></td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '12px', color: '#fff', fontWeight: 700 }}>📏 Vigor Lichaamsomtrekken (8 Zones)</td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#ef4444' }}><XCircle size={16} style={{ margin: '0 auto' }} /></td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#39ff14' }}><CheckCircle2 size={16} style={{ margin: '0 auto' }} /></td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '12px', color: '#fff', fontWeight: 700 }}>⚖️ Vigor Vetpercentage & Spiermassa Breakdown</td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#ef4444' }}><XCircle size={16} style={{ margin: '0 auto' }} /></td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#39ff14' }}><CheckCircle2 size={16} style={{ margin: '0 auto' }} /></td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '12px', color: '#fff', fontWeight: 700 }}>🌙 Colmi Smart Ring Diepe Slaap & REM Fases</td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#ef4444' }}><XCircle size={16} style={{ margin: '0 auto' }} /></td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#39ff14' }}><CheckCircle2 size={16} style={{ margin: '0 auto' }} /></td>
                </tr>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '12px', color: '#fff', fontWeight: 700 }}>🔥 Kratos Muscle Heatmap Sync & Workouts</td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#39ff14' }}><CheckCircle2 size={16} style={{ margin: '0 auto' }} /></td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#39ff14' }}><CheckCircle2 size={16} style={{ margin: '0 auto' }} /></td>
                </tr>
                <tr>
                  <td style={{ padding: '12px', color: '#fff', fontWeight: 700 }}>⚖️ Gewicht (kg) & Stappen Loggen</td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#39ff14' }}><CheckCircle2 size={16} style={{ margin: '0 auto' }} /></td>
                  <td style={{ padding: '12px', textAlign: 'center', color: '#39ff14' }}><CheckCircle2 size={16} style={{ margin: '0 auto' }} /></td>
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
        planName="Zenith Pro Maandabonnement"
        priceDisplay="€9,99 / maand"
      />
    </div>
  );
};
