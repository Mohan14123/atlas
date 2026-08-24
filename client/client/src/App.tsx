import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppLayout from './components/layout/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Queues from './pages/Queues';
import QueueDetail from './pages/QueueDetail';
import { QueueOverview } from './pages/QueueOverview';
import Jobs from './pages/Jobs';
import Schedules from './pages/Schedules';
import DLQ from './pages/DLQ';
import Workers from './pages/Workers';
import JobDetail from './pages/JobDetail';

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('atlas_token');
  if (!token) return <Navigate to="/login" />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="projects/:projectId/queues" element={<Queues />} />
            <Route path="queues/:queueId" element={<QueueDetail />}>
              <Route index element={<QueueOverview />} />
              <Route path="jobs" element={<Jobs />} />
              <Route path="schedules" element={<Schedules />} />
            </Route>
            <Route path="jobs/:jobId" element={<JobDetail />} />
            <Route path="dlq" element={<DLQ />} />
            <Route path="workers" element={<Workers />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
