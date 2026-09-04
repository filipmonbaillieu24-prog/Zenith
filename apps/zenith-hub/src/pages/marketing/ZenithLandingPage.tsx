import React from 'react';
import { 
  Sparkles, 
  Bike, 
  Activity, 
  Dumbbell, 
  ChefHat, 
  Footprints,
  Smartphone,
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
      backgroundColor: 'var(--zenith-color-bg)',
      backgroundImage: 'var(--zenith-ground)',
      backgroundAttachment: 'fixed',
      color: '#f8fafc',
      fontFamily: "'Outfit', 'Inter', system-ui, -apple-system, sans-serif",
      position: 'relative'
    }}>
      {/* Zenith Radial Background Glow */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: '1200px',
        height: '600px',
        background: 'radial-gradient(circle at 50% 10%, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.04) 45%, transparent 75%)',
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
        backgroundColor: 'rgba(9, 9, 11, 0.90)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        padding: '16px 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <div style={{
            background: 'linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%)',
            width: 38,
            height: 38,
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 20px rgba(56, 189, 248, 0.25)'
          }}>
            <Sparkles size={20} color="#09090b" />
          </div>
          <div>
            <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: '1.5px', color: '#fff' }}>ZENITH</span>
            <span style={{ fontSize: 10, textTransform: 'uppercase', color: '#cbd5e1', marginLeft: 8, fontWeight: 800, letterSpacing: '1px' }}>ECOSYSTEM</span>
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
              background: 'linear-gradient(135deg, #38bdf8 0%, #3b82f6 100%)',
              border: 'none',
              color: '#09090b',
              fontWeight: 900,
              fontSize: 13,
              padding: '8px 20px',
              borderRadius: 10,
              cursor: 'pointer',
              boxShadow: '0 4px 18px rgba(56, 189, 248, 0.35)',
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
          background: 'rgba(56, 189, 248, 0.08)',
          border: '1px solid rgba(56, 189, 248, 0.2)',
          padding: '6px 18px',
          borderRadius: 20,
          color: '#38bdf8',
          fontSize: 12,
          fontWeight: 800,
          marginBottom: 24,
          letterSpacing: '0.5px'
        }}>
          <Sparkles size={14} color="#38bdf8" /> Zenith Ecosystem v2.0
        </div>

        <h1 style={{
          fontSize: 'clamp(38px, 5.8vw, 68px)',
          fontWeight: 900,
          lineHeight: 1.12,
          letterSpacing: '-1px',
          margin: '0 0 24px',
          background: 'linear-gradient(180deg, #ffffff 0%, #cbd5e1 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}>
          Perform, Recover & <br />
          <span style={{ color: '#38bdf8', WebkitTextFillColor: '#38bdf8' }}>Transform Physically.</span>
        </h1>

        <p style={{
          fontSize: 'clamp(15px, 2vw, 18px)',
          color: '#94a3b8',
          maxWidth: '760px',
          margin: '0 auto 40px',
          lineHeight: 1.6
        }}>
          The central athletic ecosystem connecting Cycling, Strength Training, Running, Nutrition, and Health Connect recovery into one unified platform.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
          <button 
            onClick={onRegister}
            style={{
              background: 'linear-gradient(135deg, #38bdf8 0%, #3b82f6 100%)',
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
              boxShadow: '0 10px 30px rgba(56, 189, 248, 0.35)',
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

      {/* Ecosystem Apps Grid (Zenith Hub Cards) */}
      <section id="ecosystem" style={{
        maxWidth: '1200px',
        margin: '60px auto 100px',
        padding: '0 24px'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          <h2 style={{ fontSize: 28, fontWeight: 900, color: '#fff', marginBottom: 12 }}>
            Five Powerful Extensions. One Central Dashboard.
          </h2>
          <p style={{ fontSize: 14, color: '#94a3b8', margin: 0 }}>
            Every Zenith extension is specifically tailored for an essential component of your athletic journey.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
          {/* Card 1: Aero */}
          <div style={{
            background: 'linear-gradient(145deg, #12131a 0%, #1a1b24 100%)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
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
                Cycling extension featuring AI route generation based on wind & elevation profiles plus live in-ear audio coaching.
              </p>
              <ul style={{ paddingLeft: 18, fontSize: 12, color: '#cbd5e1', lineHeight: 1.8, margin: 0 }}>
                <li>AI Route Generator & GPX/TCX Export</li>
                <li>PMC Fitness Chart (CTL / ATL / TSB)</li>
                <li>FIT & GPX Ride Analysis with Power & Cadence</li>
                <li>Geographic Heatmap & Climbs Tracker</li>
              </ul>
            </div>
          </div>

          {/* Card 2: Vigor */}
          <div style={{
            background: 'linear-gradient(145deg, #12131a 0%, #1a1b24 100%)',
            border: '1px solid rgba(168, 85, 247, 0.25)',
            borderRadius: '22px',
            padding: '30px',
            boxShadow: '0 12px 35px rgba(0,0,0,0.6)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: 'rgba(168, 85, 247, 0.12)', border: '1px solid rgba(168, 85, 247, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <Activity size={24} color="#a855f7" />
              </div>
              <h3 style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: '0 0 8px' }}>Zenith Vigor</h3>
              <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5, marginBottom: 18 }}>
                Health & recovery tracker for body weight, body composition, circumferences, and ML Sleep Score.
              </p>
              <ul style={{ paddingLeft: 18, fontSize: 12, color: '#cbd5e1', lineHeight: 1.8, margin: 0 }}>
                <li>Smart Scale BLE Auto-Sync</li>
                <li>Body Circumferences (8 zones) & Progress Photos</li>
                <li>Zenith Sleep & Recovery Engine (ML Sleep Score)</li>
                <li>Health Connect Steps & Energy Sync</li>
              </ul>
            </div>
          </div>

          {/* Card 3: Kratos */}
          <div style={{
            background: 'linear-gradient(145deg, #12131a 0%, #1a1b24 100%)',
            border: '1px solid rgba(249, 115, 22, 0.25)',
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
                Strength training & muscle building tracker with interactive anatomical muscle load heatmap.
              </p>
              <ul style={{ paddingLeft: 18, fontSize: 12, color: '#cbd5e1', lineHeight: 1.8, margin: 0 }}>
                <li>Workout Logging & Exercise Library</li>
                <li>Anatomical Muscle Load Heatmap</li>
                <li>1RM Repetition Max & Autoregulation (RIR)</li>
                <li>Built-in Rest Timer with Audio Focus</li>
              </ul>
            </div>
          </div>

          {/* Card 4: Fuel */}
          <div style={{
            background: 'linear-gradient(145deg, #12131a 0%, #1a1b24 100%)',
            border: '1px solid rgba(74, 222, 128, 0.25)',
            borderRadius: '22px',
            padding: '30px',
            boxShadow: '0 12px 35px rgba(0,0,0,0.6)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: 'rgba(74, 222, 128, 0.12)', border: '1px solid rgba(74, 222, 128, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <ChefHat size={24} color="#4ade80" />
              </div>
              <h3 style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: '0 0 8px' }}>Zenith Fuel</h3>
              <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5, marginBottom: 18 }}>
                Nutrition intake, macronutrients, and hydration tracker tailored to your workout workload.
              </p>
              <ul style={{ paddingLeft: 18, fontSize: 12, color: '#cbd5e1', lineHeight: 1.8, margin: 0 }}>
                <li>Calories & Macros (Protein, Carbs, Fats)</li>
                <li>Hydration & Fluid Balance Logging</li>
                <li>Dynamic Energy Targets based on Aero/Kratos Workouts</li>
                <li>OpenFoodFacts Barcode Scanner Support</li>
              </ul>
            </div>
          </div>

          {/* Card 5: Stride */}
          <div style={{
            background: 'linear-gradient(145deg, #12131a 0%, #1a1b24 100%)',
            border: '1px solid rgba(236, 72, 153, 0.25)',
            borderRadius: '22px',
            padding: '30px',
            boxShadow: '0 12px 35px rgba(0,0,0,0.6)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: 'rgba(236, 72, 153, 0.12)', border: '1px solid rgba(236, 72, 153, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <Footprints size={24} color="#ec4899" />
              </div>
              <h3 style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: '0 0 8px' }}>Zenith Stride</h3>
              <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5, marginBottom: 18 }}>
                Running extension featuring pace analysis, shoe tracking, and muscle heatmap recovery integration.
              </p>
              <ul style={{ paddingLeft: 18, fontSize: 12, color: '#cbd5e1', lineHeight: 1.8, margin: 0 }}>
                <li>Run Session & Interval Logging</li>
                <li>Pace (min/km), Cadence & Elevation Breakdown</li>
                <li>Running Shoe Mileage Tracker</li>
                <li>Direct Integration with Muscle Fatigue Heatmap</li>
              </ul>
            </div>
          </div>

          {/* Card 6: Mobile Pilots */}
          <div style={{
            background: 'linear-gradient(145deg, #12131a 0%, #1a1b24 100%)',
            border: '1px solid rgba(96, 165, 250, 0.25)',
            borderRadius: '22px',
            padding: '30px',
            boxShadow: '0 12px 35px rgba(0,0,0,0.6)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: 'rgba(96, 165, 250, 0.12)', border: '1px solid rgba(96, 165, 250, 0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <Smartphone size={24} color="#60a5fa" />
              </div>
              <h3 style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: '0 0 8px' }}>Android Mobile Pilots</h3>
              <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5, marginBottom: 18 }}>
                Dedicated Android companion apps for cycling, gym workouts, or daily health tracking.
              </p>
              <ul style={{ paddingLeft: 18, fontSize: 12, color: '#cbd5e1', lineHeight: 1.8, margin: 0 }}>
                <li>Zenith Aero Pilot (Live In-Ear Audio Coach)</li>
                <li>Zenith Kratos Pilot (Set & Rep Rest Timer)</li>
                <li>Automatic Health Connect Sync</li>
                <li>In-App Auto-Updates via QR Download Center</li>
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
          Sign up for free and experience the complete athletic ecosystem on web & mobile.
        </p>
        <button 
          onClick={onRegister}
          style={{
            background: 'linear-gradient(135deg, #38bdf8 0%, #3b82f6 100%)',
            color: '#09090b',
            fontWeight: 900,
            fontSize: 14,
            padding: '12px 30px',
            borderRadius: 12,
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(56, 189, 248, 0.35)',
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
