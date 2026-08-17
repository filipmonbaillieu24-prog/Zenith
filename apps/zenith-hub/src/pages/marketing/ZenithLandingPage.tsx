import React from 'react';
import { 
  Sparkles, 
  Bike, 
  Activity, 
  Dumbbell, 
  Utensils, 
  ArrowRight
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
      height: '100vh',
      width: '100vw',
      overflowY: 'auto',
      overflowX: 'hidden',
      backgroundColor: '#09090b',
      color: '#f8fafc',
      fontFamily: "'Outfit', 'Inter', system-ui, -apple-system, sans-serif",
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
        background: 'radial-gradient(circle at 50% 10%, rgba(16, 185, 129, 0.18) 0%, rgba(56, 189, 248, 0.08) 40%, transparent 70%)',
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
        backgroundColor: 'rgba(9, 9, 11, 0.85)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        padding: '16px 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <div style={{
            background: 'linear-gradient(135deg, #10b981 0%, #38bdf8 100%)',
            width: 36,
            height: 36,
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 18px rgba(16, 185, 129, 0.4)'
          }}>
            <Sparkles size={20} color="#09090b" />
          </div>
          <div>
            <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: '1px', color: '#fff' }}>ZENITH</span>
            <span style={{ fontSize: 10, textTransform: 'uppercase', color: '#34d399', marginLeft: 8, fontWeight: 800, letterSpacing: '1px' }}>ECOSYSTEEM</span>
          </div>
        </div>

        <nav style={{ display: 'flex', alignItems: 'center', gap: 28, fontSize: 13, fontWeight: 600 }}>
          <a href="#ecosysteem" style={{ color: '#cbd5e1', textDecoration: 'none', transition: 'color 0.2s' }}>Ecosysteem</a>
          <button 
            onClick={() => onNavigateTab('prijzen')} 
            style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}
          >
            Prijzen & Pro
          </button>
          <button 
            onClick={() => onNavigateTab('roadmap')} 
            style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}
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
              transition: 'all 0.2s',
              fontFamily: 'inherit'
            }}
          >
            Inloggen
          </button>

          <button 
            onClick={onRegister}
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              border: 'none',
              color: '#fff',
              fontWeight: 900,
              fontSize: 13,
              padding: '8px 20px',
              borderRadius: 10,
              cursor: 'pointer',
              boxShadow: '0 4px 18px rgba(16, 185, 129, 0.4)',
              transition: 'all 0.2s',
              fontFamily: 'inherit'
            }}
          >
            Account Aanmaken
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section style={{
        maxWidth: '1100px',
        margin: '60px auto 60px',
        padding: '0 24px',
        textAlign: 'center',
        position: 'relative',
        zIndex: 1
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(16, 185, 129, 0.12)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          padding: '6px 18px',
          borderRadius: 20,
          color: '#34d399',
          fontSize: 12,
          fontWeight: 800,
          marginBottom: 24,
          letterSpacing: '0.5px'
        }}>
          <Sparkles size={14} /> Het All-in-One Atleten Platform
        </div>

        <h1 style={{
          fontSize: 'clamp(36px, 5.5vw, 64px)',
          fontWeight: 900,
          lineHeight: 1.15,
          letterSpacing: '-1px',
          margin: '0 0 24px',
          background: 'linear-gradient(180deg, #ffffff 0%, #cbd5e1 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}>
          Presteren, Herstellen & <br />
          <span style={{ color: '#10b981', WebkitTextFillColor: '#10b981' }}>Fysiek Transformeren.</span>
        </h1>

        <p style={{
          fontSize: 'clamp(15px, 2vw, 18px)',
          color: '#94a3b8',
          maxWidth: '740px',
          margin: '0 auto 40px',
          lineHeight: 1.6
        }}>
          Zenith integreert AI-routeplanning, gewicht & lichaamsmetingen, krachttraining en voeding in één gestroomlijnd atletenplatform.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
          <button 
            onClick={onRegister}
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #38bdf8 100%)',
              color: '#09090b',
              fontWeight: 900,
              fontSize: 15,
              padding: '14px 34px',
              borderRadius: 14,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              boxShadow: '0 10px 30px rgba(16, 185, 129, 0.35)',
              fontFamily: 'inherit'
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
              cursor: 'pointer',
              fontFamily: 'inherit'
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
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          <h2 style={{ fontSize: 28, fontWeight: 900, color: '#fff', marginBottom: 12 }}>
            Vier Krachtige Extensies. Één Centraal Hub.
          </h2>
          <p style={{ fontSize: 14, color: '#94a3b8', margin: 0 }}>
            Elke Zenith extensie is afgestemd op een specifiek onderdeel van je sportieve prestaties.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24 }}>
          {/* Card 1: Aero */}
          <div style={{
            background: 'linear-gradient(145deg, rgba(14, 30, 45, 0.8) 0%, rgba(18, 18, 24, 0.95) 100%)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            borderRadius: '22px',
            padding: '30px',
            boxShadow: '0 12px 35px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: 'rgba(56, 189, 248, 0.15)', border: '1px solid rgba(56, 189, 248, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <Bike size={24} color="#38bdf8" />
              </div>
              <h3 style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: '0 0 8px' }}>Zenith Aero</h3>
              <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5, marginBottom: 18 }}>
                Wielren extensie met AI-routegenerator op basis van wind & hoogteprofiel.
              </p>
              <ul style={{ paddingLeft: 18, fontSize: 12, color: '#cbd5e1', lineHeight: 1.8, margin: 0 }}>
                <li>AI Route Generator & GPX/TCX Export</li>
                <li>PMC Conditiegrafiek (CTL / ATL / TSB)</li>
                <li>FIT & GPX rit-analyse met Best Power</li>
                <li>All-Time Warmtekaart & Klimmen</li>
              </ul>
            </div>
          </div>

          {/* Card 2: Vigor */}
          <div style={{
            background: 'linear-gradient(145deg, rgba(14, 38, 28, 0.8) 0%, rgba(18, 18, 24, 0.95) 100%)',
            border: '1px solid rgba(52, 211, 153, 0.25)',
            borderRadius: '22px',
            padding: '30px',
            boxShadow: '0 12px 35px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: 'rgba(52, 211, 153, 0.15)', border: '1px solid rgba(52, 211, 153, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <Activity size={24} color="#34d399" />
              </div>
              <h3 style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: '0 0 8px' }}>Zenith Vigor</h3>
              <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5, marginBottom: 18 }}>
                Gezondheids- & omtrektracker voor gewicht, lichaamssamenstelling en slaap.
              </p>
              <ul style={{ paddingLeft: 18, fontSize: 12, color: '#cbd5e1', lineHeight: 1.8, margin: 0 }}>
                <li>Gewicht (kg) & Stappen tracking</li>
                <li>Lichaamsomtrekken (8 zones)</li>
                <li>Voortgangsfoto's & Side-by-side slider</li>
                <li>Colmi Smart Ring Slaapfases</li>
              </ul>
            </div>
          </div>

          {/* Card 3: Kratos */}
          <div style={{
            background: 'linear-gradient(145deg, rgba(42, 26, 16, 0.8) 0%, rgba(18, 18, 24, 0.95) 100%)',
            border: '1px solid rgba(249, 115, 22, 0.25)',
            borderRadius: '22px',
            padding: '30px',
            boxShadow: '0 12px 35px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: 'rgba(249, 115, 22, 0.15)', border: '1px solid rgba(249, 115, 22, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <Dumbbell size={24} color="#f97316" />
              </div>
              <h3 style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: '0 0 8px' }}>Zenith Kratos</h3>
              <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5, marginBottom: 18 }}>
                Krachttraining & spieropbouw tracker met anatomische spierbelasting heatmap.
              </p>
              <ul style={{ paddingLeft: 18, fontSize: 12, color: '#cbd5e1', lineHeight: 1.8, margin: 0 }}>
                <li>Workout logging & Oefeningen bibliotheek</li>
                <li>Spierbelasting Heatmap (Anatomisch)</li>
                <li>1RM Repetition Max Calculator</li>
                <li>Progressieve overbelasting grafieken</li>
              </ul>
            </div>
          </div>

          {/* Card 4: Fuel */}
          <div style={{
            background: 'linear-gradient(145deg, rgba(20, 30, 48, 0.8) 0%, rgba(18, 18, 24, 0.95) 100%)',
            border: '1px solid rgba(96, 165, 250, 0.25)',
            borderRadius: '22px',
            padding: '30px',
            boxShadow: '0 12px 35px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: 'rgba(96, 165, 250, 0.15)', border: '1px solid rgba(96, 165, 250, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <Utensils size={24} color="#60a5fa" />
              </div>
              <h3 style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: '0 0 8px' }}>Zenith Fuel</h3>
              <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5, marginBottom: 18 }}>
                Voedingsinname, macronutriënten en hydratatie tracking op maat.
              </p>
              <ul style={{ paddingLeft: 18, fontSize: 12, color: '#cbd5e1', lineHeight: 1.8, margin: 0 }}>
                <li>Kalorieën & Macro's (Eiwit, Koolhydraten, Vet)</li>
                <li>Hydratatie & Vochtbalans loggen</li>
                <li>Energietargets gebaseerd op Aero/Kratos ritten</li>
                <li>Dagelijks voedingsdagboek</li>
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
        background: 'rgba(12, 12, 16, 0.95)'
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
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            color: '#fff',
            fontWeight: 900,
            fontSize: 14,
            padding: '12px 30px',
            borderRadius: 12,
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(16, 185, 129, 0.4)',
            fontFamily: 'inherit'
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
