import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { supabase } from './utils/supabaseClient';
import VigorDashboard from './pages/VigorDashboard';
import { ExtensionSessionGate } from '@zenith/shared';

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
        <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700 }}>Loading Vigor...</div>
      </div>
    );
  }

  if (!session) {
    return <ExtensionSessionGate appName="Vigor" icon={<Activity size={28} />} />;
  }

  return <VigorDashboard session={session} />;
}

export default App;
