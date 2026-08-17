import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 20, background: '#2d3748', color: '#fff', borderRadius: 8, margin: 20, border: '1px solid #fc8181', zIndex: 9999, position: 'relative' }}>
          <h2 style={{ color: '#fc8181', marginTop: 0 }}>🚨 Oops! An error occurred.</h2>
          <p style={{ fontWeight: 'bold' }}>{this.state.error && this.state.error.toString()}</p>
          <pre style={{ background: '#1a202c', padding: 10, borderRadius: 4, overflow: 'auto', fontSize: 12, maxHeight: 300 }}>
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </pre>
          <button 
            style={{ padding: '8px 16px', background: '#e2e8f0', color: '#1a202c', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}
            onClick={() => window.location.reload()}
          >
            App Herladen
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
