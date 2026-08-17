import { useEffect, useState } from 'react';
import { supabase } from './utils/supabaseClient';
import VigorDashboard from './pages/VigorDashboard';

function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Check URL hash for access_token and refresh_token
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.replace('#', '?'));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (accessToken && refreshToken) {
        supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        }).then(({ data, error }) => {
          if (!error && data.session) {
            setSession(data.session);
            // Clear hash so it doesn't linger in URL bar
            window.history.replaceState(null, '', window.location.pathname);
          }
          setLoading(false);
        });
        return;
      }
    }

    // 2. Regular session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#09090b', color: '#fff' }}>
        <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700 }}>Vigor laden...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#09090b', color: '#fff', padding: 24 }}>
        <h1 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 900, marginBottom: 12, letterSpacing: '2px' }}>ZENITH <span style={{ fontWeight: 400, color: '#64748b' }}>VIGOR</span></h1>
        <p style={{ color: '#94a3b8', marginBottom: 24, textAlign: 'center', maxWidth: 400, fontSize: 13, lineHeight: 1.5 }}>
          No active session found. Launch Zenith Vigor from Zenith Hub.
        </p>
        <button 
          onClick={() => {
            // Redirect to Hub in dev or prod
            const isDev = import.meta.env.DEV;
            window.location.href = isDev ? 'http://localhost:1420' : window.location.origin;
          }}
          style={{
            background: '#cbd5e1',
            color: '#09090b',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '8px',
            fontFamily: 'inherit',
            fontWeight: 800,
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            cursor: 'pointer'
          }}
        >
          To Zenith Hub
        </button>
      </div>
    );
  }

  return <VigorDashboard session={session} />;
}

export default App;
