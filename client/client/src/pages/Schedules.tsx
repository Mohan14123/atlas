import { useParams } from 'react-router-dom';
import { useSchedules, useToggleSchedule, useDeleteSchedule } from '../hooks/useSchedules';
import { formatDate } from '../lib/utils';
import { Edit2, Trash2, CalendarClock } from 'lucide-react';
import cronstrue from 'cronstrue';

export default function Schedules() {
  const { queueId } = useParams();
  const { data, isLoading } = useSchedules(queueId!);
  const toggle = useToggleSchedule();
  const remove = useDeleteSchedule();

  if (isLoading) return <div>Loading schedules...</div>;

  return (
    <div className="bg-[#18181b] rounded-lg border border-[#27272a] overflow-hidden">
      <div className="p-4 border-b border-[#27272a] flex justify-between items-center bg-[#09090b]">
        <h2 className="font-semibold text-[#fafafa]">Schedules</h2>
        <button className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-indigo-700">Create Schedule</button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-[#a1a1aa] uppercase bg-[#09090b] border-b border-[#27272a]">
            <tr>
              <th className="px-4 py-3 font-medium">Schedule</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Next Run</th>
              <th className="px-4 py-3 font-medium">Last Run</th>
              <th className="px-4 py-3 font-medium">Enabled</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#27272a]">
            {data?.data.map((sch) => {
              let humanReadable = 'Once';
              if (sch.schedule_type === 'cron' && sch.cron_expression) {
                try {
                  humanReadable = cronstrue.toString(sch.cron_expression);
                } catch(e) {
                  humanReadable = 'Invalid cron';
                }
              }
              
              return (
              <tr key={sch.id} className="hover:bg-[#27272a]/50">
                <td className="px-4 py-3">
                  <div className="font-medium text-[#fafafa]">{humanReadable}</div>
                  <div className="text-xs text-[#71717a] font-mono mt-0.5">{sch.schedule_type === 'cron' ? sch.cron_expression : formatDate(sch.run_at)} • {sch.timezone}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#27272a] text-[#a1a1aa]">
                    <CalendarClock className="w-3 h-3 mr-1" />
                    {sch.job_template?.type}
                  </div>
                </td>
                <td className="px-4 py-3 text-[#a1a1aa] whitespace-nowrap">{formatDate(sch.next_run_at)}</td>
                <td className="px-4 py-3 text-[#a1a1aa] whitespace-nowrap">{formatDate(sch.last_run_at)}</td>
                <td className="px-4 py-3">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={sch.enabled} 
                      onChange={(e) => toggle.mutate({ scheduleId: sch.id, enabled: e.target.checked })} 
                    />
                    <div className="w-9 h-5 bg-[#27272a] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#71717a] after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button className="text-[#71717a] hover:text-indigo-400 p-1" title="Edit">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => { if(confirm('Delete schedule?')) remove.mutate(sch.id); }} className="text-[#71717a] hover:text-rose-400 p-1" title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            )})}
            {(!data?.data || data.data.length === 0) && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-[#a1a1aa]">No schedules found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
