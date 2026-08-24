import { useParams, Link, Outlet, NavLink } from 'react-router-dom';
import { useQueue, useQueueStats } from '../hooks/useQueues';
import { cn } from '../lib/utils';
import { useAppContext } from '../components/layout/AppContext';

export default function QueueDetail() {
  const { queueId } = useParams();
  const { projectId } = useAppContext();
  const { data: queueData, isLoading: queueLoading } = useQueue(queueId!);
  const { data: statsData, isLoading: statsLoading } = useQueueStats(queueId!);

  if (queueLoading || statsLoading) return <div>Loading...</div>;

  const queue = queueData?.data;
  const stats = statsData?.data;

  const tabs = [
    { name: 'Overview', to: `/queues/${queueId}` },
    { name: 'Jobs', to: `/queues/${queueId}/jobs` },
    { name: 'Schedules', to: `/queues/${queueId}/schedules` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/projects/${projectId}/queues`} className="text-sm text-indigo-400 hover:underline mb-2 inline-block">&larr; Back to Queues</Link>
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-[#fafafa]">{queue?.name}</h1>
        </div>
      </div>

      <div className="border-b border-[#27272a]">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <NavLink
              key={tab.name}
              to={tab.to}
              end={tab.name === 'Overview'}
              className={({ isActive }) =>
                cn(
                  'whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm',
                  isActive
                    ? 'border-indigo-400 text-indigo-400'
                    : 'border-transparent text-[#a1a1aa] hover:text-[#fafafa] hover:border-[#27272a]'
                )
              }
            >
              {tab.name}
            </NavLink>
          ))}
        </nav>
      </div>

      <Outlet context={{ queue, stats }} />
    </div>
  );
}
