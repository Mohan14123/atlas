import { useOutletContext } from 'react-router-dom';
import { Queue, QueueStats } from '../types/api.types';
import { Card } from '../components/ui/Card';

export function QueueOverview() {
  const { queue, stats } = useOutletContext<{ queue: Queue, stats: QueueStats }>();
  
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <Card title="Concurrency Limit" value={queue.concurrency_limit} />
        <Card title="Active Workers" value={stats.active_workers} />
        <Card title="Retry Strategy" value={<span className="capitalize">{queue.retry_policy.strategy}</span>} />
        <Card title="Throughput (1h)" value={stats.throughput_last_hour} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card title="Queue Health" className="col-span-1">
           <div className="mt-4 space-y-4">
             <div className="flex justify-between border-b border-[#27272a] pb-2 text-sm"><span className="text-[#a1a1aa]">Scheduled</span><span className="font-medium text-[#fafafa]">{stats.counts.scheduled}</span></div>
             <div className="flex justify-between border-b border-[#27272a] pb-2 text-sm"><span className="text-[#a1a1aa]">Queued</span><span className="font-medium text-[#fafafa]">{stats.counts.queued}</span></div>
             <div className="flex justify-between border-b border-[#27272a] pb-2 text-sm"><span className="text-[#a1a1aa]">Claimed</span><span className="font-medium text-[#fafafa]">{stats.counts.claimed}</span></div>
             <div className="flex justify-between border-b border-[#27272a] pb-2 text-sm"><span className="text-[#a1a1aa]">Running</span><span className="font-medium text-[#fafafa]">{stats.counts.running}</span></div>
             <div className="flex justify-between border-b border-[#27272a] pb-2 text-sm"><span className="text-[#a1a1aa]">Completed</span><span className="font-medium text-emerald-400">{stats.counts.completed}</span></div>
             <div className="flex justify-between border-b border-[#27272a] pb-2 text-sm"><span className="text-[#a1a1aa]">Failed</span><span className="font-medium text-rose-400">{stats.counts.failed}</span></div>
             <div className="flex justify-between pt-2 text-sm"><span className="text-[#a1a1aa]">DLQ</span><span className="font-medium text-amber-400">{stats.counts.dlq}</span></div>
           </div>
        </Card>
        
        <Card title="Retry Policy Details" className="col-span-1">
           <div className="mt-4 space-y-4">
             <div className="flex justify-between border-b border-[#27272a] pb-2 text-sm"><span className="text-[#a1a1aa]">Max Attempts</span><span className="font-medium text-[#fafafa]">{queue.retry_policy.max_attempts}</span></div>
             <div className="flex justify-between border-b border-[#27272a] pb-2 text-sm"><span className="text-[#a1a1aa]">Initial Delay</span><span className="font-medium text-[#fafafa]">{queue.retry_policy.initial_delay_ms} ms</span></div>
             <div className="flex justify-between border-b border-[#27272a] pb-2 text-sm"><span className="text-[#a1a1aa]">Max Delay</span><span className="font-medium text-[#fafafa]">{queue.retry_policy.max_delay_ms} ms</span></div>
           </div>
        </Card>
      </div>
    </div>
  );
}
