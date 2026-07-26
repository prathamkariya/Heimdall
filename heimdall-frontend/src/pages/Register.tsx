import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { Shield, ArrowRight, AlertTriangle, Info } from 'lucide-react';

export function Register() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register({ email, username, password });
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-void text-ink font-sans relative overflow-hidden">
      {/* Background grid effect */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(var(--color-ink) 1px, transparent 1px), linear-gradient(90deg, var(--color-ink) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full opacity-[0.07]"
        style={{ background: 'radial-gradient(circle, var(--color-accent) 0%, transparent 70%)' }}
      />

      <div className="relative z-10 w-full max-w-[380px]">
        {/* Logo block */}
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-line bg-surface">
            <Shield size={22} className="text-accent" strokeWidth={1.5} />
          </div>
          <h1 className="font-mono text-lg font-semibold tracking-[0.2em] text-ink">HEIMDALL</h1>
          <p className="mt-1.5 font-mono text-[10px] tracking-[0.3em] text-ink-faint uppercase">
            Credential Provisioning
          </p>
        </div>

        {/* Card */}
        <div className="border border-line bg-surface/80 backdrop-blur-sm p-7 rounded-lg shadow-2xl">
          <div className="mb-6 font-mono text-[10px] uppercase tracking-wider text-ink-faint border-b border-line pb-3">
            <span className="text-accent">●</span> New Analyst Registration
          </div>

          {error && (
            <div className="mb-5 flex items-start gap-2.5 rounded border border-down/30 bg-down/5 px-3.5 py-2.5 text-[13px] text-down">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block font-mono text-[10px] text-ink-dim uppercase tracking-wider">
                Email Address
              </label>
              <input
                type="email"
                required
                autoFocus
                placeholder="analyst@firm.com"
                className="w-full rounded border border-line bg-void/50 px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink-faint/40 focus:border-accent/60 focus:ring-1 focus:ring-accent/20 transition-all"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1.5 block font-mono text-[10px] text-ink-dim uppercase tracking-wider">
                Username
              </label>
              <input
                type="text"
                required
                placeholder="jsmith"
                className="w-full rounded border border-line bg-void/50 px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink-faint/40 focus:border-accent/60 focus:ring-1 focus:ring-accent/20 transition-all"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1.5 block font-mono text-[10px] text-ink-dim uppercase tracking-wider">
                Password
              </label>
              <input
                type="password"
                required
                placeholder="••••••••"
                className="w-full rounded border border-line bg-void/50 px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink-faint/40 focus:border-accent/60 focus:ring-1 focus:ring-accent/20 transition-all"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <div className="mt-2 flex items-start gap-1.5 rounded bg-raised/50 px-2.5 py-1.5 border border-line/50">
                <Info size={11} className="text-ink-faint mt-0.5 shrink-0" />
                <p className="font-mono text-[10px] text-ink-faint leading-relaxed">
                  Min 8 characters · 1 uppercase letter · 1 digit
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded bg-accent/90 py-2.5 font-mono text-sm font-medium text-void hover:bg-accent transition-colors disabled:opacity-50"
            >
              {loading ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-void/30 border-t-void" />
              ) : (
                <>
                  PROVISION ACCESS
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </form>
        </div>

        <div className="mt-5 text-center font-mono text-[11px] text-ink-faint">
          Existing analyst?{' '}
          <Link to="/login" className="text-accent hover:text-accent/80 transition-colors">
            Authenticate →
          </Link>
        </div>

        <div className="mt-8 text-center font-mono text-[9px] text-ink-faint/50 tracking-wider">
          HEIMDALL v0.8.2 · SECURE CHANNEL · SSL/TLS
        </div>
      </div>
    </div>
  );
}
