import React, { useState } from 'react';
import { signIn, signInWithDiscord } from '../../utils/supabaseClient';

const QuickLogin: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEmailLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      const { error } = await signIn('ajmilner85@gmail.com', 'test123'); // Using a test password
      if (error) {
        throw error;
      }
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDiscordLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      const { error } = await signInWithDiscord();
      if (error) {
        throw error;
      }
    } catch (err: any) {
      setError(err.message || 'Discord login failed');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-panel2">
      <div className="max-w-md w-full space-y-6 p-6">
        <div>
          <h2 className="text-2xl font-bold text-center">Quick Login (Debug)</h2>
          <p className="text-center text-text2 mt-2">Choose your login method</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-bad text-bad px-4 py-3 rounded">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <button
            onClick={handleDiscordLogin}
            disabled={loading}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-accent hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Login with Discord'}
          </button>

          <button
            onClick={handleEmailLogin}
            disabled={loading}
            className="w-full flex justify-center py-3 px-4 border border-border2 rounded-md shadow-sm text-sm font-medium text-text bg-panel hover:bg-panel2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Login with Email (Test)'}
          </button>
        </div>

        <div className="text-center">
          <a href="?debug=true" className="text-accent hover:text-indigo-500 text-sm">
            View Debug Info
          </a>
        </div>
      </div>
    </div>
  );
};

export default QuickLogin;