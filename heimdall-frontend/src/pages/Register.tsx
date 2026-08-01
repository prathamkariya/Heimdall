import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { AlertTriangle, Info } from 'lucide-react';
import { LogoLockup } from '../brand';

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
    <div className="flex min-h-screen flex-col items-center justify-center bg-void text-ink font-brand relative overflow-hidden">
      <div className="relative z-10 w-full max-w-[400px] px-6">
        
        {/* Brand Lockup */}
        <div className="mb-12 flex justify-center">
          <LogoLockup size={42} orientation="vertical" variant="monochrome" showTagline={false} />
        </div>

        {/* Auth Card */}
        <div className="bg-surface/50 border border-line rounded-xl p-8 shadow-2xl backdrop-blur-sm">
          <div className="mb-8 text-center">
            <h2 className="text-lg font-semibold text-ink">New Analyst</h2>
            <p className="text-sm text-ink-faint mt-1">Register to provision access</p>
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
                type="email"
                required
                autoFocus
                placeholder="Email"
                className="w-full rounded-md border border-line bg-void px-4 py-3 text-[15px] text-ink outline-none placeholder:text-ink-faint focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition-all font-brand"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <input
                type="text"
                required
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
              <div className="mt-3 flex items-start gap-1.5 rounded-md bg-raised/30 px-3 py-2 border border-line/50">
                <Info size={14} className="text-ink-faint mt-0.5 shrink-0" />
                <p className="text-[12px] text-ink-faint leading-relaxed font-brand">
                  Min 8 characters • 1 uppercase letter • 1 digit
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-6 flex w-full items-center justify-center rounded-md bg-accent py-3 text-[15px] font-semibold text-void hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {loading ? (
                <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-void/30 border-t-void" />
              ) : (
                "Provision Access"
              )}
            </button>
          </form>
        </div>

        <div className="mt-8 text-center text-[13px] text-ink-dim">
          Existing analyst?{' '}
          <Link to="/login" className="text-ink hover:text-accent transition-colors font-medium">
            Authenticate
          </Link>
        </div>
      </div>
    </div>
  );
}
