import { useState } from 'react';
import { useLogin, useRegister } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [error, setError] = useState('');

  const { mutate: login, isPending: loginPending } = useLogin();
  const { mutate: register, isPending: registerPending } = useRegister();
  const navigate = useNavigate();

  const isPending = loginPending || registerPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isRegister) {
      register({ email, password, organization_name: orgName }, {
        onSuccess: () => navigate('/dashboard'),
        onError: (err: any) => {
          const msg = err.response?.data?.error?.message || 'Registration failed';
          setError(msg);
        }
      });
    } else {
      login({ email, password }, {
        onSuccess: () => navigate('/dashboard'),
        onError: (err: any) => {
          const msg = err.response?.data?.error?.message || 'Invalid email or password';
          setError(msg);
        }
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#09090b] text-[#fafafa]">
      <div className="bg-[#18181b] p-8 rounded-lg shadow-sm border border-[#27272a] w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold text-white shadow-lg shadow-blue-900/20">A</div>
          <h1 className="text-2xl font-bold tracking-tight">Atlas</h1>
        </div>

        <h2 className="text-lg font-semibold text-center mb-6 text-[#a1a1aa]">
          {isRegister ? 'Create your account' : 'Sign in to your account'}
        </h2>

        {error && (
          <div className="bg-rose-900/20 border border-rose-800 text-rose-400 rounded px-3 py-2 text-sm mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#a1a1aa] mb-1">Email</label>
            <input
              type="email"
              required
              className="w-full bg-[#09090b] border border-[#27272a] text-[#fafafa] rounded px-3 py-2 focus:outline-none focus:border-blue-500"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#a1a1aa] mb-1">Password</label>
            <input
              type="password"
              required
              minLength={isRegister ? 8 : undefined}
              className="w-full bg-[#09090b] border border-[#27272a] text-[#fafafa] rounded px-3 py-2 focus:outline-none focus:border-blue-500"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
            {isRegister && (
              <p className="text-xs text-[#71717a] mt-1">Minimum 8 characters</p>
            )}
          </div>

          {isRegister && (
            <div>
              <label className="block text-sm font-medium text-[#a1a1aa] mb-1">Organization Name</label>
              <input
                type="text"
                required
                className="w-full bg-[#09090b] border border-[#27272a] text-[#fafafa] rounded px-3 py-2 focus:outline-none focus:border-blue-500"
                value={orgName}
                onChange={e => setOrgName(e.target.value)}
                placeholder="e.g. My Company"
              />
            </div>
          )}

          <button
            disabled={isPending}
            className="w-full bg-blue-600 text-white rounded py-2 font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isPending
              ? (isRegister ? 'Creating account...' : 'Signing in...')
              : (isRegister ? 'Create Account' : 'Sign In')
            }
          </button>
        </form>

        <div className="mt-6 text-center text-sm">
          <span className="text-[#71717a]">
            {isRegister ? 'Already have an account?' : "Don't have an account?"}
          </span>{' '}
          <button
            type="button"
            onClick={() => { setIsRegister(!isRegister); setError(''); }}
            className="text-blue-400 hover:text-blue-300 font-medium"
          >
            {isRegister ? 'Sign In' : 'Register'}
          </button>
        </div>
      </div>
    </div>
  );
}
