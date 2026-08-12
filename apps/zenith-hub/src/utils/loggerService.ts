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

  constructor() {
    this.initConsoleInterceptors();
    this.initWindowPostMessageListener();
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
      if (event.data && typeof event.data === 'object') {
        const { type } = event.data;
        if (type === 'native-weight-received') {
          this.addLog('ble', 'Scale', `Weegschaal gewicht ontvangen: ${event.data.weight} kg`, event.data);
        } else if (type === 'native-metrics-received') {
          this.addLog('ble', 'Scale', `Weegschaal lichaamsstatistieken ontvangen`, event.data);
        } else if (type === 'colmi-sync-status-update') {
          this.addLog('sync', 'Colmi', `Colmi Ring Status: ${event.data.status || ''}`, event.data);
        } else if (type === 'colmi-sync-result') {
          this.addLog('sync', 'Colmi', `Colmi Ring Synchronisatie Resultaat`, event.data);
        }
      }
    });
  }

  private captureConsole(level: 'info' | 'warn' | 'error', args: any[]) {
    const textMessage = args
      .map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg)))
      .join(' ');

    let category: LogEntry['category'] = 'System';
    let logMsg = textMessage;

    if (textMessage.includes('BLE') || textMessage.includes('scale') || textMessage.includes('weegschaal')) {
      category = 'Scale';
    } else if (textMessage.includes('Colmi') || textMessage.includes('ring')) {
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
