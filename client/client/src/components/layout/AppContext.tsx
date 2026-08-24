import React, { createContext, useContext, useState, useEffect } from 'react';
import { useOrganizations } from '../../hooks/useOrganizations';
import { useProjects } from '../../hooks/useProjects';

interface AppContextType {
  orgId: string | null;
  projectId: string | null;
  setOrgId: (id: string | null) => void;
  setProjectId: (id: string | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [orgId, setOrgId] = useState<string | null>(() => localStorage.getItem('atlas_org_id'));
  const [projectId, setProjectId] = useState<string | null>(() => localStorage.getItem('atlas_project_id'));

  const { data: orgData } = useOrganizations();
  const { data: projData } = useProjects(orgId);

  // Auto-select first org if none selected or if selected one isn't in the list
  useEffect(() => {
    const orgs = orgData?.data.organizations;
    if (orgs && orgs.length > 0) {
      if (!orgId || !orgs.find(o => o.id === orgId)) {
        setOrgId(orgs[0].id);
      }
    } else if (orgs && orgs.length === 0) {
      setOrgId(null);
    }
  }, [orgData, orgId]);

  // Auto-select first project if none selected or if selected one isn't in the list
  useEffect(() => {
    const projects = projData?.data.projects;
    if (projects && projects.length > 0) {
      if (!projectId || !projects.find(p => p.id === projectId)) {
        setProjectId(projects[0].id);
      }
    } else if (projects && projects.length === 0) {
      setProjectId(null);
    }
  }, [projData, projectId, orgId]);

  // Persist selections
  useEffect(() => {
    if (orgId) localStorage.setItem('atlas_org_id', orgId);
    else localStorage.removeItem('atlas_org_id');
  }, [orgId]);

  useEffect(() => {
    if (projectId) localStorage.setItem('atlas_project_id', projectId);
    else localStorage.removeItem('atlas_project_id');
  }, [projectId]);

  return (
    <AppContext.Provider value={{ orgId, projectId, setOrgId, setProjectId }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}
