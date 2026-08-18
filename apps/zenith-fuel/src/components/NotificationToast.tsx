import React from 'react';
import { ShieldAlert, Check } from 'lucide-react';

interface NotificationToastProps {
  notification: { text: string; isError: boolean } | null;
}

export const NotificationToast: React.FC<NotificationToastProps> = ({ notification }) => {
  if (!notification) return null;

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl border shadow-2xl flex items-center gap-3 backdrop-blur-lg animate-in fade-in slide-in-from-bottom-4 duration-300 ${
        notification.isError
          ? 'bg-rose-950/90 border-rose-500/30 text-rose-200'
          : 'bg-emerald-950/90 border-emerald-500/30 text-emerald-200'
      }`}
    >
      {notification.isError ? (
        <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
      ) : (
        <Check className="w-5 h-5 text-emerald-400 shrink-0" />
      )}
      <span className="text-sm font-medium">{notification.text}</span>
    </div>
  );
};
