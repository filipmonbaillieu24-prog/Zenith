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
      {/* Zenith Steel Grey Background Glow Overlay */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: '1200px',
        height: '600px',
        background: 'radial-gradient(circle at 50% 10%, rgba(45, 45, 58, 0.4) 0%, rgba(16, 185, 129, 0.08) 40%, transparent 75%)',
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
        backgroundColor: 'rgba(12, 13, 18, 0.88)',
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
            <span style={{ fontSize: 10, textTransform: 'uppercase', color: '#34d399', marginLeft: 8, fontWeight: 800, letterSpacing: '1px' }}>ECOSYSTEM</span>
          </div>
        </div>

        <nav style={{ display: 'flex', alignItems: 'center', gap: 28, fontSize: 13, fontWeight: 600 }}>
          <a href="#ecosystem" style={{ color: '#cbd5e1', textDecoration: 'none', transition: 'color 0.2s' }}>Ecosystem</a>
          <button 
            onClick={() => onNavigateTab('prijzen')} 
            style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}
          >
            Pricing & Pro
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
            Log In
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
              boxShadow: '0 4px 18px rgba(16, 185, 129, 0.35)',
              transition: 'all 0.2s',
              fontFamily: 'inherit'
            }}
          >
            Create Account
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
          background: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          padding: '6px 18px',
          borderRadius: 20,
          color: '#cbd5e1',
          fontSize: 12,
          fontWeight: 800,
          marginBottom: 24,
          letterSpacing: '0.5px'
        }}>
          <Sparkles size={14} color="#10b981" /> Zenith Steel Grey Edition
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
          Perform, Recover & <br />
          <span style={{ color: '#10b981', WebkitTextFillColor: '#10b981' }}>Transform Physically.</span>
        </h1>

        <p style={{
          fontSize: 'clamp(15px, 2vw, 18px)',
          color: '#94a3b8',
          maxWidth: '740px',
          margin: '0 auto 40px',
          lineHeight: 1.6
        }}>
          Zenith integrates AI route planning, body composition & circumferences, strength training, and nutrition into one seamless athletic web application.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
          <button 
            onClick={onRegister}
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#fff',
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
            Start Free Account <ArrowRight size={18} />
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
            View Pricing & Pro
          </button>
        </div>
      </section>

      {/* Ecosystem Apps Grid (Zenith Steel Grey Cards) */}
      <section id="ecosystem" style={{
        maxWidth: '1200px',
        margin: '60px auto 100px',
        padding: '0 24px'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          <h2 style={{ fontSize: 28, fontWeight: 900, color: '#fff', marginBottom: 12 }}>
            Four Powerful Extensions. One Central Hub.
          </h2>
          <p style={{ fontSize: 14, color: '#94a3b8', margin: 0 }}>
            Every Zenith extension is tailored for a specific component of your athletic journey.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24 }}>
          {/* Card 1: Aero (Steel Grey) */}
          <div style={{
            background: 'linear-gradient(145deg, #12131a 0%, #1a1b24 100%)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: '22px',
            padding: '30px',
            boxShadow: '0 12px 35px rgba(0,0,0,0.6)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <Bike size={24} color="#38bdf8" />
              </div>
              <h3 style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: '0 0 8px' }}>Zenith Aero</h3>
              <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5, marginBottom: 18 }}>
                Cycling extension with AI-powered route generator based on wind & elevation profiles.
              </p>
              <ul style={{ paddingLeft: 18, fontSize: 12, color: '#cbd5e1', lineHeight: 1.8, margin: 0 }}>
                <li>AI Route Generator & GPX/TCX Export</li>
                <li>PMC Fitness Chart (CTL / ATL / TSB)</li>
                <li>FIT & GPX Ride Analysis with Best Power</li>
                <li>All-Time Heatmap & Climbs</li>
              </ul>
            </div>
          </div>

          {/* Card 2: Vigor (Steel Grey) */}
          <div style={{
            background: 'linear-gradient(145deg, #12131a 0%, #1a1b24 100%)',
            border: '1px solid rgba(52, 211, 153, 0.3)',
            borderRadius: '22px',
            padding: '30px',
            boxShadow: '0 12px 35px rgba(0,0,0,0.6)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: 'rgba(52, 211, 153, 0.12)', border: '1px solid rgba(52, 211, 153, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <Activity size={24} color="#34d399" />
              </div>
              <h3 style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: '0 0 8px' }}>Zenith Vigor</h3>
              <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5, marginBottom: 18 }}>
                Health & vitality tracker for body weight, composition, circumferences, and sleep.
              </p>
              <ul style={{ paddingLeft: 18, fontSize: 12, color: '#cbd5e1', lineHeight: 1.8, margin: 0 }}>
                <li>Weight (kg) & Steps tracking</li>
                <li>Body circumferences (8 zones)</li>
                <li>Progress photos & Side-by-side comparator</li>
                <li>Colmi Smart Ring Deep & REM Sleep</li>
              </ul>
            </div>
          </div>

          {/* Card 3: Kratos (Steel Grey) */}
          <div style={{
            background: 'linear-gradient(145deg, #12131a 0%, #1a1b24 100%)',
            border: '1px solid rgba(249, 115, 22, 0.3)',
            borderRadius: '22px',
            padding: '30px',
            boxShadow: '0 12px 35px rgba(0,0,0,0.6)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: 'rgba(249, 115, 22, 0.12)', border: '1px solid rgba(249, 115, 22, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <Dumbbell size={24} color="#f97316" />
              </div>
              <h3 style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: '0 0 8px' }}>Zenith Kratos</h3>
              <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5, marginBottom: 18 }}>
                Strength training & muscle building tracker with anatomical muscle load heatmap.
              </p>
              <ul style={{ paddingLeft: 18, fontSize: 12, color: '#cbd5e1', lineHeight: 1.8, margin: 0 }}>
                <li>Workout logging & Exercises library</li>
                <li>Muscle Load Heatmap (Anatomical)</li>
                <li>1RM Repetition Max Calculator</li>
                <li>Progressive overload charts</li>
              </ul>
            </div>
          </div>

          {/* Card 4: Fuel (Steel Grey) */}
          <div style={{
            background: 'linear-gradient(145deg, #12131a 0%, #1a1b24 100%)',
            border: '1px solid rgba(96, 165, 250, 0.3)',
            borderRadius: '22px',
            padding: '30px',
            boxShadow: '0 12px 35px rgba(0,0,0,0.6)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: 'rgba(96, 165, 250, 0.12)', border: '1px solid rgba(96, 165, 250, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <Utensils size={24} color="#60a5fa" />
              </div>
              <h3 style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: '0 0 8px' }}>Zenith Fuel</h3>
              <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5, marginBottom: 18 }}>
                Nutrition intake, macronutrients, and hydration tracking tailored to your workload.
              </p>
              <ul style={{ paddingLeft: 18, fontSize: 12, color: '#cbd5e1', lineHeight: 1.8, margin: 0 }}>
                <li>Calories & Macros (Protein, Carbs, Fat)</li>
                <li>Hydration & Fluid Balance logging</li>
                <li>Energy targets based on Aero/Kratos workouts</li>
                <li>Daily nutrition diary</li>
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
        background: '#0c0d12'
      }}>
        <h3 style={{ fontSize: 24, fontWeight: 900, color: '#fff', marginBottom: 12 }}>
          Ready to elevate your athletic performance?
        </h3>
        <p style={{ fontSize: 14, color: '#94a3b8', marginBottom: 24 }}>
          Sign up for free and experience the complete athletic ecosystem directly on the web.
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
          Create Free Account
        </button>
        <div style={{ marginTop: 40, fontSize: 11, color: '#64748b' }}>
          © 2026 Zenith Ecosystem. Hosted on Vercel.
        </div>
      </footer>
    </div>
  );
};
