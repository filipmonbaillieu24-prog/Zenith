import React, { useEffect } from 'react';
import { 
  LayoutDashboard, 
  Calendar, 
  Bike, 
  Scale, 
  Dumbbell, 
  ChefHat, 
  Footprints,
  Smartphone, 
  User, 
  LogOut,
  ChevronLeft,
  ChevronRight,
  Bug,
  Terminal,
  Zap,
  MessageSquare,
  Link2
} from 'lucide-react';

export type TabKey = 'hub' | 'calendar' | 'aero' | 'vigor' | 'kratos' | 'fuel' | 'stride' | 'mobiel' | 'integrations' | 'profile' | 'logs' | 'prijzen' | 'roadmap';

interface SidebarProps {
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
  onLogout: () => void;
  userName: string;
  isPro?: boolean;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  onOpenBugReport: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  onLogout,
  userName,
  isPro = false,
  isCollapsed,
  setIsCollapsed,
  onOpenBugReport,
}) => {
  // Toggle collapse state
  const toggleCollapse = () => {
    const nextState = !isCollapsed;
    setIsCollapsed(nextState);
    localStorage.setItem('zenith_sidebar_collapsed', JSON.stringify(nextState));
  };

  // Keyboard shortcut to toggle sidebar (Ctrl+B)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleCollapse();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCollapsed]);

  const navGroups = [
    {
      title: 'General',
      items: [
        { key: 'hub' as TabKey, label: 'Dashboard', icon: LayoutDashboard },
        { key: 'calendar' as TabKey, label: 'Calendar', icon: Calendar },
      ],
    },
    {
      title: 'Extensions',
      items: [
        { key: 'aero' as TabKey, label: 'Aero', icon: Bike },
        { key: 'vigor' as TabKey, label: 'Vigor', icon: Scale },
        { key: 'kratos' as TabKey, label: 'Kratos', icon: Dumbbell },
        { key: 'fuel' as TabKey, label: 'Fuel', icon: ChefHat },
        { key: 'stride' as TabKey, label: 'Stride', icon: Footprints },
      ],
    },
    {
      title: 'System & Community',
      items: [
        { key: 'integrations' as TabKey, label: 'Integrations', icon: Link2 },
        { key: 'prijzen' as TabKey, label: 'Pricing & Pro', icon: Zap },
        { key: 'roadmap' as TabKey, label: 'Feature Requests', icon: MessageSquare },
        { key: 'mobiel' as TabKey, label: 'Download Center', icon: Smartphone },
        { key: 'logs' as TabKey, label: 'Console Logs', icon: Terminal },
      ],
    },
  ];

  return (
    <aside className={`zenith-sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Sidebar Header */}
      <div className="zenith-sidebar-header">
        {!isCollapsed && (
          <div className="zenith-sidebar-brand animate-fade-in">
            <span>ZENITH</span>
          </div>
        )}
        <button 
          onClick={toggleCollapse} 
          className="zenith-sidebar-toggle-btn" 
          title={isCollapsed ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)"}
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Navigation Links */}
      <div className="zenith-sidebar-content">
        {navGroups.map((group, groupIdx) => (
          <div key={groupIdx} className="zenith-sidebar-group">
            {!isCollapsed && <h3 className="zenith-sidebar-group-title animate-fade-in">{group.title}</h3>}
            <ul className="zenith-sidebar-menu">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.key;
                return (
                  <li key={item.key}>
                    <button
                      onClick={() => setActiveTab(item.key)}
                      className={`zenith-sidebar-menu-item ${isActive ? 'active' : ''}`}
                      title={isCollapsed ? item.label : undefined}
                    >
                      <span className="zenith-sidebar-menu-icon">
                        <Icon size={18} />
                      </span>
                      {!isCollapsed && (
                        <span className="zenith-sidebar-menu-label animate-fade-in">
                          {item.label}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* Sidebar Footer */}
      <div className="zenith-sidebar-footer">
        <div className="zenith-sidebar-user">
          <button
            onClick={() => setActiveTab('profile')}
            className={`zenith-sidebar-user-profile-btn ${activeTab === 'profile' ? 'active' : ''}`}
            title={isCollapsed ? `Profile of ${userName}` : undefined}
          >
            <div className="zenith-user-avatar">
              <User size={16} />
            </div>
            {!isCollapsed && (
              <div className="zenith-user-info animate-fade-in">
                <span className="zenith-user-name">{userName}</span>
                <span className="zenith-user-role" style={{ color: isPro ? '#c084fc' : '#94a3b8', fontWeight: isPro ? 900 : 700, fontSize: 10 }}>
                  {isPro ? 'ZENITH PRO' : 'ZENITH FREE'}
                </span>
              </div>
            )}
          </button>
        </div>
        
        <button 
          onClick={onOpenBugReport} 
          className="zenith-sidebar-bug-btn"
          title={isCollapsed ? "Report an Issue" : undefined}
        >
          <Bug size={16} />
          {!isCollapsed && <span className="animate-fade-in">Report an Issue</span>}
        </button>

        <button 
          onClick={onLogout} 
          className="zenith-sidebar-logout-btn"
          title="Log Out"
        >
          <LogOut size={16} />
          {!isCollapsed && <span className="animate-fade-in">Log Out</span>}
        </button>
      </div>
    </aside>
  );
};
