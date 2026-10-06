import React, { useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard,
  Network,
  ShieldCheck,
  ShieldAlert,
  MessageSquareText,
  Database,
  Activity,
  Settings,
  LogOut,
  Search,
  Bell,
  ArrowLeft,
  PieChart,
  Code,
  Menu,
  X,
} from 'lucide-react';
import { useStore } from '../../store';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { ThemeToggle } from '../shell/ThemeToggle';

function initialsFor(name?: string) {
  const parts = String(name || 'S').trim().split(/\s+/).filter(Boolean);
  const letters = (parts[0]?.[0] || 'S') + (parts[1]?.[0] || '');
  return letters.toUpperCase();
}

export function AppLayout() {
  const user = useStore((state) => state.user);
  const spaces = useStore((state) => state.spaces);
  const logout = useStore((state) => state.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const { spaceId } = useParams();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [showAlerts, setShowAlerts] = useState(false);

  const activeSpace = useMemo(() => spaces.find((s) => s.id === spaceId), [spaces, spaceId]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (!activeSpace) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-6">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-bold mb-2">Workspace not found</h2>
          <p className="text-sm text-[var(--muted-foreground)] mb-6">It may have been deleted from this browser, or the link is stale.</p>
          <Button onClick={() => navigate('/')}>Return to Spaces</Button>
        </div>
      </div>
    );
  }

  const navItems = [
    { name: 'Overview', path: `/space/${spaceId}`, icon: LayoutDashboard },
    { name: 'Visual Model', path: `/space/${spaceId}/visuals`, icon: PieChart },
    { name: 'Code Canvas', path: `/space/${spaceId}/code`, icon: Code },
    { name: 'AI Workspace', path: `/space/${spaceId}/chat`, icon: MessageSquareText },
    { name: 'Agent Topology', path: `/space/${spaceId}/topology`, icon: Network },
    { name: 'Governance', path: `/space/${spaceId}/governance`, icon: ShieldCheck },
    { name: 'Security', path: `/space/${spaceId}/security`, icon: ShieldAlert },
    { name: 'Data Sources', path: `/space/${spaceId}/data`, icon: Database },
    { name: 'Observability', path: `/space/${spaceId}/observability`, icon: Activity },
    { name: 'Settings', path: `/space/${spaceId}/settings`, icon: Settings },
  ];

  const filteredNav = navItems.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()));
  const alerts = (activeSpace.governanceLogs || []).slice(0, 5);

  const sidebar = (
    <>
      <div className="h-[76px] flex items-center px-4 border-b border-[var(--border)]">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="mr-2 shrink-0" title="Back to Workspaces">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex flex-col overflow-hidden">
          <span className="font-semibold tracking-tight truncate">{activeSpace.title}</span>
          <span className="text-[11px] text-[var(--muted-foreground)] truncate uppercase tracking-wider">Workspace</span>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto py-5 px-3 space-y-1 custom-scrollbar">
        <div className="text-[11px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider mb-3 px-3">
          Intelligence
        </div>
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === `/space/${spaceId}`}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) => `
              flex items-center px-3 py-2.5 rounded-2xl text-sm transition-all font-medium relative
              ${isActive
                ? 'bg-[var(--nav-active-bg)] text-[var(--nav-active-fg)] pl-[15px]'
                : 'text-[var(--nav-inactive-fg)] hover:bg-[var(--secondary)] hover:text-[var(--foreground)]'}
            `}
          >
            {({ isActive }) => (
              <>
                {isActive && <span aria-hidden className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-[var(--nav-marker)]" />}
                <item.icon className={`w-4 h-4 mr-3 ${isActive ? 'text-[var(--nav-active-fg)]' : ''}`} />
                {item.name}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-[var(--border)]">
        <div className="flex items-center justify-between">
          <div className="flex flex-col overflow-hidden">
            <span className="text-sm font-semibold truncate">{user?.name}</span>
            <span className="text-xs text-[var(--muted-foreground)] truncate">{user?.role}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout} className="text-[var(--muted-foreground)] hover:text-red-500">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <aside className="hidden md:flex w-64 border-r border-[var(--border)] bg-[var(--sidebar)] flex-col z-20">
        {sidebar}
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div className="fixed inset-0 z-40 md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
            <motion.aside
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              className="relative h-full w-72 bg-[var(--sidebar)] flex flex-col shadow-2xl"
            >
              <button className="absolute top-4 right-4" onClick={() => setMobileOpen(false)}><X className="w-4 h-4" /></button>
              {sidebar}
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-[76px] flex items-center justify-between px-4 md:px-8 sticky top-0 bg-[var(--header)] backdrop-blur-md z-10 border-b border-[var(--border)]/70">
          <div className="flex items-center flex-1 gap-3">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)}>
              <Menu className="w-5 h-5" />
            </Button>
            <div className="relative w-full max-w-md">
              <Search className="absolute left-4 top-3.5 h-4 w-4 text-[var(--muted-foreground)]" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search modules..."
                className="flex h-11 w-full rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-2 pl-11 text-sm shadow-sm placeholder:text-[var(--muted-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              />
              {query && (
                <div className="absolute top-13 left-0 right-0 mt-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-xl overflow-hidden z-30">
                  {filteredNav.length === 0 && <p className="p-3 text-sm text-[var(--muted-foreground)]">No matching modules</p>}
                  {filteredNav.map((item) => (
                    <button
                      key={item.path}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-[var(--secondary)]"
                      onClick={() => {
                        navigate(item.path);
                        setQuery('');
                      }}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3 ml-3">
            <ThemeToggle />
            <div className="relative">
              <Button variant="ghost" size="icon" className="relative rounded-full bg-[var(--card)] border border-[var(--border)] h-11 w-11" onClick={() => setShowAlerts((v) => !v)}>
                <Bell className="w-5 h-5" />
                {alerts.length > 0 && <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-blue-500 border-2 border-[var(--card)]" />}
              </Button>
              {showAlerts && (
                <div className="absolute right-0 mt-2 w-80 rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl p-3 z-40">
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)] mb-2">Recent governance</p>
                  {alerts.length === 0 && <p className="text-sm text-[var(--muted-foreground)] p-3">No events yet.</p>}
                  {alerts.map((event) => (
                    <button key={event.id} className="w-full text-left p-2.5 rounded-xl hover:bg-[var(--secondary)]" onClick={() => { setShowAlerts(false); navigate(`/space/${spaceId}/governance`); }}>
                      <p className="text-sm font-semibold truncate">{event.action}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">{event.agentName} · {event.status}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="h-11 w-11 rounded-full bg-[var(--nav-active-fg)] border border-[var(--border)] hidden sm:flex items-center justify-center text-[var(--primary-foreground)] font-bold text-sm">
              {initialsFor(user?.name)}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden overflow-y-auto relative p-4 md:p-8 pt-2 custom-scrollbar">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="h-full pt-3 w-full max-w-[1680px] mx-auto"
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
}
