import React, { useEffect, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';

/**
 * Promise-based replacement for window.confirm / window.alert.
 *
 * The native dialogs work, but they block the JS thread, can't be styled, and
 * look like a browser chrome popup in the middle of an otherwise designed app -
 * which for a destructive action ("delete this workout?") reads as less
 * trustworthy than the UI around it.
 *
 * The API is deliberately shaped like the native one so call sites keep the
 * same control flow:
 *
 *   if (!(await zenithConfirm('Delete this run?'))) return;
 *
 * Rendered into its own detached root rather than through a provider, so an app
 * doesn't have to mount anything or thread context down to deeply nested
 * handlers - the call site is the only thing that changes.
 */

export interface ZenithDialogOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive. */
  danger?: boolean;
}

interface InternalOptions extends ZenithDialogOptions {
  mode: 'confirm' | 'alert';
  onResolve: (value: boolean) => void;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function ensureRoot(): Root {
  if (!container) {
    container = document.createElement('div');
    container.setAttribute('data-zenith-dialog-root', '');
    document.body.appendChild(container);
  }
  if (!root) root = createRoot(container);
  return root;
}

const DialogView: React.FC<InternalOptions> = ({
  mode, title, message, confirmLabel, cancelLabel, danger, onResolve,
}) => {
  const [closing, setClosing] = useState(false);

  const finish = (value: boolean) => {
    if (closing) return;
    setClosing(true);
    onResolve(value);
  };

  // Escape cancels, Enter confirms - matching what the native dialog does.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(false);
      if (e.key === 'Enter') finish(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const accent = danger ? '#ef4444' : '#38bdf8';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Confirm'}
      onClick={() => finish(false)}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100000,
        background: 'rgba(2, 6, 12, 0.72)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#0f172a',
          border: '1px solid rgba(148, 163, 184, 0.18)',
          borderRadius: 14,
          boxShadow: '0 24px 60px -20px rgba(0,0,0,0.8)',
          padding: '22px 24px',
          color: '#e2e8f0',
          fontFamily: 'inherit',
        }}
      >
        {title && (
          <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>
            {title}
          </h3>
        )}
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: '#cbd5e1', whiteSpace: 'pre-wrap' }}>
          {message}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
          {mode === 'confirm' && (
            <button
              type="button"
              onClick={() => finish(false)}
              style={{
                background: 'transparent',
                border: '1px solid rgba(148,163,184,0.28)',
                color: '#cbd5e1',
                padding: '8px 16px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {cancelLabel || 'Cancel'}
            </button>
          )}
          <button
            type="button"
            autoFocus
            onClick={() => finish(true)}
            style={{
              background: accent,
              border: 'none',
              color: danger ? '#fff' : '#04121c',
              padding: '8px 18px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {confirmLabel || (mode === 'confirm' ? 'Confirm' : 'OK')}
          </button>
        </div>
      </div>
    </div>
  );
};

function show(mode: 'confirm' | 'alert', options: ZenithDialogOptions): Promise<boolean> {
  // No DOM (SSR, tests): fall back to the native behaviour rather than hanging.
  if (typeof document === 'undefined') {
    return Promise.resolve(mode === 'alert');
  }

  return new Promise<boolean>(resolve => {
    const r = ensureRoot();
    const handleResolve = (value: boolean) => {
      r.render(<></>);
      resolve(value);
    };
    r.render(<DialogView {...options} mode={mode} onResolve={handleResolve} />);
  });
}

/** Styled replacement for window.confirm. Resolves true when confirmed. */
export function zenithConfirm(
  message: string,
  options: Omit<ZenithDialogOptions, 'message'> = {}
): Promise<boolean> {
  return show('confirm', { ...options, message });
}

/** Styled replacement for window.alert. Resolves when dismissed. */
export function zenithAlert(
  message: string,
  options: Omit<ZenithDialogOptions, 'message'> = {}
): Promise<void> {
  return show('alert', { ...options, message }).then(() => undefined);
}
