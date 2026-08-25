import { useParams, Link } from 'react-router-dom';
import { useJobs, useCancelJob, useRetryJob, useCreateJob } from '../hooks/useJobs';
import { useState } from 'react';
import { JobStatusBadge } from '../components/jobs/JobStatusBadge';
import { formatDate } from '../lib/utils';
import { Eye, RotateCcw, XCircle, Plus } from 'lucide-react';

export default function Jobs() {
  const { queueId } = useParams();
  const [statusFilter, setStatusFilter] = useState('');
  
  const { data, isLoading } = useJobs(queueId!, { status: statusFilter });
  const cancelJob = useCancelJob();
  const retryJob = useRetryJob();
  const createJob = useCreateJob();

  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [newJob, setNewJob] = useState({
    type: 'send-email',
    payload: '{}',
    priority: 10,
    job_mode: 'immediate',
    delay_ms: 0
  });

  const handleSubmitJob = (e: React.FormEvent) => {
    e.preventDefault();
    let parsedPayload = {};
    try {
      parsedPayload = JSON.parse(newJob.payload);
    } catch (e) {
      alert('Payload must be valid JSON');
      return;
    }

    createJob.mutate({
      queueId: queueId!,
      data: {
        type: newJob.type,
        payload: parsedPayload,
        priority: newJob.priority,
        job_mode: newJob.job_mode,
        delay_ms: newJob.delay_ms
      }
    }, {
      onSuccess: () => {
        setIsSubmitModalOpen(false);
        setNewJob({
          type: 'send-email',
          payload: '{}',
          priority: 10,
          job_mode: 'immediate',
          delay_ms: 0
        });
      }
    });
  };

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
        <button 
          onClick={() => setIsSubmitModalOpen(true)}
          className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-indigo-700 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Submit Job
        </button>
      </div>

      {isSubmitModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#18181b] border border-[#27272a] rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4 text-[#fafafa]">Submit Job</h2>
            <form onSubmit={handleSubmitJob} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#a1a1aa] mb-1">Job Type</label>
                <input
                  type="text"
                  required
                  value={newJob.type}
                  onChange={e => setNewJob(j => ({ ...j, type: e.target.value }))}
                  className="w-full bg-[#09090b] border border-[#27272a] text-[#fafafa] rounded px-3 py-2 focus:outline-none focus:border-indigo-500"
                  placeholder="e.g., send-email"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#a1a1aa] mb-1">Payload (JSON)</label>
                <textarea
                  required
                  rows={4}
                  value={newJob.payload}
                  onChange={e => setNewJob(j => ({ ...j, payload: e.target.value }))}
                  className="w-full bg-[#09090b] border border-[#27272a] text-[#fafafa] rounded px-3 py-2 focus:outline-none focus:border-indigo-500 font-mono text-sm"
                  placeholder='{"to": "user@example.com"}'
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#a1a1aa] mb-1">Mode</label>
                  <select
                    value={newJob.job_mode}
                    onChange={e => setNewJob(j => ({ ...j, job_mode: e.target.value }))}
                    className="w-full bg-[#09090b] border border-[#27272a] text-[#fafafa] rounded px-3 py-2 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="immediate">Immediate</option>
                    <option value="delayed">Delayed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#a1a1aa] mb-1">Priority (1-100)</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    required
                    value={newJob.priority}
                    onChange={e => setNewJob(j => ({ ...j, priority: parseInt(e.target.value) }))}
                    className="w-full bg-[#09090b] border border-[#27272a] text-[#fafafa] rounded px-3 py-2 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              {newJob.job_mode === 'delayed' && (
                <div>
                  <label className="block text-sm font-medium text-[#a1a1aa] mb-1">Delay (ms)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={newJob.delay_ms}
                    onChange={e => setNewJob(j => ({ ...j, delay_ms: parseInt(e.target.value) }))}
                    className="w-full bg-[#09090b] border border-[#27272a] text-[#fafafa] rounded px-3 py-2 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setIsSubmitModalOpen(false)}
                  className="px-4 py-2 text-[#a1a1aa] hover:text-white font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createJob.isPending}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded font-medium disabled:opacity-50 transition-colors"
                >
                  {createJob.isPending ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
