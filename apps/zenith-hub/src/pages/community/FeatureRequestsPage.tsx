import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  ThumbsUp, 
  Plus, 
  Sparkles, 
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

export const FeatureRequestsPage: React.FC<FeatureRequestsPageProps> = ({
  onBack,
  userId: _userId = ''
}) => {
  const [requests, setRequests] = useState<FeatureRequestItem[]>([]);
  const [_loading, setLoading] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  // Form states
  const [titleInput, setTitleInput] = useState('');
  const [descInput, setDescInput] = useState('');
  const [categoryInput, setCategoryInput] = useState<'aero' | 'vigor' | 'kratos' | 'general'>('general');
  const [submitting, setSubmitting] = useState(false);

  // Load feature requests from Supabase table
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
        console.error('Failed to fetch feature requests from Supabase:', err);
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
        
        (async () => {
          try {
            await supabase
              .from('zenith_feature_requests')
              .update({ upvotes: newVotes })
              .eq('id', id);
          } catch (err) {
            console.error('Error updating upvote:', err);
          }
        })();

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
        console.error('Failed to insert feature request into Supabase:', err);
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
        return <span style={{ background: 'rgba(52, 211, 153, 0.15)', color: '#34d399', border: '1px solid #34d399', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 10 }}>✓ COMPLETED</span>;
      case 'in_progress':
        return <span style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid #38bdf8', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 10 }}>⚡ IN DEVELOPMENT</span>;
      case 'planned':
        return <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid #10b981', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 10 }}>📌 PLANNED</span>;
      default:
        return <span style={{ background: 'rgba(255, 255, 255, 0.06)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 10 }}>UNDER REVIEW</span>;
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
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
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
              gap: 8,
              fontFamily: 'inherit'
            }}
          >
            <ArrowLeft size={16} /> Back
          </button>

          <button 
            onClick={() => setShowSubmitModal(true)}
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
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
              boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)',
              fontFamily: 'inherit'
            }}
          >
            <Plus size={16} /> Submit New Idea
          </button>
        </div>

        {/* Hero Title */}
        <div style={{ marginBottom: 36 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            padding: '4px 14px',
            borderRadius: 20,
            color: '#34d399',
            fontSize: 11,
            fontWeight: 800,
            marginBottom: 12
          }}>
            <Sparkles size={13} /> COMMUNITY ROADMAP & VOTING BOARD
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 900, color: '#fff', margin: '0 0 8px' }}>
            Your Voice Shapes the Future of Zenith
          </h1>
          <p style={{ fontSize: 14, color: '#94a3b8', margin: 0 }}>
            Upvote your favorite features or submit new ideas for Aero, Vigor, Kratos, or Fuel.
          </p>
        </div>

        {/* Filter Tabs */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 28, overflowX: 'auto', paddingBottom: 4 }}>
          {[
            { id: 'all', label: 'All Ideas' },
            { id: 'aero', label: '🚴 Aero' },
            { id: 'vigor', label: '⚖️ Vigor' },
            { id: 'kratos', label: '🔥 Kratos' },
            { id: 'general', label: '🌐 General' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilterCategory(tab.id)}
              style={{
                background: filterCategory === tab.id ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                border: filterCategory === tab.id ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.08)',
                color: filterCategory === tab.id ? '#34d399' : '#94a3b8',
                fontWeight: 800,
                fontSize: 12,
                padding: '8px 16px',
                borderRadius: 10,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                fontFamily: 'inherit'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Request List */}
        {filteredRequests.length === 0 ? (
          <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '40px',
            textAlign: 'center',
            color: '#94a3b8'
          }}>
            <p style={{ fontSize: 14, margin: '0 0 16px' }}>No feature requests submitted yet for this category.</p>
            <button
              onClick={() => setShowSubmitModal(true)}
              style={{
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid #10b981',
                color: '#34d399',
                fontWeight: 800,
                fontSize: 12,
                padding: '8px 18px',
                borderRadius: 10,
                cursor: 'pointer',
                fontFamily: 'inherit'
              }}
            >
              Be the first to submit an idea!
            </button>
          </div>
        ) : (
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
                    <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', color: '#34d399', letterSpacing: '0.8px', background: 'rgba(16, 185, 129, 0.12)', padding: '2px 8px', borderRadius: 6 }}>
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
                    background: req.user_voted ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                    border: req.user_voted ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.1)',
                    color: req.user_voted ? '#34d399' : '#cbd5e1',
                    padding: '10px 16px',
                    borderRadius: 12,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 64,
                    transition: 'all 0.2s',
                    fontFamily: 'inherit'
                  }}
                >
                  <ThumbsUp size={16} color={req.user_voted ? '#34d399' : '#cbd5e1'} />
                  <span style={{ fontSize: 13, fontWeight: 900, marginTop: 4 }}>{req.upvotes}</span>
                </button>
              </div>
            ))}
          </div>
        )}
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
          background: 'rgba(5, 5, 8, 0.88)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          fontFamily: 'inherit'
        }}>
          <div style={{
            maxWidth: '460px',
            width: '90%',
            background: 'linear-gradient(145deg, #121218 0%, #1a1a26 100%)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
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
              Submit New Feature Idea
            </h3>
            <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 20 }}>
              Let us know what functionality you would like to see in Zenith.
            </p>

            <form onSubmit={handleSubmitNewRequest} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: '#cbd5e1', display: 'block', marginBottom: 6 }}>
                  CATEGORY
                </label>
                <select
                  value={categoryInput}
                  onChange={(e: any) => setCategoryInput(e.target.value)}
                  style={{ width: '100%', background: 'rgba(9, 9, 11, 0.7)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '10px 12px', borderRadius: 8, fontSize: 12, fontFamily: 'inherit' }}
                >
                  <option value="aero">🚴 Zenith Aero (Cycling & Routing)</option>
                  <option value="vigor">⚖️ Zenith Vigor (Health & Circumferences)</option>
                  <option value="kratos">🔥 Zenith Kratos (Strength Training)</option>
                  <option value="general">🌐 General Zenith Ecosystem</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: '#cbd5e1', display: 'block', marginBottom: 6 }}>
                  TITLE
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Strava Auto Sync..."
                  value={titleInput}
                  onChange={e => setTitleInput(e.target.value)}
                  style={{ width: '100%', background: 'rgba(9, 9, 11, 0.7)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '10px 12px', borderRadius: 8, fontSize: 12, fontFamily: 'inherit' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: '#cbd5e1', display: 'block', marginBottom: 6 }}>
                  DESCRIPTION
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="Describe how this feature should work..."
                  value={descInput}
                  onChange={e => setDescInput(e.target.value)}
                  style={{ width: '100%', background: 'rgba(9, 9, 11, 0.7)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '10px 12px', borderRadius: 8, fontSize: 12, resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(false)}
                  style={{ flex: 1, padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#cbd5e1', fontWeight: 700, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{ flex: 1, padding: 12, borderRadius: 10, background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: 'none', color: '#fff', fontWeight: 900, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}
                >
                  {submitting ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
