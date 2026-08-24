import { useWorkers } from '../hooks/useWorkers';
import { Badge } from '../components/ui/Badge';
import { formatDate, cn } from '../lib/utils';
import { Server, Activity } from 'lucide-react';

export default function Workers() {
  const { data, isLoading } = useWorkers({});

  if (isLoading) return <div>Loading workers...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-[#fafafa]">Workers</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {data?.data.map((worker) => {
          const utilPct = (worker.active_jobs / worker.concurrency) * 100;
          return (
            <div key={worker.id} className="bg-[#18181b] border border-[#27272a] rounded-lg shadow-sm p-5 hover:border-indigo-500 transition-colors cursor-pointer group">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#27272a] rounded-md text-[#a1a1aa] group-hover:text-indigo-400 group-hover:bg-indigo-900/30 transition-colors">
                    <Server className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-[#fafafa]">{worker.hostname}</h3>
                    <div className="text-xs text-[#71717a] font-mono mt-0.5">{worker.id.substring(0,8)}</div>
                  </div>
                </div>
                <Badge variant={worker.status === 'active' ? 'success' : worker.status === 'idle' ? 'default' : 'danger'}>
                  {worker.status}
                </Badge>
              </div>

              <div className="mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-[#a1a1aa]">Utilization</span>
                  <span className="font-medium text-[#fafafa]">{worker.active_jobs} / {worker.concurrency}</span>
                </div>
                <div className="w-full bg-[#27272a] rounded-full h-2 overflow-hidden">
                  <div 
                    className={cn("h-2 rounded-full", utilPct > 80 ? "bg-rose-500" : utilPct > 0 ? "bg-indigo-500" : "bg-transparent")} 
                    style={{ width: `${utilPct}%` }}
                  ></div>
                </div>
              </div>

              <div className="text-xs text-[#a1a1aa] flex flex-col gap-1">
                <div className="flex justify-between border-t border-[#27272a] pt-3">
                  <span>Last heartbeat:</span>
                  <span className="font-medium text-[#fafafa] flex items-center gap-1">
                    {worker.status !== 'offline' && <Activity className="w-3 h-3 text-emerald-500 animate-pulse" />}
                    {new Date(worker.last_heartbeat_at).toLocaleTimeString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Registered:</span>
                  <span className="font-medium text-[#fafafa]">{formatDate(worker.registered_at)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
