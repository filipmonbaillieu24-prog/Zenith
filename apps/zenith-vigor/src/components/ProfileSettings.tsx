import React, { useState, useEffect } from 'react';
import { X, Target } from 'lucide-react';
import { supabase } from '../utils/supabaseClient';

interface ProfileSettingsProps {
  userId: string;
  onClose: () => void;
  onProfileUpdated: () => void;
}

export const ProfileSettings: React.FC<ProfileSettingsProps> = ({
  userId,
  onClose,
  onProfileUpdated,
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form states
  const [targetWeight, setTargetWeight] = useState<string>('');
  const [targetSteps, setTargetSteps] = useState<string>('10000');
  const [targetSleep, setTargetSleep] = useState<string>('8');
  const [scaleModel, setScaleModel] = useState<string>('neo-health-onyx-se');
  const [ringModel, setRingModel] = useState<string>('colbi-r02');

  useEffect(() => {
    async function fetchProfile() {
      try {
        const { data, error } = await supabase
          .from('vigor_profile')
          .select('*')
          .eq('user_id', userId)
          .single();

        if (error && error.code !== 'PGRST116') {
          throw error;
        }

        if (data) {
          setTargetWeight(data.target_weight?.toString() || '');
          setTargetSteps(data.target_steps?.toString() || '10000');
          setTargetSleep(data.target_sleep_hours?.toString() || '8');
          setScaleModel(data.scale_model || 'neo-health-onyx-se');
          setRingModel(data.ring_model || 'colbi-r02');
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, [userId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const payload = {
        user_id: userId,
        target_weight: targetWeight ? parseFloat(targetWeight) : null,
        target_steps: targetSteps ? parseInt(targetSteps) : null,
        target_sleep_hours: targetSleep ? parseFloat(targetSleep) : null,
        scale_model: scaleModel,
        ring_model: ringModel,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('vigor_profile')
        .upsert(payload);

      if (error) throw error;
      onProfileUpdated();
      onClose();
    } catch (err) {
      console.error('Error saving profile:', err);
      alert('Error saving profile goals.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content animate-slide-up" style={{ maxWidth: '420px' }}>
        <div className="modal-header">
          <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Target style={{ color: '#cbd5e1' }} /> Health Goals
          </h2>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            Loading goals...
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Vital Targets */}
            <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Target Weight (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    className="form-input"
                    value={targetWeight}
                    placeholder="e.g. 72.0"
                    onChange={(e) => setTargetWeight(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Sleep Goal (Hours)</label>
                  <input
                    type="number"
                    step="0.5"
                    className="form-input"
                    value={targetSleep}
                    onChange={(e) => setTargetSleep(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Daily Step Goal</label>
                <input
                  type="number"
                  className="form-input"
                  value={targetSteps}
                  onChange={(e) => setTargetSteps(e.target.value)}
                />
              </div>
            </fieldset>

            <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
              <button type="button" className="btn-secondary" onClick={onClose} style={{ flex: 1 }}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={saving} style={{ flex: 1 }}>
                {saving ? 'Save...' : 'Save'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
