import { useQueues, usePauseQueue, useResumeQueue, useCreateQueue } from '../hooks/useQueues';
import { Link } from 'react-router-dom';
import { Play, Pause, Plus } from 'lucide-react';

import { useState } from 'react';

export default function Queues() {
  const { data, isLoading } = useQueues();
  const pauseQueue = usePauseQueue();
  const resumeQueue = useResumeQueue();
  const createQueue = useCreateQueue();
  
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newQueue, setNewQueue] = useState({
    name: '',
    concurrency_limit: 10,
    priority: 10,
    retry_policy: { strategy: 'exponential', max_attempts: 3 }
  });

  if (isLoading) return <div>Loading...</div>;

  const handleCreateQueue = (e: React.FormEvent) => {
    e.preventDefault();
    createQueue.mutate(newQueue, {
      onSuccess: () => {
        setIsCreateModalOpen(false);
        setNewQueue({
          name: '',
          concurrency_limit: 10,
          priority: 10,
          retry_policy: { strategy: 'exponential', max_attempts: 3 }
        });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-[#fafafa]">Queues</h1>
        <button 
          onClick={() => setIsCreateModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded font-medium flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Queue
        </button>
      </div>

      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#18181b] border border-[#27272a] rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4 text-[#fafafa]">Create New Queue</h2>
            <form onSubmit={handleCreateQueue} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#a1a1aa] mb-1">Queue Name</label>
                <input
                  type="text"
                  required
                  value={newQueue.name}
                  onChange={e => setNewQueue(q => ({ ...q, name: e.target.value }))}
                  className="w-full bg-[#09090b] border border-[#27272a] text-[#fafafa] rounded px-3 py-2 focus:outline-none focus:border-indigo-500"
                  placeholder="e.g., email-processing"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#a1a1aa] mb-1">Concurrency</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newQueue.concurrency_limit}
                    onChange={e => setNewQueue(q => ({ ...q, concurrency_limit: parseInt(e.target.value) }))}
                    className="w-full bg-[#09090b] border border-[#27272a] text-[#fafafa] rounded px-3 py-2 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#a1a1aa] mb-1">Priority</label>
                  <input
                    type="number"
                    required
                    value={newQueue.priority}
                    onChange={e => setNewQueue(q => ({ ...q, priority: parseInt(e.target.value) }))}
                    className="w-full bg-[#09090b] border border-[#27272a] text-[#fafafa] rounded px-3 py-2 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#a1a1aa] mb-1">Retry Strategy</label>
                  <select
                    value={newQueue.retry_policy.strategy}
                    onChange={e => setNewQueue(q => ({ ...q, retry_policy: { ...q.retry_policy, strategy: e.target.value } }))}
                    className="w-full bg-[#09090b] border border-[#27272a] text-[#fafafa] rounded px-3 py-2 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="exponential">Exponential</option>
                    <option value="linear">Linear</option>
                    <option value="fixed">Fixed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#a1a1aa] mb-1">Max Attempts</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newQueue.retry_policy.max_attempts}
                    onChange={e => setNewQueue(q => ({ ...q, retry_policy: { ...q.retry_policy, max_attempts: parseInt(e.target.value) } }))}
                    className="w-full bg-[#09090b] border border-[#27272a] text-[#fafafa] rounded px-3 py-2 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-[#a1a1aa] hover:text-white font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createQueue.isPending}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded font-medium disabled:opacity-50 transition-colors"
                >
                  {createQueue.isPending ? 'Creating...' : 'Create Queue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
