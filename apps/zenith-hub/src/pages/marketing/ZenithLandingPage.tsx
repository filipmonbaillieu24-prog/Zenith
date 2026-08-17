import React from 'react';
import { 
  Sparkles, 
  Bike, 
  Activity, 
  Dumbbell, 
  Utensils, 
  ArrowRight, 
  ShieldCheck, 
  Zap, 
  CheckCircle2, 
  Star,
  Users,
  Compass,
  Flame,
  Layers
} from 'lucide-react';

interface ZenithLandingPageProps {
  onLogin: () => void;
  onRegister: () => void;
  onNavigateTab: (tab: string) => void;
}

export const ZenithLandingPage: React.FC<ZenithLandingPageProps> = ({
  onLogin,
  onRegister,
  onNavigateTab,
}) => {
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#09090b',
      color: '#f8fafc',
      fontFamily: 'Outfit, sans-serif',
      overflowX: 'hidden',
      position: 'relative'
    }}>
      {/* Background Glow Overlay */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: '1200px',
        height: '600px',
        background: 'radial-gradient(circle at 50% 10%, rgba(168, 85, 247, 0.15) 0%, rgba(57, 255, 20, 0.05) 40%, transparent 70%)',
        pointerEvents: 'none',
        zIndex: 0
      }} />

      {/* Top Navbar */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        backgroundColor: 'rgba(9, 9, 11, 0.8)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        padding: '16px 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <div style={{
            background: 'linear-gradient(135deg, #a855f7 0%, #39ff14 100%)',
            width: 34,
            height: 34,
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 15px rgba(168, 85, 247, 0.4)'
          }}>
            <Sparkles size={20} color="#000" />
          </div>
          <div>
            <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: '1px', color: '#fff' }}>ZENITH</span>
            <span style={{ fontSize: 10, textTransform: 'uppercase', color: '#39ff14', marginLeft: 8, fontWeight: 800, letterSpacing: '1px' }}>WEB APP</span>
          </div>
        </div>

        <nav style={{ display: 'flex', alignItems: 'center', gap: 24, fontSize: 13, fontWeight: 600 }}>
          <a href="#ecosysteem" style={{ color: '#cbd5e1', textDecoration: 'none' }}>Ecosysteem</a>
          <button 
            onClick={() => onNavigateTab('prijzen')} 
            style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            Prijzen & Pro
          </button>
          <button 
            onClick={() => onNavigateTab('roadmap')} 
            style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          >
            Feature Requests
          </button>
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button 
            onClick={onLogin}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 13,
              padding: '8px 18px',
              borderRadius: 10,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Inloggen
          </button>

          <button 
            onClick={onRegister}
            style={{
              background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)',
              border: 'none',
              color: '#fff',
              fontWeight: 900,
              fontSize: 13,
              padding: '8px 20px',
              borderRadius: 10,
              cursor: 'pointer',
              boxShadow: '0 4px 15px rgba(168, 85, 247, 0.4)',
              transition: 'all 0.2s'
            }}
          >
            Account Aanmaken
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section style={{
        maxWidth: '1100px',
        margin: '80px auto 60px',
        padding: '0 24px',
        textAlign: 'center',
        position: 'relative',
        zIndex: 1
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(168, 85, 247, 0.12)',
          border: '1px solid rgba(168, 85, 247, 0.3)',
          padding: '6px 16px',
          borderRadius: 20,
          color: '#c084fc',
          fontSize: 12,
          fontWeight: 800,
          marginBottom: 24
        }}>
          <Sparkles size={14} /> Het All-in-One Atleten Platform
        </div>

        <h1 style={{
          fontSize: 'clamp(36px, 6vw, 64px)',
          fontWeight: 900,
          lineHeight: 1.1,
          letterSpacing: '-1px',
          margin: '0 0 20px',
          background: 'linear-gradient(180deg, #ffffff 0%, #cbd5e1 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}>
          Presteren, Herstellen & <br />
          <span style={{ color: '#a855f7', WebkitTextFillColor: '#a855f7' }}>Fysiek Transformeren.</span>
        </h1>

        <p style={{
          fontSize: 'clamp(15px, 2vw, 18px)',
          color: '#94a3b8',
          maxWidth: '720px',
          margin: '0 auto 36px',
          lineHeight: 1.6
        }}>
          Zenith integreert AI-routeplanning, lichaamsmetingen, krachttraining en voeding in één naadloze webapplicatie voor duursport- en fitnesatleten.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
          <button 
            onClick={onRegister}
            style={{
              background: 'linear-gradient(135deg, #a855f7 0%, #39ff14 100%)',
              color: '#09090b',
              fontWeight: 900,
              fontSize: 15,
              padding: '14px 32px',
              borderRadius: 14,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              boxShadow: '0 10px 30px rgba(168, 85, 247, 0.3)'
            }}
          >
            Start Gratis Account <ArrowRight size={18} />
          </button>

          <button 
            onClick={() => onNavigateTab('prijzen')}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#fff',
              fontWeight: 800,
              fontSize: 15,
              padding: '14px 28px',
              borderRadius: 14,
              cursor: 'pointer'
            }}
          >
            Bekijk Prijzen & Pro
          </button>
        </div>
      </section>

      {/* Ecosystem Apps Grid */}
      <section id="ecosysteem" style={{
        maxWidth: '1200px',
        margin: '60px auto 100px',
        padding: '0 24px'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h2 style={{ fontSize: 28, fontWeight: 900, color: '#fff', marginBottom: 10 }}>
            Vier Krachtige Extensies. Één Centraal Hub.
          </h2>
          <p style={{ fontSize: 14, color: '#94a3b8', margin: 0 }}>
            Elke Zenith extensie is speciaal ontwikkeld voor een specifiek onderdeel van je sportieve leven.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24 }}>
          {/* Card 1: Aero */}
          <div style={{
            background: 'linear-gradient(145deg, rgba(30, 27, 46, 0.8) 0%, rgba(18, 18, 24, 0.9) 100%)',
            border: '1px solid rgba(168, 85, 247, 0.2)',
            borderRadius: '20px',
            padding: '28px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(168, 85, 247, 0.15)', border: '1px solid rgba(168, 85, 247, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                <Bike size={22} color="#a855f7" />
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 900, color: '#fff', margin: '0 0 8px' }}>Zenith Aero</h3>
              <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5, marginBottom: 16 }}>
                AI-aangedreven wielren extensie met automatische GPX routegenerator op basis van wind & hoogte.
              </p>
              <ul style={{ paddingLeft: 18, fontSize: 11, color: '#cbd5e1', lineHeight: 1.8, margin: 0 }}>
                <li>AI Route Generator & GPX/TCX Export</li>
                <li>PMC Conditiegrafiek (CTL / ATL / TSB)</li>
                <li>FIT & GPX rit-analyse met Best Power</li>
                <li>All-Time Warmtekaart & Klimmen</li>
              </ul>
            </div>
          </div>

          {/* Card 2: Vigor */}
          <div style={{
            background: 'linear-gradient(145deg, rgba(20, 32, 25, 0.8) 0%, rgba(18, 18, 24, 0.9) 100%)',
            border: '1px solid rgba(57, 255, 20, 0.2)',
            borderRadius: '20px',
            padding: '28px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(57, 255, 20, 0.15)', border: '1px solid rgba(57, 255, 20, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                <Activity size={22} color="#39ff14" />
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 900, color: '#fff', margin: '0 0 8px' }}>Zenith Vigor</h3>
              <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5, marginBottom: 16 }}>
                Health & Vitality tracker voor gewicht, lichaamssamenstelling, omtrekken en slaapkwaliteit.
              </p>
              <ul style={{ paddingLeft: 18, fontSize: 11, color: '#cbd5e1', lineHeight: 1.8, margin: 0 }}>
                <li>Gewicht (kg) & Stappen tracking</li>
                <li>Lichaamsomtrekken (8 zones)</li>
                <li>Voortgangsfoto's & Side-by-side slider</li>
                <li>Colmi Smart Ring Slaapfases</li>
              </ul>
            </div>
          </div>

          {/* Card 3: Kratos */}
          <div style={{
            background: 'linear-gradient(145deg, rgba(38, 28, 20, 0.8) 0%, rgba(18, 18, 24, 0.9) 100%)',
            border: '1px solid rgba(255, 159, 67, 0.2)',
            borderRadius: '20px',
            padding: '28px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255, 159, 67, 0.15)', border: '1px solid rgba(255, 159, 67, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                <Dumbbell size={22} color="#ff9f43" />
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 900, color: '#fff', margin: '0 0 8px' }}>Zenith Kratos</h3>
              <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5, marginBottom: 16 }}>
                Krachttraining & spieropbouw tracker met automatische spiergroep belasting heatmap.
              </p>
              <ul style={{ paddingLeft: 18, fontSize: 11, color: '#cbd5e1', lineHeight: 1.8, margin: 0 }}>
                <li>Workout logging & Oefeningen bibliotheek</li>
                <li>Spierbelasting Heatmap (Anatomisch)</li>
                <li>1RM Repetition Max Calculator</li>
                <li>Progressieve overbelasting grafieken</li>
              </ul>
            </div>
          </div>

          {/* Card 4: Fuel */}
          <div style={{
            background: 'linear-gradient(145deg, rgba(20, 30, 42, 0.8) 0%, rgba(18, 18, 24, 0.9) 100%)',
            border: '1px solid rgba(96, 165, 250, 0.2)',
            borderRadius: '20px',
            padding: '28px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(96, 165, 250, 0.15)', border: '1px solid rgba(96, 165, 250, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                <Utensils size={22} color="#60a5fa" />
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 900, color: '#fff', margin: '0 0 8px' }}>Zenith Fuel</h3>
              <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5, marginBottom: 16 }}>
                Voedingsinname, macronutriënten en hydratatie tracking afgestemd op je trainingsbelasting.
              </p>
              <ul style={{ paddingLeft: 18, fontSize: 11, color: '#cbd5e1', lineHeight: 1.8, margin: 0 }}>
                <li>Kalorieën & Macro's (Eiwit, Koolhydraten, Vet)</li>
                <li>Hydratatie & Vochtbalans loggen</li>
                <li>Energietargets gebaseerd op Aero/Kratos ritten</li>
                <li>Dagelijkse voedingsdagboek</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Footer CTA Banner */}
      <footer style={{
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        padding: '60px 24px 40px',
        textAlign: 'center',
        background: 'rgba(12, 12, 16, 0.9)'
      }}>
        <h3 style={{ fontSize: 24, fontWeight: 900, color: '#fff', marginBottom: 12 }}>
          Klaar om Zenith te gebruiken?
        </h3>
        <p style={{ fontSize: 14, color: '#94a3b8', marginBottom: 24 }}>
          Meld je gratis aan en ervaar het complete atleten platform direct op de web app.
        </p>
        <button 
          onClick={onRegister}
          style={{
            background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)',
            color: '#fff',
            fontWeight: 900,
            fontSize: 14,
            padding: '12px 28px',
            borderRadius: 12,
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(168, 85, 247, 0.4)'
          }}
        >
          Nu Registreren
        </button>
        <div style={{ marginTop: 40, fontSize: 11, color: '#64748b' }}>
          © 2026 Zenith Ecosystem. Hosted on Vercel.
        </div>
      </footer>
    </div>
  );
};
