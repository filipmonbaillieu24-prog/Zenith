import React, { useState, useEffect } from 'react';
import { 
  ThumbsUp, 
  Plus, 
  Sparkles, 
  X,
  User,
  Lock,
  Users
} from 'lucide-react';
import { supabase } from '../../utils/supabaseClient';

export interface FeatureRequestItem {
  id: string;
  title: string;
  description: string;
  category: 'aero' | 'vigor' | 'kratos' | 'general';
  upvotes: number;
  status: 'under_review' | 'planned' | 'in_progress' | 'completed';
  created_at: string;
  author_name?: string;
  author_id?: string;
  upvoter_names?: string[];
  user_voted?: boolean;
}

interface FeatureRequestsPageProps {
  onBack?: () => void;
  userId?: string;
  userName?: string;
  userEmail?: string;
  onRequireLogin?: () => void;
}

export const FeatureRequestsPage: React.FC<FeatureRequestsPageProps> = ({
  userId = '',
  userName = '',
  userEmail = '',
  onRequireLogin,
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

  const isAuthenticated = Boolean(userId && userId.trim().length > 0);
  const currentAuthorName = userName || (userEmail ? userEmail.split('@')[0] : 'Athlete');

  // Load feature requests from Supabase table
  useEffect(() => {
    async function fetchRequests() {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('zenith_feature_requests')
          .select('*')
          .order('upvotes', { ascending: false });

        if (!error && data) {
          const formatted = data.map((item: any) => ({
            ...item,
            upvoter_names: Array.isArray(item.upvoter_names) ? item.upvoter_names : [],
            user_voted: Array.isArray(item.upvoter_names) && currentAuthorName ? item.upvoter_names.includes(currentAuthorName) : false
          }));
          setRequests(formatted);
        }
      } catch (err) {
        console.error('Failed to fetch feature requests from Supabase:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchRequests();
  }, [currentAuthorName]);

  const handleVote = async (id: string) => {
    if (!isAuthenticated) {
      if (onRequireLogin) {
        onRequireLogin();
      } else {
        alert('Only existing users can upvote feature requests. Please sign in.');
      }
      return;
    }

    setRequests(prev => prev.map(req => {
      if (req.id === id) {
        const hasVoted = req.user_voted;
        const newVotes = hasVoted ? Math.max(0, req.upvotes - 1) : req.upvotes + 1;
        
        let newUpvoterNames = req.upvoter_names || [];
        if (hasVoted) {
          newUpvoterNames = newUpvoterNames.filter(n => n !== currentAuthorName);
        } else {
          if (!newUpvoterNames.includes(currentAuthorName)) {
            newUpvoterNames = [...newUpvoterNames, currentAuthorName];
          }
        }

        // Try async sync to Supabase
        (async () => {
          try {
            await supabase
              .from('zenith_feature_requests')
              .update({ 
                upvotes: newVotes,
                upvoter_names: newUpvoterNames
              })
              .eq('id', id);
          } catch (err) {
            console.error('Error updating upvote in Supabase:', err);
          }
        })();

        return {
          ...req,
          upvotes: newVotes,
          upvoter_names: newUpvoterNames,
          user_voted: !hasVoted
        };
      }
      return req;
    }));
  };

  const handleOpenSubmitModal = () => {
    if (!isAuthenticated) {
      if (onRequireLogin) {
        onRequireLogin();
      } else {
        alert('Only existing users can submit feature requests. Please sign in or create an account.');
      }
      return;
    }
    setShowSubmitModal(true);
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
        author_name: currentAuthorName,
        author_id: userId,
        upvoter_names: [currentAuthorName],
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
        return <span style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid #38bdf8', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 10 }}>✓ COMPLETED</span>;
      case 'in_progress':
        return <span style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#a855f7', border: '1px solid #a855f7', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 10 }}>⚡ IN DEVELOPMENT</span>;
      case 'planned':
        return <span style={{ background: 'rgba(52, 211, 153, 0.15)', color: '#34d399', border: '1px solid #34d399', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 10 }}>📌 PLANNED</span>;
      default:
        return <span style={{ background: 'rgba(255, 255, 255, 0.06)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 10 }}>UNDER REVIEW</span>;
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
      padding: '16px 32px 40px',
      position: 'relative'
    }}>
      <div style={{ width: '100%', maxWidth: '100%' }}>
        {/* Top Action Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 24 }}>
          <button 
            onClick={handleOpenSubmitModal}
            style={{
              background: isAuthenticated 
                ? 'linear-gradient(135deg, #38bdf8 0%, #3b82f6 100%)' 
                : 'rgba(255, 255, 255, 0.08)',
              border: isAuthenticated ? 'none' : '1px solid rgba(255, 255, 255, 0.15)',
              color: isAuthenticated ? '#09090b' : '#fff',
              fontWeight: 900,
              fontSize: 13,
              padding: '9px 18px',
              borderRadius: 10,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: isAuthenticated ? '0 4px 15px rgba(56, 189, 248, 0.35)' : 'none',
              fontFamily: 'inherit'
            }}
          >
            {isAuthenticated ? <Plus size={16} /> : <Lock size={14} />} 
            {isAuthenticated ? 'Submit New Idea' : 'Log In to Submit Idea'}
          </button>
        </div>

        {/* Guest Warning Banner if unauthenticated */}
        {!isAuthenticated && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '14px',
            padding: '14px 20px',
            marginBottom: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#cbd5e1' }}>
              <Lock size={16} color="#38bdf8" />
              <span>Only registered Zenith athletes can submit new feature requests and upvote ideas.</span>
            </div>
            {onRequireLogin && (
              <button
                onClick={onRequireLogin}
                style={{
                  background: 'linear-gradient(135deg, #38bdf8 0%, #3b82f6 100%)',
                  border: 'none',
                  color: '#09090b',
                  fontWeight: 800,
                  fontSize: 12,
                  padding: '6px 14px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  fontFamily: 'inherit'
                }}
              >
                Log In / Sign Up
              </button>
            )}
          </div>
        )}

        {/* Hero Title */}
        <div style={{ marginBottom: 36 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(56, 189, 248, 0.12)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            padding: '4px 14px',
            borderRadius: 20,
            color: '#38bdf8',
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
            Upvote your favorite features or submit new ideas for Aero, Vigor, Kratos, Fuel, or Stride.
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
                background: filterCategory === tab.id ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                border: filterCategory === tab.id ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                color: filterCategory === tab.id ? '#38bdf8' : '#94a3b8',
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
              onClick={handleOpenSubmitModal}
              style={{
                background: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid #38bdf8',
                color: '#38bdf8',
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
            {filteredRequests.map(req => {
              const voters = req.upvoter_names || [];
              const hasVoters = voters.length > 0;
              const votersText = hasVoters 
                ? voters.join(', ')
                : `${req.upvotes} athlete${req.upvotes === 1 ? '' : 's'}`;

              return (
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
                      <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', color: '#38bdf8', letterSpacing: '0.8px', background: 'rgba(56, 189, 248, 0.12)', padding: '2px 8px', borderRadius: 6 }}>
                        {req.category}
                      </span>
                      {getStatusBadge(req.status)}
                    </div>
                    <h3 style={{ fontSize: 16, fontWeight: 800, color: '#fff', margin: '0 0 4px' }}>
                      {req.title}
                    </h3>
                    <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 12px', lineHeight: 1.5 }}>
                      {req.description}
                    </p>

                    {/* Author & Upvoters Details */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 11, color: '#64748b', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <User size={12} color="#38bdf8" />
                        <span>Submitted by <strong style={{ color: '#cbd5e1' }}>{req.author_name || 'Athlete'}</strong></span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Users size={12} color="#a855f7" />
                        <span>Upvoted by <strong style={{ color: '#cbd5e1' }}>{votersText}</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* Upvote Button */}
                  <button
                    onClick={() => handleVote(req.id)}
                    style={{
                      background: req.user_voted ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                      border: req.user_voted ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                      color: req.user_voted ? '#38bdf8' : '#cbd5e1',
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
                    <ThumbsUp size={16} color={req.user_voted ? '#38bdf8' : '#cbd5e1'} />
                    <span style={{ fontSize: 13, fontWeight: 900, marginTop: 4 }}>{req.upvotes}</span>
                  </button>
                </div>
              );
            })}
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
            border: '1px solid rgba(56, 189, 248, 0.3)',
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
            <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>
              Submitting as <strong style={{ color: '#38bdf8' }}>{currentAuthorName}</strong>
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
                  style={{ flex: 1, padding: 12, borderRadius: 10, background: 'linear-gradient(135deg, #38bdf8 0%, #3b82f6 100%)', border: 'none', color: '#09090b', fontWeight: 900, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}
                >
                  {submitting ? 'Submitting...' : 'Submit Idea'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
