import React, { useEffect, useState } from 'react';
import {
  Brain, 
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
  ChevronDown,
  Bug,
  Terminal,
  Zap,
  MessageSquare,
  Link2
} from 'lucide-react';

export type TabKey = 'hub' | 'calendar' | 'ml' | 'aero' | 'vigor' | 'kratos' | 'fuel' | 'stride' | 'mobiel' | 'integrations' | 'profile' | 'logs' | 'prijzen' | 'roadmap';

interface SidebarProps {
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
  onLogout: () => void;
  userName: string;
  isPro?: boolean;
  isFounder?: boolean;
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
  isFounder = false,
  isCollapsed,
  setIsCollapsed,
  onOpenBugReport,
}) => {
  // Keyboard shortcut to toggle sidebar (Ctrl+B)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setIsCollapsed(!isCollapsed);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCollapsed, setIsCollapsed]);

  const toggleCollapse = () => setIsCollapsed(!isCollapsed);

  // Groups a person can fold away. Absent means open, so a group only ever
  // appears here once it has been deliberately closed.
  const [closedGroups, setClosedGroups] = useState<Record<string, boolean>>({});
  const toggleGroup = (title: string) =>
    setClosedGroups((prev) => ({ ...prev, [title]: !prev[title] }));

  const navGroups = [
    {
      title: 'General',
      // Always open: three items that are the point of the app, and folding
      // them away would only ever cost a click.
      collapsible: false,
      items: [
        { key: 'hub' as TabKey, label: 'Dashboard', icon: LayoutDashboard },
        { key: 'calendar' as TabKey, label: 'Calendar', icon: Calendar },
        { key: 'ml' as TabKey, label: 'Machine Learning', icon: Brain },
      ],
    },
    {
      title: 'Extensions',
      collapsible: true,
      // The subtitle is what each extension is for. Five one-word names in a
      // column say nothing on their own, and "Vigor" is not self-explanatory
      // to anyone who has not already used it.
      items: [
        { key: 'aero' as TabKey, label: 'Aero', icon: Bike, subtitle: 'Cycling & rides' },
        { key: 'vigor' as TabKey, label: 'Vigor', icon: Scale, subtitle: 'Recovery & health' },
        { key: 'kratos' as TabKey, label: 'Kratos', icon: Dumbbell, subtitle: 'Strength training' },
        { key: 'fuel' as TabKey, label: 'Fuel', icon: ChefHat, subtitle: 'Nutrition & recipes' },
        { key: 'stride' as TabKey, label: 'Stride', icon: Footprints, subtitle: 'Running & walking' },
      ],
    },
    {
      title: 'System & Community',
      collapsible: true,
      items: [
        { key: 'integrations' as TabKey, label: 'Integrations', icon: Link2 },
        { key: 'prijzen' as TabKey, label: 'Pricing & Pro', icon: Zap },
        { key: 'roadmap' as TabKey, label: 'Feature Requests', icon: MessageSquare },
        { key: 'mobiel' as TabKey, label: 'Download Center', icon: Smartphone },
        ...(isFounder ? [{ key: 'logs' as TabKey, label: 'Console Logs', icon: Terminal }] : []),
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
          {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Navigation Links */}
      <div className="zenith-sidebar-content">
        {navGroups.map((group, groupIdx) => {
          // Folding only applies to the expanded sidebar. Collapsed to icons
          // there is no heading to click, and a hidden group would leave a gap
          // with nothing to explain it.
          const isClosed = !isCollapsed && group.collapsible && !!closedGroups[group.title];
          return (
            <div key={groupIdx} className="zenith-sidebar-group">
              {!isCollapsed && (
                group.collapsible ? (
                  <button
                    type="button"
                    className="zenith-sidebar-group-toggle animate-fade-in"
                    onClick={() => toggleGroup(group.title)}
                    aria-expanded={!isClosed}
                  >
                    <span className="zenith-sidebar-group-title">{group.title}</span>
                    <ChevronDown
                      size={12}
                      className={`zenith-sidebar-group-chevron ${isClosed ? 'closed' : ''}`}
                    />
                  </button>
                ) : (
                  <h3 className="zenith-sidebar-group-title animate-fade-in">{group.title}</h3>
                )
              )}
              <div className={`zenith-sidebar-group-body ${isClosed ? 'closed' : ''}`}>
                <ul className="zenith-sidebar-menu">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.key;
                    const subtitle = (item as { subtitle?: string }).subtitle;
                    return (
                      <li key={item.key}>
                        <button
                          onClick={() => setActiveTab(item.key)}
                          className={`zenith-sidebar-menu-item ${isActive ? 'active' : ''} ${subtitle && !isCollapsed ? 'has-subtitle' : ''}`}
                          title={isCollapsed ? item.label : undefined}
                        >
                          <span className="zenith-sidebar-menu-icon">
                            <Icon size={18} />
                          </span>
                          {!isCollapsed && (
                            subtitle ? (
                              <span className="zenith-sidebar-menu-stack animate-fade-in">
                                <span className="zenith-sidebar-menu-label">{item.label}</span>
                                <span className="zenith-sidebar-menu-sub">{subtitle}</span>
                              </span>
                            ) : (
                              <span className="zenith-sidebar-menu-label animate-fade-in">
                                {item.label}
                              </span>
                            )
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          );
        })}
      </div>

      {/* Sidebar Footer */}
      <div className="zenith-sidebar-footer">
        <div className="zenith-sidebar-group zenith-sidebar-account-card">
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
      </div>
    </aside>
  );
};
