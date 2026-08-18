import React, { useState, useEffect, useRef } from 'react';
import { Brain, Send, User, Settings } from 'lucide-react';
import { getAISettings, sendAIChat, AIChatMessage } from '../../utils/ai';
import { FitnessProfile, RideSummaryWithBests } from '../../types/workout';
import { computePMC } from '../../utils/pmc';

interface AICoachChatWidgetProps {
  profile: FitnessProfile;
  rides: RideSummaryWithBests[];
  onGoToSettings?: () => void;
}

export const AICoachChatWidget: React.FC<AICoachChatWidgetProps> = ({ profile, rides, onGoToSettings }) => {
  const [provider, setProvider] = useState<'disabled' | 'ollama' | 'openai'>('disabled');
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load provider settings
  useEffect(() => {
    const settings = getAISettings();
    setProvider(settings.provider);

    // Initial welcome message
    if (settings.provider !== 'disabled') {
      const name = profile.name || 'Atleet';
      setMessages([
        {
          role: 'assistant',
          content: `Hoi ${name}! I am your personal Zenith AI Coach. I have access to your fitness data and history. Feel free to ask me anything about your vragen over je rideten, trainingszones, voeding of hersteladviezen. Hoe voelen de benen today?`,
        },
      ]);
    }
  }, [profile.name]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  // Generate system prompt with full athlete context
  const getSystemContext = () => {
    const name = profile.name || 'Atleet';
    const age = profile.birthDate
      ? Math.floor((Date.now() - new Date(profile.birthDate).getTime()) / (365.25 * 24 * 3600 * 1000))
      : 'Onbekend';
    const weight = profile.weight || 75;
    const ftp = profile.ftp || 220;
    const lthr = profile.lthr || 170;

    // Calculate PMC
    const tssList = rides
      .filter(r => (r.tss ?? r.hrTSS) != null)
      .map(r => ({ date: r.date, tss: (r.tss ?? r.hrTSS)! }));
    const points = computePMC(tssList);
    const latest = points[points.length - 1] ?? { ctl: 0, atl: 0, tsb: 0 };

    // Format recent rides history
    const recentRides = [...rides]
      .sort((a, b) => b.date - a.date)
      .slice(0, 5)
      .map(r => {
        const dateStr = new Date(r.date).toLocaleDateString('nl-BE');
        const rpeStr = (r as any).rpe ? `RPE: ${(r as any).rpe}/10` : 'RPE: onbekend';
        return `- ${dateStr}: ${r.distance.toFixed(0)}km, duur: ${(r.duration/3600).toFixed(1)}u, ${rpeStr}, opmerkingen: ${r.notes || 'none'}`;
      })
      .join('\n');

    return `You are the personal cycling coach of the athlete.
Athlete data:
- Naam: ${name}
- Leeftijd: ${age}
- Gewicht: ${weight} kg
- FTP: ${ftp} Watt
- LTHR (drempelhartslag): ${lthr} bpm

Actuele fitheidscijfers:
- CTL (Fitheid): ${Math.round(latest.ctl)}
- ATL (Vermoeidheid): ${Math.round(latest.atl)}
- TSB (Vorm/Frisheid): ${Math.round(latest.tsb)} (negative TSB indicates fatigue, below -20 is risky)

Recente trainingsgeschiedenis:
${recentRides}

Houd hier rekening mee in je adviezen. Geef korte, concrete, direct toepasbare coachingadviezen in begrijpelijk Nederlands. Gebruik NOOIT emojis in je antwoorden.`;
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;

    const userMessage = input.trim();
    setInput('');
    setError(null);

    const updatedMessages = [...messages, { role: 'user', content: userMessage } as AIChatMessage];
    setMessages(updatedMessages);
    setSending(true);

    try {
      const response = await sendAIChat(updatedMessages, getSystemContext());
      setMessages([...updatedMessages, { role: 'assistant', content: response }]);
    } catch (err: any) {
      setError(err.message || 'Could not connect to the AI service.');
    } finally {
      setSending(false);
    }
  };

  if (provider === 'disabled') {
    return (
      <div
        className="wd-section-card animate-slide-up"
        style={{
          padding: 20,
          background: 'linear-gradient(135deg, rgba(255,255,255,0.01) 0%, rgba(255,255,255,0.005) 100%)',
          border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: 12,
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Brain size={22} style={{ color: '#64748b' }} />
          <h4 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#f8fafc', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            Interactieve AI Coach Chat
          </h4>
        </div>
        <p style={{ margin: '0 0 14px', fontSize: 11, color: '#94a3b8', lineHeight: 1.5 }}>
          De interactieve AI-coach is momenteel uitgeschakeld. Koppel een lokale **Ollama** server (gratis en 100% offline) of voeg een **OpenAI API-sleutel** toe in de instellingen om live advies te krijgen over je rideten en vermoeidheid.
        </p>
        {onGoToSettings && (
          <button
            onClick={onGoToSettings}
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              color: '#cbd5e1',
              borderRadius: 8,
              padding: '6px 14px',
              fontSize: 10,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontFamily: 'inheride',
            }}
          >
            <Settings size={12} /> AI Settings Openen
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="wd-chat-widget-card animate-slide-up">
      {/* Header */}
      <div className="wd-chat-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Brain size={20} style={{ color: '#cbd5e1', filter: 'drop-shadow(0 0 4px rgba(203, 213, 225, 0.4))' }} />
          <div>
            <h4 style={{ margin: 0, fontSize: 12, fontWeight: 900, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              Interactief Coach Gesprek
            </h4>
            <span style={{ fontSize: 9, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', display: 'inline-block', boxShadow: '0 0 6px #34d399' }} /> Live verbonden ({provider === 'ollama' ? 'Offline Lokaal' : 'OpenAI Cloud'})
            </span>
          </div>
        </div>
      </div>

      {/* Messages viewport */}
      <div className="wd-chat-messages-container">
        {messages.map((m, idx) => {
          const isUser = m.role === 'user';
          return (
            <div
              key={idx}
              style={{
                alignSelf: isUser ? 'flex-end' : 'flex-start',
                maxWidth: '80%',
                display: 'flex',
                gap: 10,
                flexDirection: isUser ? 'row-reverse' : 'row',
                alignItems: 'flex-start',
              }}
              className="animate-slide-up"
            >
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: isUser ? 'rgba(108, 92, 231, 0.2)' : 'rgba(203, 213, 225, 0.1)',
                  border: `1px solid ${isUser ? 'rgba(108, 92, 231, 0.4)' : 'rgba(203, 213, 225, 0.3)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  color: isUser ? '#a29bfe' : '#cbd5e1',
                  flexShrink: 0,
                  boxShadow: `0 2px 6px ${isUser ? 'rgba(108, 92, 231, 0.1)' : 'rgba(203, 213, 225, 0.1)'}`,
                }}
              >
                {isUser ? <User size={12} /> : <Brain size={12} />}
              </div>
              <div
                className={`wd-chat-bubble ${isUser ? 'wd-chat-bubble--user' : 'wd-chat-bubble--assistant'}`}
                style={{ whiteSpace: 'pre-wrap' }}
              >
                {m.content}
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {sending && (
          <div style={{ alignSelf: 'flex-start', display: 'flex', gap: 10, alignItems: 'center' }}>
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                background: 'rgba(203, 213, 225, 0.05)',
                border: '1px solid rgba(203, 213, 225, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#cbd5e1',
              }}
            >
              <Brain size={12} />
            </div>
            <div style={{ display: 'flex', gap: 4, padding: '10px 14px', background: 'rgba(255,255,255,0.015)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.03)' }}>
              <span className="typing-dot" style={{ width: 4, height: 4, background: '#cbd5e1', borderRadius: '50%' }} />
              <span className="typing-dot" style={{ width: 4, height: 4, background: '#cbd5e1', borderRadius: '50%', animationDelay: '0.2s' }} />
              <span className="typing-dot" style={{ width: 4, height: 4, background: '#cbd5e1', borderRadius: '50%', animationDelay: '0.4s' }} />
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div style={{ alignSelf: 'center', margin: '8px 0', padding: '8px 16px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 10, fontSize: 11, color: '#f87171' }}>
            ⚠️ {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSend} className="wd-chat-input-bar">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask the coach about your rides, zones or recovery..."
          disabled={sending}
          className="wd-chat-input-field"
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          className="wd-chat-send-btn"
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  );
};
