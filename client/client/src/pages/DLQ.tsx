import { useDLQ, useReplayDLQ } from '../hooks/useDLQ';
import { formatDate } from '../lib/utils';
import { Play, Eye, Sparkles } from 'lucide-react';
import { useState } from 'react';

export default function DLQ() {
  const { data, isLoading } = useDLQ({});
  const replay = useReplayDLQ();
  const [selected, setSelected] = useState<string | null>(null);

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-[#fafafa]">Dead Letter Queue</h1>
      </div>

      <div className="bg-[#18181b] rounded-lg border border-[#27272a] overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-[#a1a1aa] uppercase bg-[#09090b] border-b border-[#27272a]">
            <tr>
              <th className="px-4 py-3 font-medium">Job Type</th>
              <th className="px-4 py-3 font-medium">Failure Reason</th>
              <th className="px-4 py-3 font-medium">Attempts</th>
              <th className="px-4 py-3 font-medium">Failed At</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#27272a]">
            {data?.data.map((entry) => (
              <tr key={entry.id} className="hover:bg-[#27272a]/50">
                <td className="px-4 py-3 font-medium text-[#fafafa]">{entry.job.type}</td>
                <td className="px-4 py-3">
                  <div className="text-rose-400 font-medium">{entry.reason}</div>
                  <div className="text-[#71717a] text-xs truncate max-w-xs">{entry.error_message}</div>
                </td>
                <td className="px-4 py-3 text-[#a1a1aa]">{entry.attempts}</td>
                <td className="px-4 py-3 text-[#a1a1aa]">{formatDate(entry.failed_at)}</td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button onClick={() => setSelected(selected === entry.id ? null : entry.id)} className="text-[#71717a] hover:text-indigo-400 p-1" title="Inspect">
                    <Eye className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => {
                      replay.mutate(entry.id, {
                        onSuccess: (res) => alert(`Replayed! New Job ID: ${res.data.new_job.id}`)
                      });
                    }} 
                    disabled={replay.isPending}
                    className="text-[#71717a] hover:text-emerald-400 p-1" title="Replay">
                    <Play className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
            {(!data?.data || data.data.length === 0) && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-[#a1a1aa]">DLQ is empty.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="bg-[#18181b] border border-[#27272a] rounded-lg p-6 shadow-lg mt-6">
          <h2 className="text-lg font-bold mb-4 text-[#fafafa]">Inspection: {selected}</h2>
          {(() => {
            const entry = data?.data.find(e => e.id === selected);
            if (!entry) return null;
            return (
              <div className="space-y-4">
                {entry.ai_summary && (
                  <div className="bg-indigo-900/20 border border-indigo-500/30 rounded p-4 flex gap-3">
                    <Sparkles className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-indigo-300 font-semibold mb-1 text-sm">AI Analysis</h4>
                      <p className="text-indigo-200 text-sm">{entry.ai_summary}</p>
                    </div>
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium text-[#fafafa] mb-2 border-b border-[#27272a] pb-1">Payload</h4>
                    <pre className="bg-[#09090b] text-[#a1a1aa] p-3 rounded text-xs font-mono overflow-auto">{JSON.stringify(entry.job.payload, null, 2)}</pre>
                  </div>
                  <div>
                     <h4 className="font-medium text-[#fafafa] mb-2 border-b border-[#27272a] pb-1">Error Message</h4>
                     <div className="bg-rose-900/20 text-rose-400 p-3 rounded text-xs font-mono overflow-auto h-full">{entry.error_message}</div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
