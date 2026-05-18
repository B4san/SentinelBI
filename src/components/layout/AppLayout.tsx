import React, { useMemo } from 'react';
import { NavLink, Outlet, useNavigate, useParams, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { 
  LayoutDashboard, 
  Network, 
  ShieldCheck, 
  ShieldAlert, 
  MessageSquareText, 
  Database,
  TrendingUp,
  Activity,
  Settings,
  LogOut,
  Hexagon,
  Search,
  Bell,
  ArrowLeft,
  PieChart,
  Code
} from 'lucide-react';
import { useStore } from '../../store';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

export function AppLayout() {
  const user = useStore(state => state.user);
  const spaces = useStore(state => state.spaces);
  const logout = useStore(state => state.logout);
  const navigate = useNavigate();
  const { spaceId } = useParams();

  const activeSpace = useMemo(() => spaces.find(s => s.id === spaceId), [spaces, spaceId]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (!activeSpace) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-4">Workspace not found</h2>
          <Button onClick={() => navigate('/')}>Return to Spaces</Button>
        </div>
      </div>
    );
  }

  const navItems = [
    { name: 'Workspace Overview', path: `/space/${spaceId}`, icon: LayoutDashboard },
    { name: 'Visual Model', path: `/space/${spaceId}/visuals`, icon: PieChart },
    { name: 'Code Canvas', path: `/space/${spaceId}/code`, icon: Code },
    { name: 'AI Workspace', path: `/space/${spaceId}/chat`, icon: MessageSquareText },
    { name: 'Agent Topology', path: `/space/${spaceId}/topology`, icon: Network },
    { name: 'Governance Center', path: `/space/${spaceId}/governance`, icon: ShieldCheck },
    { name: 'Security & Risks', path: `/space/${spaceId}/security`, icon: ShieldAlert },
    { name: 'Data Sources', path: `/space/${spaceId}/data`, icon: Database },
    { name: 'Observability', path: `/space/${spaceId}/observability`, icon: Activity },
    { name: 'Settings', path: `/space/${spaceId}/settings`, icon: Settings },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      {/* Sidebar */}
      <aside className="w-64 border-r border-gray-100 bg-white flex flex-col z-20">
        <div className="h-[88px] flex items-center px-6 border-b border-gray-100">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="mr-3 text-gray-400 hover:text-gray-900 bg-gray-50 rounded-full shrink-0" title="Back to Workspaces">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex flex-col overflow-hidden">
            <span className="font-semibold text-gray-900 tracking-tight truncate">{activeSpace.title}</span>
            <span className="text-[11px] text-gray-400 truncate uppercase tracking-wider font-medium">Workspace</span>
          </div>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-1.5 custom-scrollbar">
          <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-4 px-3">
            Intelligence
          </div>
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === `/space/${spaceId}`}
              className={({ isActive }) => `
                flex items-center px-4 py-3 rounded-2xl text-sm transition-all group relative font-medium
                ${isActive 
                  ? 'bg-blue-50 text-blue-600' 
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}
              `}
            >
              {({ isActive }) => (
                <>
                  <item.icon className={`w-4 h-4 mr-3 ${isActive ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-600'}`} />
                  {item.name}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-6 border-t border-gray-100 bg-gray-50/50">
          <div className="flex items-center justify-between">
            <div className="flex flex-col overflow-hidden">
               <span className="text-sm font-semibold text-gray-900 truncate">{user?.name || "Kristin Watson"}</span>
               <span className="text-xs text-gray-500 truncate">{user?.role || "Design Manager"}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout} className="text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full shrink-0">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content wrapper */}
      <div className="flex-1 flex flex-col flex-wrap overflow-hidden relative bg-[var(--background)]">
        {/* Header */}
        <header className="h-[88px] flex items-center justify-between px-8 z-10 sticky top-0 bg-[var(--background)]/80 backdrop-blur-md">
           <div className="flex items-center flex-1 space-x-4">
             <div className="relative w-64 md:w-[400px]">
                <Search className="absolute left-4 top-3.5 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder={`Search...`}
                  className="flex h-[44px] w-full rounded-full border-none bg-white px-4 py-2 pl-11 text-sm shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] transition-colors placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
             </div>
           </div>
           <div className="flex items-center space-x-4">
              <Button variant="ghost" size="icon" className="relative group bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] rounded-full hover:bg-gray-50 h-11 w-11">
                 <Bell className="w-5 h-5 text-gray-500" />
                 <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-blue-500 border-2 border-white"></span>
              </Button>
              
              <div className="h-11 w-11 rounded-full bg-blue-100 border-2 border-white shadow-sm flex items-center justify-center text-blue-600 font-bold overflow-hidden cursor-pointer">
                 {/* Placeholder Avatar */}
                 <svg viewBox="0 0 36 36" fill="none" role="img" xmlns="http://www.w3.org/2000/svg" width="44" height="44"><mask id="mask__beam" maskUnits="userSpaceOnUse" x="0" y="0" width="36" height="36"><rect width="36" height="36" rx="72" fill="#FFFFFF"></rect></mask><g mask="url(#mask__beam)"><rect width="36" height="36" fill="#3b82f6"></rect><rect x="0" y="0" width="36" height="36" transform="translate(7 -1) rotate(209 18 18) scale(1)" fill="#44bcff" rx="36"></rect><g transform="translate(-1 2) rotate(-9 18 18)"><path d="M15 19c2 1 4 1 6 0" stroke="#FFFFFF" fill="none" strokeLinecap="round"></path><rect x="11" y="14" width="1.5" height="2" rx="1" stroke="none" fill="#FFFFFF"></rect><rect x="23" y="14" width="1.5" height="2" rx="1" stroke="none" fill="#FFFFFF"></rect></g></g></svg>
              </div>
           </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto relative p-8 pt-2 custom-scrollbar">
           <motion.div
             key={location.pathname}
             initial={{ opacity: 0, y: 10 }}
             animate={{ opacity: 1, y: 0 }}
             exit={{ opacity: 0, y: -10 }}
             transition={{ duration: 0.3 }}
             className="h-full pt-4 max-w-[1400px] mx-auto"
           >
             <Outlet />
           </motion.div>
        </main>
      </div>
    </div>
  );
}
