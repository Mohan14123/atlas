import { useParams, Link } from 'react-router-dom';
import { useJobs, useCancelJob, useRetryJob } from '../hooks/useJobs';
import { useState } from 'react';
import { JobStatusBadge } from '../components/jobs/JobStatusBadge';
import { formatDate } from '../lib/utils';
import { Eye, RotateCcw, XCircle } from 'lucide-react';

export default function Jobs() {
  const { queueId } = useParams();
  const [statusFilter, setStatusFilter] = useState('');
  
  const { data, isLoading } = useJobs(queueId!, { status: statusFilter });
  const cancelJob = useCancelJob();
  const retryJob = useRetryJob();

  if (isLoading) return <div>Loading jobs...</div>;

  return (
    <div className="bg-[#18181b] rounded-lg border border-[#27272a] overflow-hidden">
      <div className="p-4 border-b border-[#27272a] flex justify-between items-center bg-[#09090b]">
        <select 
          className="border border-[#27272a] bg-[#09090b] text-[#fafafa] rounded text-sm py-1.5 px-3"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="SCHEDULED">Scheduled</option>
          <option value="QUEUED">Queued</option>
          <option value="RUNNING">Running</option>
          <option value="COMPLETED">Completed</option>
          <option value="FAILED">Failed</option>
        </select>
        <button className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-indigo-700">Submit Job</button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-[#a1a1aa] uppercase bg-[#09090b] border-b border-[#27272a]">
            <tr>
              <th className="px-4 py-3 font-medium">ID</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Priority</th>
              <th className="px-4 py-3 font-medium">Attempts</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#27272a]">
            {data?.data.map((job) => (
              <tr key={job.id} className="hover:bg-[#27272a]/50">
                <td className="px-4 py-3 font-mono text-xs text-[#a1a1aa]">{job.id.substring(0, 8)}...</td>
                <td className="px-4 py-3 font-medium text-[#fafafa]">{job.type}</td>
                <td className="px-4 py-3"><JobStatusBadge status={job.status} /></td>
                <td className="px-4 py-3 text-[#a1a1aa]">{job.priority}</td>
                <td className="px-4 py-3 text-[#a1a1aa]">{job.attempt_count} / {job.max_attempts}</td>
                <td className="px-4 py-3 text-[#a1a1aa] whitespace-nowrap">{formatDate(job.created_at)}</td>
                <td className="px-4 py-3 text-right space-x-2">
                  <Link to={`/jobs/${job.id}`} className="text-[#71717a] hover:text-indigo-400 p-1 inline-block" title="View Details">
                    <Eye className="w-4 h-4" />
                  </Link>
                  {job.status === 'FAILED' && (
                    <button onClick={() => retryJob.mutate(job.id)} className="text-[#71717a] hover:text-emerald-400 p-1" title="Retry">
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  )}
                  {(job.status === 'SCHEDULED' || job.status === 'QUEUED') && (
                    <button onClick={() => {
                      if (confirm('Cancel this job?')) cancelJob.mutate(job.id);
                    }} className="text-[#71717a] hover:text-rose-400 p-1" title="Cancel">
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {(!data?.data || data.data.length === 0) && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[#a1a1aa]">No jobs found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
