import { Outlet, NavLink } from 'react-router-dom';
import { useLogout } from '../../hooks/useAuth';
import { Activity, LayoutDashboard, List, Calendar, AlertTriangle, LogOut } from 'lucide-react';
import { cn } from '../../lib/utils';

export function Sidebar() {
  const links = [
    { name: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
    { name: 'Queues', to: '/projects/p-1/queues', icon: List },
    { name: 'DLQ', to: '/dlq', icon: AlertTriangle },
    { name: 'Workers', to: '/workers', icon: Activity },
  ];

  return (
    <div className="w-64 bg-[#09090b] text-[#fafafa] h-screen flex flex-col border-r border-[#27272a]">
      <div className="p-6 border-b border-[#27272a] flex items-center gap-3 text-xl font-bold tracking-tight">
        <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold text-white shadow-lg shadow-blue-900/20">A</div>
        <span>ATLAS</span>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors text-sm font-medium',
                isActive ? 'bg-[#18181b] text-white' : 'text-[#a1a1aa] hover:bg-[#18181b] hover:text-white'
              )
            }
          >
            <link.icon className="w-4 h-4" />
            {link.name}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-[#27272a] text-xs text-[#71717a] font-mono">
        v1.4.2-stable
      </div>
    </div>
  );
}

export function Topbar() {
  const logout = useLogout();
  return (
    <header className="h-16 bg-[#09090b] border-b border-[#27272a] px-8 flex items-center justify-between">
      <div className="text-[#71717a] font-medium text-sm flex items-center gap-2">
        <span>Atlas</span> <span className="text-[#27272a]">/</span> <span className="text-[#fafafa]">Operational Dashboard</span>
      </div>
      <button onClick={logout} className="flex items-center gap-2 text-[#71717a] hover:text-white transition-colors">
        <LogOut className="w-4 h-4" />
        Logout
      </button>
    </header>
  );
}

export default function AppLayout() {
  return (
    <div className="flex h-screen bg-[#09090b] text-[#fafafa] font-sans">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-auto p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
