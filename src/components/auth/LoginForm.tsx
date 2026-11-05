import React, { useState } from 'react';
import { signIn, signInWithDiscord, resetPassword } from '../../utils/supabaseClient';
import { AircraftIcon, Button, Field, Spinner, TextInput, Toast } from '../ui/primitives';


interface LoginFormProps {
  onSuccess?: () => void;
}

const LoginForm: React.FC<LoginFormProps> = ({ onSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [discordLoading, setDiscordLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const { error } = await signIn(email, password);
      if (error) {
        throw error;
      }
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!email) {
      setError('Please enter your email address first');
      return;
    }

    setResetLoading(true);
    setError(null);
    setMessage(null);

    try {
      const { error } = await resetPassword(email);
      if (error) {
        throw error;
      }
      setMessage('Password reset email sent! Check your inbox.');
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email');
    } finally {
      setResetLoading(false);
    }
  };

  const handleDiscordLogin = async () => {
    setDiscordLoading(true);
    setError(null);
    setMessage(null);

    try {
      // Store current path for redirect after auth
      const currentPath = window.location.pathname;
      if (currentPath && currentPath !== '/') {
        sessionStorage.setItem('auth_redirect_path', currentPath);
      }

      const { error } = await signInWithDiscord();
      if (error) {
        throw error;
      }
      // Discord OAuth will redirect to callback, so no need to call onSuccess here
    } catch (err: any) {
      setError(err.message || 'Discord login failed');
      setDiscordLoading(false);
    }
  };

  const busy = loading || discordLoading;

  return (
    <div className="fixed inset-0 bg-bg text-text flex items-center justify-center p-4">
      <div className="w-[400px] max-w-full bg-panel border border-border rounded-rr-2xl shadow-rr-lg overflow-hidden">
        {/* Brand */}
        <div className="flex flex-col items-center gap-3 px-6 pt-7 pb-5 border-b border-border">
          <span className="w-12 h-12 rounded-rr-2xl bg-panel2 border border-border2 flex items-center justify-center text-accent">
            <AircraftIcon width={24} height={30} />
          </span>
          <div className="text-center">
            <div className="text-[22px] font-bold tracking-[.02em] leading-none">READY<span className="text-accent">ROOM</span></div>
            <div className="font-mono text-[10px] tracking-[.18em] text-text3 mt-2 uppercase">Squadron operations</div>
          </div>
        </div>

        <div className="p-6 flex flex-col gap-4">
          {error ? <Toast tone="bad">{error}</Toast> : null}
          {message ? <Toast tone="good">{message}</Toast> : null}

          {/* Discord - primary method */}
          <div>
            <button
              type="button"
              onClick={handleDiscordLogin}
              disabled={busy}
              className="w-full h-11 flex items-center justify-center gap-2 rounded-rr-ctl border-0 text-white text-[14px] font-semibold cursor-pointer transition-[filter,transform] hover:brightness-110 active:scale-[.98] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: '#5865F2' }}
            >
              {discordLoading ? <Spinner size={16} color="#ffffff" /> : (
                <svg style={{ width: '18px', height: '18px' }} viewBox="0 -28.5 256 256" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid">
                  <path d="M216.856339,16.5966031 C200.285002,8.84328665 182.566144,3.2084988 164.041564,0 C161.766523,4.11318106 159.108624,9.64549908 157.276099,14.0464379 C137.583995,11.0849896 118.072967,11.0849896 98.7430163,14.0464379 C96.9108417,9.64549908 94.1925838,4.11318106 91.8971895,0 C73.3526068,3.2084988 55.6133949,8.86399117 39.0420583,16.6376612 C5.61752293,67.146514 -3.4433191,116.400813 1.08711069,164.955721 C23.2560196,181.510915 44.7403634,191.567697 65.8621325,198.148576 C71.0772151,190.971126 75.7283628,183.341335 79.7352139,175.300261 C72.104019,172.400575 64.7949724,168.822202 57.8887866,164.667963 C59.7209612,163.310589 61.5131304,161.891452 63.2445898,160.431257 C105.36741,180.133187 151.134928,180.133187 192.754523,160.431257 C194.506336,161.891452 196.298154,163.310589 198.110326,164.667963 C191.183787,168.842556 183.854737,172.420929 176.223542,175.320965 C180.230393,183.341335 184.861538,190.991831 190.096624,198.16893 C211.238746,191.588051 232.743023,181.531619 254.911949,164.955721 C260.227747,108.668201 245.831087,59.8662432 216.856339,16.5966031 Z M85.4738752,135.09489 C72.8290281,135.09489 62.4592217,123.290155 62.4592217,108.914901 C62.4592217,94.5396472 72.607595,82.7145587 85.4738752,82.7145587 C98.3405064,82.7145587 108.709962,94.5189427 108.488529,108.914901 C108.508531,123.290155 98.3405064,135.09489 85.4738752,135.09489 Z M170.525237,135.09489 C157.88039,135.09489 147.510584,123.290155 147.510584,108.914901 C147.510584,94.5396472 157.658606,82.7145587 170.525237,82.7145587 C183.391518,82.7145587 193.761324,94.5189427 193.539891,108.914901 C193.539891,123.290155 183.391518,135.09489 170.525237,135.09489 Z" fill="#FFFFFF" fillRule="nonzero"></path>
                </svg>
              )}
              {discordLoading ? 'Connecting...' : 'Continue with Discord'}
            </button>
            <p className="mt-2 text-[12px] text-text2 text-center">Recommended: sign in with your squadron Discord account</p>
          </div>

          <div className="flex items-center gap-3">
            <span className="flex-1 h-px bg-border" />
            <span className="font-mono text-[10px] tracking-[.14em] text-text3">OR</span>
            <span className="flex-1 h-px bg-border" />
          </div>

          {/* Email / password - fallback */}
          <form className="flex flex-col gap-3" onSubmit={handleEmailLogin}>
            <Field label="Email address" htmlFor="email">
              <TextInput
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Password" htmlFor="password">
              <TextInput
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Button type="submit" variant="secondary" block loading={loading} disabled={discordLoading}>
              {loading ? 'Signing in...' : 'Sign in with email'}
            </Button>
            <button
              type="button"
              onClick={handlePasswordReset}
              disabled={resetLoading || busy}
              className="self-center text-[12.5px] font-semibold text-accent bg-transparent border-0 cursor-pointer hover:brightness-125 disabled:text-text3 disabled:cursor-not-allowed"
            >
              {resetLoading ? 'Sending...' : 'Forgot password?'}
            </button>
          </form>
        </div>

        <div className="px-6 py-3 border-t border-border bg-panel2 text-center text-[12px] text-text2">
          Need help? Contact your squadron administrator.
        </div>
      </div>
    </div>
  );
};

export default LoginForm;