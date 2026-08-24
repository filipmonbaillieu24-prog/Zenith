import { isTrustedZenithOrigin } from '@zenith/shared';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'ble' | 'sync';
  category: 'BLE' | 'Colmi' | 'Scale' | 'Supabase' | 'Iframe' | 'System' | 'ML';
  message: string;
  details?: any;
}

type LogListener = (logs: LogEntry[]) => void;

class LoggerService {
  private logs: LogEntry[] = [];
  private listeners: Set<LogListener> = new Set();
  private maxLogs = 1000;
  private tauriInitialized = false;

  constructor() {
    this.initConsoleInterceptors();
    this.initWindowPostMessageListener();
    this.initTauriGlobalListeners();
  }

  private initConsoleInterceptors() {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = (...args: any[]) => {
      originalLog.apply(console, args);
      this.captureConsole('info', args);
    };

    console.warn = (...args: any[]) => {
      originalWarn.apply(console, args);
      this.captureConsole('warn', args);
    };

    console.error = (...args: any[]) => {
      originalError.apply(console, args);
      this.captureConsole('error', args);
    };
  }

  private initWindowPostMessageListener() {
    window.addEventListener('message', (event) => {
      if (!isTrustedZenithOrigin(event.origin)) return;
      if (event.data && typeof event.data === 'object') {
        const { type } = event.data;
        if (type === 'native-weight-received') {
          this.addLog('ble', 'Scale', `[Scale] Weight received: ${event.data.weight} kg (Stable: ${event.data.is_stable ? 'Yes' : 'No'})`, event.data);
        } else if (type === 'native-metrics-received') {
          this.addLog('ble', 'Scale', `[Scale] Body composition metrics received`, event.data);
        } else if (type === 'colmi-sync-status-update') {
          this.addLog('sync', 'Colmi', `[Colmi] Status Update: ${event.data.status || ''}`, event.data);
        } else if (type === 'colmi-sync-result') {
          if (event.data.success) {
            this.addLog('sync', 'Colmi', `[Colmi] Synchronization successfully completed`, event.data);
          } else {
            this.addLog('error', 'Colmi', `[Colmi] Synchronization error: ${event.data.error || 'Unknown'}`, event.data);
          }
        }
      }
    });
  }

  private initTauriGlobalListeners() {
    if (this.tauriInitialized) return;
    if ((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__) {
      this.tauriInitialized = true;
      import('@tauri-apps/api/event').then(({ listen }) => {
        // Global listener for Rust log_ble messages
        listen<string>('ble-log-message', (event) => {
          const text = event.payload || '';
          let category: LogEntry['category'] = 'BLE';
          if (text.includes('Colmi') || text.includes('Ring') || text.includes('0x43') || text.includes('0x44') || text.includes('0x27') || text.includes('0xBC')) {
            category = 'Colmi';
          } else if (text.includes('Scale') || text.includes('weight') || text.includes('Neo') || text.includes('Onyx') || text.includes('Yolanda')) {
            category = 'Scale';
          }

          this.addLog('ble', category, text);
        });

        // Global listener for Colmi status updates
        listen<string>('colmi-sync-status', (event) => {
          this.addLog('sync', 'Colmi', `[Colmi Status] ${event.payload}`);
        });

        // Global listener for Native Weight events
        listen<any>('native-weight-received', (event) => {
          const payload = event.payload;
          if (payload && payload.weight) {
            this.addLog('ble', 'Scale', `[Scale] Native BLE Weight measurement: ${payload.weight} kg (Stable: ${payload.is_stable ? 'Yes' : 'No'})`, payload);
          }
        });

        // Global listener for Native Metrics events
        listen<any>('native-metrics-received', (event) => {
          const payload = event.payload;
          if (payload) {
            this.addLog('ble', 'Scale', `[Scale] Body composition metrics received`, payload);
          }
        });
      }).catch((err) => {
        console.error("Error registering global Tauri event listeners in LoggerService:", err);
      });
    }
  }

  private captureConsole(level: 'info' | 'warn' | 'error', args: any[]) {
    const textMessage = args
      .map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg)))
      .join(' ');

    // Avoid duplicate logging if message comes from LoggerService itself
    if (textMessage.includes('[Colmi]') || textMessage.includes('[Scale]') || textMessage.includes('[BLE]')) {
      // Handled via explicit addLog
      return;
    }

    let category: LogEntry['category'] = 'System';
    let logMsg = textMessage;

    if (textMessage.includes('BLE') || textMessage.includes('scale') || textMessage.includes('Neo') || textMessage.includes('Onyx')) {
      category = 'Scale';
    } else if (textMessage.includes('Colmi') || textMessage.includes('ring') || textMessage.includes('Q-Ring')) {
      category = 'Colmi';
    } else if (textMessage.includes('Supabase') || textMessage.includes('vigor_') || textMessage.includes('kratos_')) {
      category = 'Supabase';
    } else if (textMessage.includes('iframe')) {
      category = 'Iframe';
    } else if (textMessage.includes('ML') || textMessage.includes('PMC') || textMessage.includes('model')) {
      category = 'ML';
    }

    this.addLog(level, category, logMsg);
  }

  public addLog(
    level: LogEntry['level'],
    category: LogEntry['category'],
    message: string,
    details?: any
  ) {
    const now = new Date();
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      timestamp: now.toISOString().split('T')[1].slice(0, 12),
      level,
      category,
      message,
      details
    };

    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }

    this.notifyListeners();
  }

  public getLogs(): LogEntry[] {
    return [...this.logs];
  }

  public clearLogs() {
    this.logs = [];
    this.notifyListeners();
  }

  public subscribe(listener: LogListener) {
    this.listeners.add(listener);
    listener([...this.logs]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    const currentLogs = [...this.logs];
    this.listeners.forEach(listener => listener(currentLogs));
  }
}

export const loggerService = new LoggerService();
