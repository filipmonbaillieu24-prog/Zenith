import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search } from 'lucide-react';

export interface CommandItem {
  id:           string;
  icon:         React.ReactNode;
  label:        string;
  description?: string;
  shortcut?:    string;
  action:       () => void;
  category:     string;
}

interface Props {
  isOpen:   boolean;
  onClose:  () => void;
  commands: CommandItem[];
}

export const CommandPalette: React.FC<Props> = ({ isOpen, onClose, commands }) => {
  const [query,       setQuery]       = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query.trim() === ''
    ? commands
    : commands.filter(c =>
        c.label.toLowerCase().includes(query.toLowerCase()) ||
        (c.description?.toLowerCase().includes(query.toLowerCase()))
      );

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setHighlighted(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleSelect = useCallback((cmd: CommandItem) => {
    cmd.action();
    onClose();
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape')    { onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, filtered.length - 1)); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)); }
      if (e.key === 'Enter' && filtered[highlighted]) { handleSelect(filtered[highlighted]); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, filtered, highlighted, handleSelect, onClose]);

  useEffect(() => setHighlighted(0), [query]);

  if (!isOpen) return null;

  const categories = [...new Set(filtered.map(c => c.category))];

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.72)',
          backdropFilter: 'blur(6px)',
          zIndex: 9998,
          animation: 'fadeIn 0.1s ease',
        }}
      />

      {/* Palette panel */}
      <div style={{
        position:  'fixed',
        top:       '16%',
        left:      '50%',
        transform: 'translateX(-50%)',
        zIndex:    9999,
        width:     '100%',
        maxWidth:  520,
        background: '#0f0f13',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 16,
        boxShadow: '0 24px 64px rgba(0,0,0,0.65), 0 0 0 1px rgba(56, 189, 248, 0.06)',
        overflow: 'hidden',
        fontFamily: 'Inter, system-ui, sans-serif',
        animation: 'slideDown 0.15s ease',
      }}>
        {/* Search input row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <Search size={15} color="#64748b" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search an action or page..."
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              color: '#f8fafc',
              fontSize: 14,
              fontFamily: 'inherit',
            }}
          />
          <kbd style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 4,
            padding: '2px 6px',
            fontSize: 10,
            color: '#64748b',
            fontFamily: 'inherit',
            flexShrink: 0,
          }}>
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 360, overflowY: 'auto', padding: '4px 0' }}>
          {filtered.length === 0 ? (
            <div style={{
              padding: '28px 16px', textAlign: 'center',
              color: '#475569', fontSize: 13,
            }}>
              No results for &ldquo;{query}&rdquo;
            </div>
          ) : (
            categories.map(cat => {
              const catItems   = filtered.filter(c => c.category === cat);
              const globalStart = filtered.indexOf(catItems[0]);
              return (
                <div key={cat}>
                  {/* Category label */}
                  <div style={{
                    padding: '6px 16px 3px',
                    fontSize: 10,
                    fontWeight: 700,
                    color: '#475569',
                    textTransform: 'uppercase',
                    letterSpacing: '0.7px',
                  }}>
                    {cat}
                  </div>

                  {catItems.map((cmd, localIdx) => {
                    const globalIdx = globalStart + localIdx;
                    const isActive  = globalIdx === highlighted;
                    return (
                      <div
                        key={cmd.id}
                        onClick={() => handleSelect(cmd)}
                        onMouseEnter={() => setHighlighted(globalIdx)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '8px 14px',
                          cursor: 'pointer',
                          background: isActive ? 'rgba(255, 255, 255, 0.07)' : 'transparent',
                          borderLeft: isActive ? '2px solid #38bdf8' : '2px solid transparent',
                          transition: 'background 0.08s, border-color 0.08s',
                        }}
                      >
                        {/* Icon */}
                        <div style={{
                          width: 30, height: 30,
                          borderRadius: 8,
                          background: isActive ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255,255,255,0.04)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: isActive ? '#cbd5e1' : '#64748b',
                          flexShrink: 0,
                        }}>
                          {cmd.icon}
                        </div>

                        {/* Label + description */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: isActive ? '#f8fafc' : '#cbd5e1',
                          }}>
                            {cmd.label}
                          </div>
                          {cmd.description && (
                            <div style={{
                              fontSize: 11, color: '#64748b', marginTop: 1,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {cmd.description}
                            </div>
                          )}
                        </div>

                        {/* Shortcut badge */}
                        {cmd.shortcut && (
                          <kbd style={{
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.07)',
                            borderRadius: 4,
                            padding: '2px 6px',
                            fontSize: 10,
                            color: '#64748b',
                            fontFamily: 'inherit',
                            flexShrink: 0,
                          }}>
                            {cmd.shortcut}
                          </kbd>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts legend */}
        <div style={{
          padding: '7px 14px',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          gap: 16,
          background: 'rgba(0,0,0,0.2)',
        }}>
          {[['↑↓', 'navigeren'], ['↵', 'openen'], ['ESC', 'sluiten']].map(([k, d]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <kbd style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 3,
                padding: '1px 5px',
                fontSize: 10,
                color: '#64748b',
              }}>
                {k}
              </kbd>
              <span style={{ fontSize: 10, color: '#64748b' }}>{d}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};
