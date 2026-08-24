import React, { useState, useEffect } from 'react';
import { getAISettings, saveAISettings, sendAIChat, AISettings } from '../../utils/ai';

export const AISettingsPanel: React.FC = () => {
  const [settings, setSettings] = useState<AISettings>({
    provider: 'disabled',
    ollamaUrl: 'http://localhost:11434',
    ollamaModel: 'qwen2',
    openaiKey: '',
    openaiModel: 'gpt-4o-mini',
  });

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    setSettings(getAISettings());
  }, []);

  const handleChange = (key: keyof AISettings, value: string) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    saveAISettings(updated);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const response = await sendAIChat(
        [{ role: 'user', content: 'Say "Connection successful!"' }],
        'You are a test agent.'
      );
      setTestResult({
        success: true,
        message: response || 'Connection established, no text received.',
      });
    } catch (e: any) {
      setTestResult({
        success: false,
        message: e.message || 'Unknown connection error.',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', padding: 18, borderRadius: 12 }}>
      
      {/* Provider Selector */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>AI Connection Type</label>
        <select
          value={settings.provider}
          onChange={e => handleChange('provider', e.target.value as any)}
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: '#f8fafc',
            padding: '8px 12px',
            fontSize: 12,
            borderRadius: 8,
            fontFamily: 'inherit',
            outline: 'none',
          }}
        >
          <option value="disabled" style={{ background: '#0d0d14' }}>Disabled</option>
          <option value="ollama" style={{ background: '#0d0d14' }}>Ollama (Local offline)</option>
          <option value="openai" style={{ background: '#0d0d14' }}>OpenAI API (Cloud)</option>
        </select>
        <p style={{ margin: '2px 0 0', fontSize: 10, color: '#64748b' }}>
          Select AI engine. Ollama runs 100% locally and offline on your computer without API keys.
        </p>
      </div>

      {/* Ollama Configuration */}
      {settings.provider === 'ollama' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'fadeIn 0.2s' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Ollama Server URL</label>
            <input
              type="text"
              value={settings.ollamaUrl}
              onChange={e => handleChange('ollamaUrl', e.target.value)}
              placeholder="http://localhost:11434"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#f8fafc',
                padding: '8px 12px',
                fontSize: 12,
                borderRadius: 8,
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Model Name</label>
            <input
              type="text"
              value={settings.ollamaModel}
              onChange={e => handleChange('ollamaModel', e.target.value)}
              placeholder="qwen2 or llama3"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#f8fafc',
                padding: '8px 12px',
                fontSize: 12,
                borderRadius: 8,
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
            <p style={{ margin: '2px 0 0', fontSize: 10, color: '#64748b' }}>
              Make sure you have downloaded this model first via Ollama (for example `ollama run qwen2` or `ollama run llama3`).
            </p>
          </div>
        </div>
      )}

      {/* OpenAI Configuration */}
      {settings.provider === 'openai' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'fadeIn 0.2s' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>OpenAI API Key</label>
            <input
              type="password"
              value={settings.openaiKey}
              onChange={e => handleChange('openaiKey', e.target.value)}
              placeholder="sk-..."
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#f8fafc',
                padding: '8px 12px',
                fontSize: 12,
                borderRadius: 8,
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Model</label>
            <input
              type="text"
              value={settings.openaiModel}
              onChange={e => handleChange('openaiModel', e.target.value)}
              placeholder="gpt-4o-mini"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#f8fafc',
                padding: '8px 12px',
                fontSize: 12,
                borderRadius: 8,
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
          </div>
        </div>
      )}

      {/* Connection Test */}
      {settings.provider !== 'disabled' && (
        <div style={{ marginTop: 6, borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 14 }}>
          <button
            onClick={handleTestConnection}
            disabled={testing}
            style={{
              background: 'rgba(203, 213, 225, 0.1)',
              border: '1px solid rgba(203, 213, 225, 0.25)',
              color: '#cbd5e1',
              padding: '8px 16px',
              fontSize: 11,
              fontWeight: 800,
              borderRadius: 8,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
          >
            {testing ? 'Testing connection...' : 'Test Connection'}
          </button>

          {testResult && (
            <div
              style={{
                marginTop: 10,
                padding: '10px 12px',
                borderRadius: 8,
                fontSize: 11,
                border: '1px solid',
                background: testResult.success ? 'rgba(52, 211, 153, 0.05)' : 'rgba(248, 113, 113, 0.05)',
                borderColor: testResult.success ? 'rgba(52, 211, 153, 0.2)' : 'rgba(248, 113, 113, 0.2)',
                color: testResult.success ? '#34d399' : '#f87171',
              }}
            >
              <strong>{testResult.success ? 'Success!' : 'Error:'}</strong> {testResult.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
