import React, { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import { Mail, Lock, User, AlertCircle, ArrowRight } from 'lucide-react';
import '../workout.css';

export const LoginPage: React.FC = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(true);

  useEffect(() => {
    const savedEmail = localStorage.getItem('zenith_remember_email');
    const savedPassword = localStorage.getItem('zenith_remember_password');
    if (savedEmail) {
      setEmail(savedEmail);
      if (savedPassword) {
        setPassword(savedPassword);
      }
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      if (isSignUp) {
        // Sign Up
        const { error, data } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name: fullName || 'Atleet'
            }
          }
        });
        if (error) throw error;
        
        if (data?.user?.identities?.length === 0) {
          setErrorMsg("This email address is already registered. Please try logging in.");
        } else {
          setInfoMsg("Registration successful! Please check your email for the verification link.");
        }
      } else {
        // Sign In
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;

        // Remember credentials if login was successful
        if (rememberMe) {
          localStorage.setItem('zenith_remember_email', email);
          localStorage.setItem('zenith_remember_password', password);
        } else {
          localStorage.removeItem('zenith_remember_email');
          localStorage.removeItem('zenith_remember_password');
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || "An error occurred during authentication.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      width: '100vw',
      background: '#09090b',
      backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(16, 185, 129, 0.05) 0%, transparent 40%), radial-gradient(circle at 90% 80%, rgba(56, 189, 248, 0.05) 0%, transparent 40%)',
      fontFamily: "'Outfit', 'Inter', system-ui, -apple-system, sans-serif",
      color: '#f8fafc',
      padding: '24px',
      boxSizing: 'border-box'
    }}>
      <div className="animate-slide-up" style={{
        width: '100%',
        maxWidth: '420px',
        background: 'linear-gradient(135deg, rgba(18, 18, 22, 0.85) 0%, rgba(12, 12, 14, 0.9) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        borderRadius: '20px',
        padding: '40px 32px',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(20px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '24px',
        boxSizing: 'border-box'
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <h1 style={{
            fontSize: '28px',
            fontWeight: 900,
            margin: '8px 0 0 0',
            letterSpacing: '1px',
            textAlign: 'center',
            background: 'linear-gradient(135deg, #fff 0%, #cbd5e1 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            ZENITH
          </h1>
          <p style={{
            fontSize: '12px',
            color: '#94a3b8',
            margin: 0,
            textAlign: 'center',
            fontWeight: 500
          }}>
            {isSignUp ? 'Create your Zenith account to get started' : 'Sign in to your Zenith Dashboard'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {errorMsg && (
            <div style={{
              display: 'flex',
              gap: '8px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: '10px',
              padding: '12px',
              fontSize: '11px',
              color: '#f87171',
              alignItems: 'flex-start',
              lineHeight: 1.4
            }}>
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>{errorMsg}</span>
            </div>
          )}

          {infoMsg && (
            <div style={{
              display: 'flex',
              gap: '8px',
              background: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.25)',
              borderRadius: '10px',
              padding: '12px',
              fontSize: '11px',
              color: '#4ade80',
              alignItems: 'flex-start',
              lineHeight: 1.4
            }}>
              <Check size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>{infoMsg}</span>
            </div>
          )}

          {isSignUp && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#94a3b8', fontWeight: 700 }}>Full Name</label>
              <div style={{ position: 'relative' }}>
                <User size={13} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                <input
                  type="text"
                  required
                  placeholder="Your name"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    borderRadius: '10px',
                    padding: '11px 12px 11px 34px',
                    fontSize: '12px',
                    color: '#fff',
                    outline: 'none',
                    fontFamily: 'inherit',
                    transition: 'border-color 0.15s',
                    boxSizing: 'border-box'
                  }}
                  onFocus={e => e.target.style.borderColor = 'rgba(16, 185, 129, 0.4)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255, 255, 255, 0.05)'}
                />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#94a3b8', fontWeight: 700 }}>Email Address</label>
            <div style={{ position: 'relative' }}>
              <Mail size={13} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
              <input
                type="email"
                required
                placeholder="athlete@zenith.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: '10px',
                  padding: '11px 12px 11px 34px',
                  fontSize: '12px',
                  color: '#fff',
                  outline: 'none',
                  fontFamily: 'inherit',
                  transition: 'border-color 0.15s',
                  boxSizing: 'border-box'
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(16, 185, 129, 0.4)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255, 255, 255, 0.05)'}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#94a3b8', fontWeight: 700 }}>Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={13} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: '10px',
                  padding: '11px 12px 11px 34px',
                  fontSize: '12px',
                  color: '#fff',
                  outline: 'none',
                  fontFamily: 'inherit',
                  transition: 'border-color 0.15s',
                  boxSizing: 'border-box'
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(16, 185, 129, 0.4)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255, 255, 255, 0.05)'}
              />
            </div>
          </div>

          {!isSignUp && (
            <div 
              style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }} 
              onClick={() => setRememberMe(!rememberMe)}
            >
              <input 
                type="checkbox" 
                checked={rememberMe} 
                onChange={() => {}} 
                style={{
                  cursor: 'pointer',
                  accentColor: '#10b981'
                }}
              />
              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500 }}>
                Remember credentials
              </span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              background: 'linear-gradient(135deg, #10b981, #059669)',
              border: 'none',
              borderRadius: '10px',
              color: '#fff',
              fontWeight: 800,
              fontSize: '12px',
              padding: '12px',
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              boxShadow: '0 4px 15px rgba(16, 185, 129, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              marginTop: '10px',
              transition: 'transform 0.15s, opacity 0.15s',
              opacity: loading ? 0.7 : 1,
              fontFamily: 'inherit'
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
          >
            {loading ? (
              <div style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.2)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            ) : (
              <>
                <span>{isSignUp ? 'Create Account' : 'Log In'}</span>
                <ArrowRight size={14} />
              </>
            )}
          </button>
        </form>

        {/* Toggle */}
        <div style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.04)',
          width: '100%',
          paddingTop: '16px',
          textAlign: 'center',
          fontSize: '11px',
          color: '#94a3b8'
        }}>
          {isSignUp ? 'Already have an account?' : 'New to Zenith Ecosystem?'}{' '}
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setErrorMsg(null);
              setInfoMsg(null);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#34d399',
              fontWeight: 700,
              cursor: 'pointer',
              padding: 0,
              fontFamily: 'inherit'
            }}
          >
            {isSignUp ? 'Log In' : 'Create Account'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Add check export for LoginPage.tsx
const Check = ({ size, ...props }: any) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
