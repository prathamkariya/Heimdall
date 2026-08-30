import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { AlertTriangle } from 'lucide-react';
import { LogoLockup } from '../brand';

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login({ username, password });
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-void text-ink font-brand relative overflow-hidden">
      <div className="relative z-10 w-full max-w-[400px] px-6">
        
        {/* Brand Lockup */}
        <div className="mb-12 flex justify-center">
          <LogoLockup size={42} orientation="vertical" variant="monochrome" showTagline={false} />
        </div>

        {/* Auth Card */}
        <div className="bg-surface/50 border border-line rounded-xl p-8 shadow-2xl backdrop-blur-sm">
          <div className="mb-8 text-center">
            <h2 className="text-lg font-semibold text-ink">Welcome back</h2>
            <p className="text-sm text-ink-faint mt-1">Sign in to continue</p>
          </div>

          {error && (
            <div className="mb-6 flex items-start gap-2.5 rounded border border-down/30 bg-down/10 px-4 py-3 text-[13px] text-down">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <input
                type="text"
                required
                autoFocus
                placeholder="Username"
                className="w-full rounded-md border border-line bg-void px-4 py-3 text-[15px] text-ink outline-none placeholder:text-ink-faint focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition-all font-brand"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div>
              <input
                type="password"
                required
                placeholder="Password"
                className="w-full rounded-md border border-line bg-void px-4 py-3 text-[15px] text-ink outline-none placeholder:text-ink-faint focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition-all font-brand"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-4 flex w-full items-center justify-center rounded-md bg-accent py-3 text-[15px] font-semibold text-void hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {loading ? (
                <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-void/30 border-t-void" />
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-[13px]">
            <a href="#" className="text-ink-dim hover:text-ink transition-colors">
              Forgot password?
            </a>
          </div>
        </div>

        <div className="mt-8 text-center text-[13px] text-ink-dim">
          No access?{' '}
          <Link to="/register" className="text-ink hover:text-accent transition-colors font-medium">
            Request credentials
          </Link>
        </div>
      </div>
    </div>
  );
}
