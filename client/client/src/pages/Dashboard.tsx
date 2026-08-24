import { useMetrics } from '../hooks/useMetrics';
import { Card } from '../components/ui/Card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const { data, isLoading } = useMetrics();
  
  if (isLoading) return <div>Loading metrics...</div>;
  
  const metrics = data?.data;
  const dlqCount = metrics?.jobs.total_dlq || 0;

  // Mock throughput data
  const throughputData = [
    { time: '10:00', count: 12 },
    { time: '10:10', count: 19 },
    { time: '10:20', count: 15 },
    { time: '10:30', count: 25 },
    { time: '10:40', count: 22 },
    { time: '10:50', count: 30 },
  ];

  const pieData = [
    { name: 'QUEUED', value: metrics?.jobs.total_queued || 0, color: '#3b82f6' },
    { name: 'RUNNING', value: metrics?.jobs.total_running || 0, color: '#6366f1' },
    { name: 'COMPLETED', value: metrics?.jobs.total_completed || 0, color: '#10b981' },
    { name: 'FAILED', value: metrics?.jobs.total_failed || 0, color: '#f43f5e' },
    { name: 'DLQ', value: dlqCount, color: '#f97316' },
  ].filter(d => d.value > 0);

  const workerData = [
    { name: 'worker-1', utilization: 0.8 },
    { name: 'worker-2', utilization: 0.6 },
    { name: 'worker-3', utilization: 0.9 },
    { name: 'worker-4', utilization: 0.2 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-[#fafafa]">Dashboard</h1>
      </div>

      {dlqCount > 0 && (
        <div className="bg-[#18181b] border-l-4 border-rose-500 p-4 rounded-r-md flex justify-between items-center">
          <div>
            <h3 className="text-rose-400 font-medium">{dlqCount} jobs in DLQ — Review</h3>
            <p className="text-rose-300 text-sm">Jobs have failed all retry attempts and require manual intervention.</p>
          </div>
          <Link to="/dlq" className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors">
            View DLQ
          </Link>
        </div>
      )}

      <div className="grid grid-cols-4 gap-6">
        <Card title="Queued" value={metrics?.jobs.total_queued || 0} />
        <Card title="Running" value={metrics?.jobs.total_running || 0} />
        <Card title="Completed" value={metrics?.jobs.total_completed || 0} />
        <Card title="Failed" value={metrics?.jobs.total_failed || 0} />
      </div>

      <div className="grid grid-cols-3 gap-6">
        <Card title="Throughput (last hour)" className="col-span-2">
          <div className="h-64 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={throughputData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" />
                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{fill: '#a1a1aa', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#a1a1aa', fontSize: 12}} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        
        <Card title="Job Status Distribution">
          <div className="h-64 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} innerRadius={60} outerRadius={80} paddingAngle={2} dataKey="value">
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <Card title="Worker Utilization" className="col-span-1">
          <div className="h-64 mt-4">
             <ResponsiveContainer width="100%" height="100%">
              <BarChart data={workerData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#27272a" />
                <XAxis type="number" domain={[0, 1]} hide />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fill: '#a1a1aa', fontSize: 12}} />
                <Tooltip formatter={(value: number) => [`${(value * 100).toFixed(0)}%`, 'Utilization']} />
                <Bar dataKey="utilization" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Queue Health" className="col-span-2">
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-[#a1a1aa] uppercase bg-[#09090b] border-b border-[#27272a]">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Depth</th>
                  <th className="px-4 py-3 font-medium">Running</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Concurrency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#27272a]">
                {metrics?.queues.map((q) => (
                  <tr key={q.id} className="hover:bg-[#27272a]">
                    <td className="px-4 py-3 font-medium text-[#fafafa]">
                      <Link to={`/queues/${q.id}`} className="hover:text-indigo-400">{q.name}</Link>
                    </td>
                    <td className="px-4 py-3 text-[#a1a1aa]">{q.depth}</td>
                    <td className="px-4 py-3 text-[#a1a1aa]">{q.active_jobs}</td>
                    <td className="px-4 py-3">
                      {q.is_paused ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-900/30 text-amber-400">Paused</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-900/30 text-emerald-400">Active</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#a1a1aa] font-mono text-xs">{q.concurrency_limit || '10'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

    </div>
  );
}
