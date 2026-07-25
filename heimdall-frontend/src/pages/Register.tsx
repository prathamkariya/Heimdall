import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';

export function Register() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await register({ email, username, password });
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-void text-ink font-sans">
      <div className="w-full max-w-sm border border-line bg-surface p-8 shadow-2xl">
        <div className="mb-8 text-center font-mono">
          <h1 className="text-xl font-semibold tracking-wide">HEIMDALL</h1>
          <p className="mt-1 text-xs tracking-widest text-ink-dim uppercase">Provisioning</p>
        </div>

        {error && (
          <div className="mb-6 border-l-2 border-down bg-raised px-4 py-2 text-sm text-down">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block font-mono text-xs text-ink-dim uppercase tracking-wide">
              Email
            </label>
            <input
              type="email"
              required
              className="w-full border border-line bg-raised px-3 py-2 text-sm text-ink outline-none focus:border-accent transition-colors"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1.5 block font-mono text-xs text-ink-dim uppercase tracking-wide">
              Username
            </label>
            <input
              type="text"
              required
              className="w-full border border-line bg-raised px-3 py-2 text-sm text-ink outline-none focus:border-accent transition-colors"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1.5 block font-mono text-xs text-ink-dim uppercase tracking-wide">
              Password
            </label>
            <input
              type="password"
              required
              className="w-full border border-line bg-raised px-3 py-2 text-sm text-ink outline-none focus:border-accent transition-colors"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className="mt-6 w-full bg-line py-2.5 font-mono text-sm font-medium hover:bg-raised transition-colors"
          >
            REGISTER
          </button>
        </form>

        <div className="mt-6 text-center font-mono text-xs text-ink-dim">
          Existing user? <Link to="/login" className="text-accent hover:underline">Authenticate</Link>
        </div>
      </div>
    </div>
  );
}
