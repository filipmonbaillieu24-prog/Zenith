import React, { useState, useEffect, useMemo, useRef } from 'react';
import { loggerService, LogEntry } from '../../utils/loggerService';
import { 
  Terminal, 
  Search, 
  Copy, 
  Download, 
  Trash2, 
  Check, 
  Pause, 
  Play, 
  Filter,
  ChevronRight,
  ChevronDown
} from 'lucide-react';

export const SystemConsolePage: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [isPaused, setIsPaused] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = loggerService.subscribe((updatedLogs) => {
      if (!isPaused) {
        setLogs(updatedLogs);
      }
    });

    // Also listen to Tauri Rust BLE log events if available
    let unlistenBle: any = null;
    let unlistenBleLog: any = null;
    async function setupBleTauriListener() {
      if ((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__) {
        try {
          const { listen } = await import('@tauri-apps/api/event');
          unlistenBle = await listen<string>('colmi-sync-status', (event) => {
            loggerService.addLog('sync', 'Colmi', `Colmi Status: ${event.payload}`);
          });
          unlistenBleLog = await listen<string>('ble-log-message', (event) => {
            const text = event.payload || '';
            let category: 'Scale' | 'Colmi' | 'BLE' = 'BLE';
            if (text.includes('Colmi') || text.includes('Ring')) category = 'Colmi';
            else if (text.includes('Scale') || text.includes('weight') || text.includes('Weegschaal')) category = 'Scale';

            loggerService.addLog('ble', category, text);
          });
        } catch (err) {
          console.error("Failed to setup BLE listeners in console page:", err);
        }
      }
    }
    setupBleTauriListener();

    return () => {
      unsubscribe();
      if (unlistenBle) unlistenBle();
      if (unlistenBleLog) unlistenBleLog();
    };
  }, [isPaused]);

  // Filter logs based on category and search query
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchCategory = selectedCategory === 'ALL' || log.category === selectedCategory;
      const queryLower = searchQuery.toLowerCase();
      const matchQuery =
        !searchQuery ||
        log.message.toLowerCase().includes(queryLower) ||
        log.category.toLowerCase().includes(queryLower) ||
        (log.details && JSON.stringify(log.details).toLowerCase().includes(queryLower));

      return matchCategory && matchQuery;
    });
  }, [logs, selectedCategory, searchQuery]);

  // Copy logs to clipboard
  const handleCopyLogs = () => {
    const text = filteredLogs
      .map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.category}] ${l.message} ${l.details ? JSON.stringify(l.details) : ''}`)
      .join('\n');

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Download logs as .log file
  const handleDownloadLogs = () => {
    const text = filteredLogs
      .map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.category}] ${l.message} ${l.details ? JSON.stringify(l.details, null, 2) : ''}`)
      .join('\n');

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `zenith-system-logs-${new Date().toISOString().slice(0, 10)}.log`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleClearLogs = () => {
    if (window.confirm('Weet je zeker dat je het logboek wilt wissen?')) {
      loggerService.clearLogs();
    }
  };

  const getLevelBadgeStyle = (level: LogEntry['level']) => {
    switch (level) {
      case 'error':
        return { bg: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: 'rgba(239, 68, 68, 0.3)' };
      case 'warn':
        return { bg: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)' };
      case 'ble':
        return { bg: 'rgba(6, 182, 212, 0.15)', color: '#38bdf8', border: 'rgba(6, 182, 212, 0.3)' };
      case 'sync':
        return { bg: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', border: 'rgba(168, 85, 247, 0.3)' };
      default:
        return { bg: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: 'rgba(16, 185, 129, 0.3)' };
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto', color: '#f1f5f9' }}>
      {/* Header Title */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ padding: 8, borderRadius: 8, background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
              <Terminal size={22} style={{ color: '#60a5fa' }} />
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.5px' }}>
              System Console & Debug Logs
            </h1>
          </div>
          <p style={{ margin: '6px 0 0 0', color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
            Live overzicht van achtergrond-synchronisatie, Bluetooth BLE events en systeemmeldingen.
          </p>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={() => setIsPaused(!isPaused)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 8,
              border: isPaused ? '1px solid #f59e0b' : '1px solid rgba(255,255,255,0.1)',
              background: isPaused ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.04)',
              color: isPaused ? '#fbbf24' : '#94a3b8',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s'
            }}
          >
            {isPaused ? <Play size={14} /> : <Pause size={14} />}
            {isPaused ? 'Hervatten' : 'Pauzeer Stream'}
          </button>

          <button
            onClick={handleCopyLogs}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid rgba(59, 130, 246, 0.4)',
              background: 'rgba(59, 130, 246, 0.15)',
              color: '#60a5fa',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s'
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Gekopieerd!' : 'Kopieer Logs'}
          </button>

          <button
            onClick={handleDownloadLogs}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.04)',
              color: '#94a3b8',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s'
            }}
          >
            <Download size={14} /> Download .log
          </button>

          <button
            onClick={handleClearLogs}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid rgba(239, 68, 68, 0.3)',
              background: 'rgba(239, 68, 68, 0.1)',
              color: '#f87171',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s'
            }}
          >
            <Trash2 size={14} /> Wissen
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 16,
        padding: 12,
        borderRadius: 10,
        background: 'rgba(15, 23, 42, 0.6)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(10px)',
        flexWrap: 'wrap'
      }}>
        {/* Search Bar */}
        <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
          <input
            type="text"
            placeholder="Zoek in console logs (bijv. BLE, weight, Colmi, 86.4, error)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px 8px 36px',
              borderRadius: 8,
              border: '1px solid rgba(255, 255, 255, 0.1)',
              background: 'rgba(2, 6, 23, 0.6)',
              color: '#f8fafc',
              fontSize: 13,
              outline: 'none'
            }}
          />
        </div>

        {/* Category Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Filter size={12} /> Categorie:
          </span>
          {['ALL', 'Scale', 'Colmi', 'Supabase', 'ML', 'System'].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                border: selectedCategory === cat ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.08)',
                background: selectedCategory === cat ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255,255,255,0.03)',
                color: selectedCategory === cat ? '#60a5fa' : '#94a3b8',
                cursor: 'pointer'
              }}
            >
              {cat === 'ALL' ? 'Alle' : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Log Terminal Window */}
      <div
        ref={logContainerRef}
        style={{
          borderRadius: 12,
          background: '#040711',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', Consolas, monospace"
        }}
      >
        {/* Terminal Titlebar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          background: 'rgba(255, 255, 255, 0.03)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }}></span>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }}></span>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
            <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8, fontWeight: 500 }}>
              zenith-system-console.log
            </span>
          </div>

          <div style={{ fontSize: 12, color: '#64748b' }}>
            {filteredLogs.length} berichten {searchQuery && `(gefilterd op "${searchQuery}")`}
          </div>
        </div>

        {/* Terminal Body */}
        <div style={{
          maxHeight: '620px',
          overflowY: 'auto',
          padding: 16,
          fontSize: 12,
          lineHeight: '1.6'
        }}>
          {filteredLogs.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
              <Terminal size={32} style={{ marginBottom: 12, opacity: 0.5 }} />
              <div>Geen logberichten gevonden.</div>
            </div>
          ) : (
            filteredLogs.map((log) => {
              const badgeStyle = getLevelBadgeStyle(log.level);
              const isExpanded = expandedLogId === log.id;

              return (
                <div
                  key={log.id}
                  style={{
                    marginBottom: 6,
                    padding: '6px 8px',
                    borderRadius: 6,
                    background: isExpanded ? 'rgba(255, 255, 255, 0.04)' : 'transparent',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.02)',
                    transition: 'background 0.15s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'nowrap' }}>
                    {/* Timestamp */}
                    <span style={{ color: '#475569', fontSize: 11, minWidth: 85, userSelect: 'none' }}>
                      {log.timestamp}
                    </span>

                    {/* Level badge */}
                    <span style={{
                      padding: '1px 6px',
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      background: badgeStyle.bg,
                      color: badgeStyle.color,
                      border: `1px solid ${badgeStyle.border}`,
                      minWidth: 50,
                      textAlign: 'center'
                    }}>
                      {log.level}
                    </span>

                    {/* Category tag */}
                    <span style={{ color: '#94a3b8', fontWeight: 600, minWidth: 65 }}>
                      [{log.category}]
                    </span>

                    {/* Message */}
                    <span style={{ flex: 1, color: log.level === 'error' ? '#f87171' : log.level === 'warn' ? '#fbbf24' : '#e2e8f0', wordBreak: 'break-word' }}>
                      {log.message}
                    </span>

                    {/* Expand details toggle */}
                    {log.details && (
                      <button
                        onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#60a5fa',
                          cursor: 'pointer',
                          padding: 2,
                          display: 'flex',
                          alignItems: 'center'
                        }}
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    )}
                  </div>

                  {/* Expanded JSON details */}
                  {isExpanded && log.details && (
                    <div style={{
                      marginTop: 8,
                      marginLeft: 95,
                      padding: 10,
                      borderRadius: 6,
                      background: 'rgba(2, 6, 23, 0.8)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      color: '#a7f3d0',
                      fontSize: 11,
                      overflowX: 'auto'
                    }}>
                      <pre style={{ margin: 0, fontFamily: 'inherit' }}>
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
