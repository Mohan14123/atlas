import { useParams, Link } from 'react-router-dom';
import { useJob, useJobExecutions, useJobLogs, useRetryJob, useCancelJob } from '../hooks/useJobs';
import { JobStatusBadge } from '../components/jobs/JobStatusBadge';
import { formatDate, cn } from '../lib/utils';
import { RotateCcw, XCircle } from 'lucide-react';

export default function JobDetail() {
  const { jobId } = useParams();
  const { data: jobData, isLoading } = useJob(jobId!);
  const { data: execData } = useJobExecutions(jobId!);
  const { data: logsData } = useJobLogs(jobId!);
  
  const retryJob = useRetryJob();
  const cancelJob = useCancelJob();

  if (isLoading) return <div>Loading job details...</div>;
  const job = jobData?.data;
  if (!job) return <div>Job not found.</div>;

  return (
    <div className="space-y-6">
      <div>
        <button onClick={() => window.history.back()} className="text-sm text-indigo-400 hover:underline mb-2">&larr; Back</button>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-[#fafafa] font-mono text-xl">Job {job.id.substring(0,8)}...</h1>
            <JobStatusBadge status={job.status} />
          </div>
          <div className="flex gap-2">
            {job.status === 'FAILED' && (
               <button onClick={() => retryJob.mutate(job.id)} disabled={retryJob.isPending} className="bg-emerald-900/20 text-emerald-400 hover:bg-emerald-900/40 px-3 py-1.5 rounded flex items-center gap-2 text-sm font-medium transition-colors">
                 <RotateCcw className="w-4 h-4" /> Retry
               </button>
            )}
            {(job.status === 'SCHEDULED' || job.status === 'QUEUED') && (
              <button onClick={() => cancelJob.mutate(job.id)} disabled={cancelJob.isPending} className="bg-rose-900/20 text-rose-400 hover:bg-rose-900/40 px-3 py-1.5 rounded flex items-center gap-2 text-sm font-medium transition-colors">
                <XCircle className="w-4 h-4" /> Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="col-span-1 space-y-6">
          <div className="bg-[#18181b] border border-[#27272a] rounded-lg shadow-sm p-4">
            <h3 className="font-semibold text-[#fafafa] mb-4 border-b border-[#27272a] pb-2">Metadata</h3>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-[#a1a1aa]">Type</dt>
                <dd className="font-medium text-[#fafafa]">{job.type}</dd>
              </div>
              <div>
                <dt className="text-[#a1a1aa]">Priority</dt>
                <dd className="font-medium text-[#fafafa]">{job.priority}</dd>
              </div>
              <div>
                <dt className="text-[#a1a1aa]">Attempts</dt>
                <dd className="font-medium text-[#fafafa]">{job.attempt_count} / {job.max_attempts}</dd>
              </div>
              {job.worker_id && (
                <div>
                  <dt className="text-[#a1a1aa]">Worker ID</dt>
                  <dd className="font-mono text-xs text-[#fafafa]">{job.worker_id}</dd>
                </div>
              )}
              <div>
                <dt className="text-[#a1a1aa]">Created At</dt>
                <dd className="text-[#fafafa]">{formatDate(job.created_at)}</dd>
              </div>
            </dl>
          </div>
          
          <div className="bg-[#18181b] border border-[#27272a] rounded-lg shadow-sm p-4">
            <h3 className="font-semibold text-[#fafafa] mb-4 border-b border-[#27272a] pb-2">Execution History</h3>
            <div className="space-y-3">
              {execData?.data.map(exec => (
                <div key={exec.id} className={cn("p-3 rounded border text-sm", exec.status === 'FAILED' ? 'bg-rose-900/20 border-rose-900/50' : 'bg-[#09090b] border-[#27272a]')}>
                  <div className="flex justify-between font-medium mb-1">
                    <span className={exec.status === 'FAILED' ? 'text-rose-400' : 'text-[#a1a1aa]'}>Attempt {exec.attempt_number}</span>
                    <span className={exec.status === 'FAILED' ? 'text-rose-400' : 'text-emerald-400'}>{exec.status}</span>
                  </div>
                  <div className="text-xs text-[#71717a]">{exec.duration_ms}ms duration</div>
                  {exec.error_message && <div className="mt-2 text-rose-400 text-xs font-mono break-all">{exec.error_message}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="col-span-2 space-y-6">
          <div className="bg-[#18181b] border border-[#27272a] rounded-lg shadow-sm flex flex-col h-[300px]">
            <div className="px-4 py-3 border-b border-[#27272a] bg-[#09090b] rounded-t-lg">
              <h3 className="font-semibold text-[#fafafa]">Payload</h3>
            </div>
            <div className="flex-1 p-4 bg-[#09090b] text-[#a1a1aa] font-mono text-sm overflow-auto rounded-b-lg">
              <pre>{JSON.stringify(job.payload, null, 2)}</pre>
            </div>
          </div>
          
          <div className="bg-[#18181b] border border-[#27272a] rounded-lg shadow-sm flex flex-col h-[400px]">
             <div className="px-4 py-3 border-b border-[#27272a] bg-[#09090b] rounded-t-lg flex justify-between">
              <h3 className="font-semibold text-[#fafafa]">Logs</h3>
            </div>
            <div className="flex-1 p-4 bg-[#09090b] text-[#a1a1aa] font-mono text-xs overflow-auto rounded-b-lg space-y-1">
              {logsData?.data.map(log => (
                <div key={log.id} className="flex gap-3">
                  <span className="text-[#71717a]">{new Date(log.created_at).toLocaleTimeString()}</span>
                  <span className={cn(
                    "w-10", 
                    log.level === 'ERROR' ? 'text-rose-500' : 
                    log.level === 'WARN' ? 'text-amber-500' : 'text-blue-400'
                  )}>{log.level}</span>
                  <span className="text-[#a1a1aa]">{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
