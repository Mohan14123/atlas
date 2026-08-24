import { useState } from 'react';
import { useLogin } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { mutate: login, isPending } = useLogin();
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login({ email, password }, {
      onSuccess: () => navigate('/dashboard')
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#09090b] text-[#fafafa]">
      <div className="bg-[#18181b] p-8 rounded-lg shadow-sm border border-[#27272a] w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center tracking-tight">Atlas Login</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#a1a1aa] mb-1">Email</label>
            <input type="email" required className="w-full bg-[#09090b] border border-[#27272a] text-[#fafafa] rounded px-3 py-2 focus:outline-none focus:border-blue-500" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#a1a1aa] mb-1">Password</label>
            <input type="password" required className="w-full bg-[#09090b] border border-[#27272a] text-[#fafafa] rounded px-3 py-2 focus:outline-none focus:border-blue-500" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <button disabled={isPending} className="w-full bg-blue-600 text-white rounded py-2 font-medium hover:bg-blue-700 transition-colors">
            {isPending ? 'Logging in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
