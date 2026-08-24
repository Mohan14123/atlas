import { Outlet, NavLink } from 'react-router-dom';
import { useLogout } from '../../hooks/useAuth';
import { Activity, LayoutDashboard, List, AlertTriangle, LogOut, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAppContext } from './AppContext';
import { useOrganizations } from '../../hooks/useOrganizations';
import { useProjects, useCreateProject } from '../../hooks/useProjects';
import { Plus } from 'lucide-react';

export function Sidebar() {
  const { projectId } = useAppContext();
  
  const links = [
    { name: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
    { name: 'Queues', to: projectId ? `/projects/${projectId}/queues` : '/dashboard', icon: List },
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
  const { orgId, projectId, setOrgId, setProjectId } = useAppContext();
  const { data: orgData, isLoading: orgLoading } = useOrganizations();
  const { data: projData, isLoading: projLoading } = useProjects(orgId);
  const { mutate: createProject, isPending: isCreatingProject } = useCreateProject();

  const orgs = orgData?.data.organizations || [];
  const projects = projData?.data.projects || [];

  return (
    <header className="h-16 bg-[#09090b] border-b border-[#27272a] px-8 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="text-[#71717a] font-medium text-sm flex items-center gap-2">
          <span>Atlas</span> <span className="text-[#27272a]">/</span> <span className="text-[#fafafa]">Operational Dashboard</span>
        </div>
        
        <div className="h-6 w-px bg-[#27272a] mx-2"></div>
        
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-[#71717a]">Org:</span>
            {orgLoading ? (
              <span className="text-[#a1a1aa]">Loading...</span>
            ) : (
              <select 
                value={orgId || ''} 
                onChange={(e) => setOrgId(e.target.value)}
                className="bg-[#18181b] border border-[#27272a] rounded px-2 py-1 text-white focus:outline-none focus:border-indigo-500"
              >
                {orgs.length === 0 && <option value="" disabled>No organizations</option>}
                {orgs.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
              </select>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[#71717a]">Project:</span>
            {projLoading ? (
              <span className="text-[#a1a1aa]">Loading...</span>
            ) : (
              <div className="flex items-center gap-1">
                <select 
                  value={projectId || ''} 
                  onChange={(e) => setProjectId(e.target.value)}
                  className="bg-[#18181b] border border-[#27272a] rounded px-2 py-1 text-white focus:outline-none focus:border-indigo-500"
                  disabled={!orgId || projects.length === 0}
                >
                  {projects.length === 0 && <option value="" disabled>No projects</option>}
                  {projects.map(proj => <option key={proj.id} value={proj.id}>{proj.name}</option>)}
                </select>
                {orgId && (
                  <button 
                    onClick={() => {
                      const name = window.prompt("Enter new project name:");
                      if (name && name.trim()) {
                        createProject({ orgId, name: name.trim() }, {
                          onSuccess: (data) => {
                            if (data.data.project.id) {
                              setProjectId(data.data.project.id);
                            }
                          }
                        });
                      }
                    }}
                    disabled={isCreatingProject}
                    className="p-1 rounded bg-[#27272a] text-[#a1a1aa] hover:text-white hover:bg-[#3f3f46] transition-colors disabled:opacity-50"
                    title="New Project"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      
      <button onClick={logout} className="flex items-center gap-2 text-[#71717a] hover:text-white transition-colors text-sm">
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
