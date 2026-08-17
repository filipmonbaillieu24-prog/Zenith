import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  ThumbsUp, 
  Plus, 
  MessageSquare, 
  Sparkles, 
  Tag, 
  CheckCircle2, 
  Clock, 
  Flame,
  X
} from 'lucide-react';
import { supabase } from '../../utils/supabaseClient';

interface FeatureRequestItem {
  id: string;
  title: string;
  description: string;
  category: 'aero' | 'vigor' | 'kratos' | 'general';
  upvotes: number;
  status: 'under_review' | 'planned' | 'in_progress' | 'completed';
  created_at: string;
  user_voted?: boolean;
}

interface FeatureRequestsPageProps {
  onBack: () => void;
  userId?: string;
}

const INITIAL_MOCK_REQUESTS: FeatureRequestItem[] = [
  {
    id: 'req-1',
    title: 'Automatische Strava Sync voor Aero & Vigor',
    description: 'Automatisch al je wielrenritten en gewichtsmetingen synchroniseren met je Strava profiel.',
    category: 'aero',
    upvotes: 42,
    status: 'in_progress',
    created_at: '2026-08-10T12:00:00Z'
  },
  {
    id: 'req-2',
    title: 'Apple Health & Garmin Connect Integratie',
    description: 'Direct je stappen, hartslag, en slaapdata uit lezen uit Apple Health en Garmin Connect.',
    category: 'vigor',
    upvotes: 38,
    status: 'planned',
    created_at: '2026-08-12T14:30:00Z'
  },
  {
    id: 'req-3',
    title: 'Aangepaste Krachttraining Builder in Kratos',
    description: 'Eigen oefeningen en custom workout schema\'s aanmaken met aangepaste rusttimers.',
    category: 'kratos',
    upvotes: 29,
    status: 'planned',
    created_at: '2026-08-14T09:15:00Z'
  },
  {
    id: 'req-4',
    title: 'Donker / Licht Thema Instellingen per App',
    description: 'Optie om per app te kiezen tussen OLED pitch black en high contrast thema.',
    category: 'general',
    upvotes: 15,
    status: 'under_review',
    created_at: '2026-08-15T16:20:00Z'
  }
];

