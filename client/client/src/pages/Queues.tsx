import { useQueues, usePauseQueue, useResumeQueue } from '../hooks/useQueues';
import { Link } from 'react-router-dom';
import { Play, Pause, Plus } from 'lucide-react';

export default function Queues() {
  const { data, isLoading } = useQueues();
  const pauseQueue = usePauseQueue();
  const resumeQueue = useResumeQueue();

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-[#fafafa]">Queues</h1>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded font-medium flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Create Queue
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {data?.data?.queues?.map((queue) => (
          <div key={queue.id} className="bg-[#18181b] border border-[#27272a] rounded-lg shadow-sm p-6 flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <div>
                <Link to={`/queues/${queue.id}`} className="text-lg font-bold text-[#fafafa] hover:text-indigo-400">
                  {queue.name}
                </Link>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs bg-[#27272a] text-[#a1a1aa] px-2 py-0.5 rounded font-medium">
                    Priority {queue.priority}
                  </span>
                  {queue.is_paused && (
                    <span className="text-xs bg-amber-900/30 text-amber-400 px-2 py-0.5 rounded font-medium">Paused</span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 my-4 flex-1">
              <div>
                <div className="text-sm text-[#a1a1aa]">Concurrency</div>
                <div className="text-lg font-semibold text-[#fafafa] font-mono">{queue.concurrency_limit}</div>
              </div>
              <div>
                <div className="text-sm text-[#a1a1aa]">Retry Strategy</div>
                <div className="text-lg font-semibold text-[#fafafa] capitalize">{queue.retry_policy.strategy}</div>
              </div>
            </div>

            <div className="pt-4 border-t border-[#27272a] flex gap-2">
              {queue.is_paused ? (
                <button 
                  onClick={() => resumeQueue.mutate(queue.id)}
                  disabled={resumeQueue.isPending}
                  className="flex-1 bg-emerald-900/20 text-emerald-400 hover:bg-emerald-900/40 py-2 rounded flex justify-center items-center gap-2 font-medium text-sm transition-colors"
                >
                  <Play className="w-4 h-4" /> Resume
                </button>
              ) : (
                <button 
                  onClick={() => pauseQueue.mutate(queue.id)}
                  disabled={pauseQueue.isPending}
                  className="flex-1 bg-amber-900/20 text-amber-400 hover:bg-amber-900/40 py-2 rounded flex justify-center items-center gap-2 font-medium text-sm transition-colors"
                >
                  <Pause className="w-4 h-4" /> Pause
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