export const FeatureRequestsPage: React.FC<FeatureRequestsPageProps> = ({
  onBack,
  userId = ''
}) => {
  const [requests, setRequests] = useState<FeatureRequestItem[]>(INITIAL_MOCK_REQUESTS);
  const [loading, setLoading] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  // Form states
  const [titleInput, setTitleInput] = useState('');
  const [descInput, setDescInput] = useState('');
  const [categoryInput, setCategoryInput] = useState<'aero' | 'vigor' | 'kratos' | 'general'>('general');
  const [submitting, setSubmitting] = useState(false);

  // Load feature requests from Supabase table if available
  useEffect(() => {
    async function fetchRequests() {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('zenith_feature_requests')
          .select('*')
          .order('upvotes', { ascending: false });

        if (!error && data && data.length > 0) {
          setRequests(data);
        }
      } catch (err) {
        console.error('Feature requests ophalen uit Supabase mislukt:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchRequests();
  }, []);

  const handleVote = async (id: string) => {
    setRequests(prev => prev.map(req => {
      if (req.id === id) {
        const hasVoted = req.user_voted;
        const newVotes = hasVoted ? req.upvotes - 1 : req.upvotes + 1;
        
        // Try async sync to Supabase
        supabase
          .from('zenith_feature_requests')
          .update({ upvotes: newVotes })
          .eq('id', id)
          .then(() => {})
          .catch(console.error);

        return {
          ...req,
          upvotes: newVotes,
          user_voted: !hasVoted
        };
      }
      return req;
    }));
  };

  const handleSubmitNewRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titleInput.trim() || !descInput.trim()) return;

    try {
      setSubmitting(true);
      const newReq: FeatureRequestItem = {
        id: 'req-' + Date.now(),
        title: titleInput.trim(),
        description: descInput.trim(),
        category: categoryInput,
        upvotes: 1,
        status: 'under_review',
        created_at: new Date().toISOString(),
        user_voted: true
      };

      try {
        await supabase
          .from('zenith_feature_requests')
          .insert(newReq);
      } catch (err) {
        console.error('Kon feature request niet in Supabase invoeren:', err);
      }

      setRequests(prev => [newReq, ...prev]);
      setTitleInput('');
      setDescInput('');
      setShowSubmitModal(false);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredRequests = requests.filter(r => {
    if (filterCategory === 'all') return true;
    return r.category === filterCategory;
  });

  const getStatusBadge = (status: FeatureRequestItem['status']) => {
    switch (status) {
      case 'completed':
        return <span style={{ background: 'rgba(57, 255, 20, 0.15)', color: '#39ff14', border: '1px solid #39ff14', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 10 }}>✓ VOLTOOID</span>;
      case 'in_progress':
        return <span style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', border: '1px solid #a855f7', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 10 }}>⚡ IN ONTWIKKELING</span>;
      case 'planned':
        return <span style={{ background: 'rgba(96, 165, 250, 0.15)', color: '#60a5fa', border: '1px solid #60a5fa', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 10 }}>📌 GEPLAAND</span>;
      default:
        return <span style={{ background: 'rgba(255, 255, 255, 0.06)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 10 }}>IN OVERWEGING</span>;
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#09090b',
      color: '#f8fafc',
      fontFamily: 'Outfit, sans-serif',
      padding: '32px 24px 60px',
      maxWidth: '1000px',
      margin: '0 auto'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 36 }}>
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

        <button 
          onClick={() => setShowSubmitModal(true)}
          style={{
            background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)',
            border: 'none',
            color: '#fff',
            fontWeight: 900,
            fontSize: 13,
            padding: '9px 18px',
            borderRadius: 10,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 4px 15px rgba(168, 85, 247, 0.3)'
          }}
        >
          <Plus size={16} /> Nieuw Idee Indienen
        </button>
      </div>

      {/* Hero Title */}
      <div style={{ marginBottom: 36 }}>
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
          marginBottom: 12
        }}>
          <Sparkles size={13} /> COMMUNITY ROADMAP & VOTING BOARD
        </div>
        <h1 style={{ fontSize: 32, fontWeight: 900, color: '#fff', margin: '0 0 8px' }}>
          Jouw Stem Vormt de Toekomst van Zenith
        </h1>
        <p style={{ fontSize: 14, color: '#94a3b8', margin: 0 }}>
          Stem op je favoriete uitbreidingen of dien zelf nieuwe ideeën in voor Aero, Vigor, Kratos of Fuel.
        </p>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 28, overflowX: 'auto', paddingBottom: 4 }}>
        {[
          { id: 'all', label: 'Alle Ideeën' },
          { id: 'aero', label: '🚴 Aero' },
          { id: 'vigor', label: '⚖️ Vigor' },
          { id: 'kratos', label: '🔥 Kratos' },
          { id: 'general', label: '🌐 Algemeen' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilterCategory(tab.id)}
            style={{
              background: filterCategory === tab.id ? 'rgba(168, 85, 247, 0.2)' : 'rgba(255, 255, 255, 0.03)',
              border: filterCategory === tab.id ? '1px solid #a855f7' : '1px solid rgba(255, 255, 255, 0.08)',
              color: filterCategory === tab.id ? '#fff' : '#94a3b8',
              fontWeight: 800,
              fontSize: 12,
              padding: '8px 16px',
              borderRadius: 10,
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Request List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {filteredRequests.map(req => (
          <div 
            key={req.id}
            style={{
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '16px',
              padding: '20px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 20
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', color: '#a855f7', letterSpacing: '0.8px', background: 'rgba(168, 85, 247, 0.1)', padding: '2px 8px', borderRadius: 6 }}>
                  {req.category}
                </span>
                {getStatusBadge(req.status)}
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: '#fff', margin: '0 0 4px' }}>
                {req.title}
              </h3>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
                {req.description}
              </p>
            </div>

            {/* Upvote Button */}
            <button
              onClick={() => handleVote(req.id)}
              style={{
                background: req.user_voted ? 'rgba(168, 85, 247, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                border: req.user_voted ? '1px solid #a855f7' : '1px solid rgba(255, 255, 255, 0.1)',
                color: req.user_voted ? '#c084fc' : '#cbd5e1',
                padding: '10px 16px',
                borderRadius: 12,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 64,
                transition: 'all 0.2s'
              }}
            >
              <ThumbsUp size={16} color={req.user_voted ? '#c084fc' : '#cbd5e1'} />
              <span style={{ fontSize: 13, fontWeight: 900, marginTop: 4 }}>{req.upvotes}</span>
            </button>
          </div>
        ))}
      </div>

      {/* Submit Feature Request Modal */}
      {showSubmitModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(5, 5, 8, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999
        }}>
          <div style={{
            maxWidth: '460px',
            width: '90%',
            background: 'linear-gradient(145deg, #121218 0%, #1a1a26 100%)',
            border: '1px solid rgba(168, 85, 247, 0.3)',
            borderRadius: '20px',
            padding: '28px',
            position: 'relative'
          }}>
            <button 
              onClick={() => setShowSubmitModal(false)}
              style={{ position: 'absolute', top: 20, right: 20, background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
            >
              <X size={18} />
            </button>

            <h3 style={{ fontSize: 18, fontWeight: 900, color: '#fff', marginBottom: 6 }}>
              Nieuw Idee Indienen
            </h3>
            <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 20 }}>
              Laat ons weten welke functionaliteit jij graag ziet in Zenith.
            </p>

            <form onSubmit={handleSubmitNewRequest} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: '#cbd5e1', display: 'block', marginBottom: 6 }}>
                  CATEGORIE
                </label>
                <select
                  value={categoryInput}
                  onChange={(e: any) => setCategoryInput(e.target.value)}
                  style={{ width: '100%', background: 'rgba(9, 9, 11, 0.7)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '10px 12px', borderRadius: 8, fontSize: 12 }}
                >
                  <option value="aero">🚴 Zenith Aero (Wielrennen & Routing)</option>
                  <option value="vigor">⚖️ Zenith Vigor (Gezondheid & Omtrekken)</option>
                  <option value="kratos">🔥 Zenith Kratos (Krachttraining)</option>
                  <option value="general">🌐 Algemeen Zenith Ecosysteem</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: '#cbd5e1', display: 'block', marginBottom: 6 }}>
                  TITEL
                </label>
                <input
                  type="text"
                  required
                  placeholder="Bijv. Strava Auto Sync..."
                  value={titleInput}
                  onChange={e => setTitleInput(e.target.value)}
                  style={{ width: '100%', background: 'rgba(9, 9, 11, 0.7)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '10px 12px', borderRadius: 8, fontSize: 12 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: '#cbd5e1', display: 'block', marginBottom: 6 }}>
                  OMSCHRIJVING
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="Beschrijf hoe deze feature zou moeten werken..."
                  value={descInput}
                  onChange={e => setDescInput(e.target.value)}
                  style={{ width: '100%', background: 'rgba(9, 9, 11, 0.7)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '10px 12px', borderRadius: 8, fontSize: 12, resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(false)}
                  style={{ flex: 1, padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#cbd5e1', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{ flex: 1, padding: 12, borderRadius: 10, background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)', border: 'none', color: '#fff', fontWeight: 900, cursor: 'pointer', fontSize: 12 }}
                >
                  {submitting ? 'Indienen...' : 'Indienen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
