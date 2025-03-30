import React, { useState, useEffect } from 'react';
import { signIn, signOut, getCurrentUser } from '../../utils/supabaseClient';

interface LoginFormProps {
  onLoginStateChange?: (isLoggedIn: boolean) => void;
}

const LoginForm: React.FC<LoginFormProps> = ({ onLoginStateChange }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  
  useEffect(() => {
    const checkCurrentUser = async () => {
      const { user, error } = await getCurrentUser();
      if (user) {
        setUser(user);
        if (onLoginStateChange) onLoginStateChange(true);
      }
    };
    
    checkCurrentUser();
  }, [onLoginStateChange]);
  
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      const { data, error } = await signIn(email, password);
      
      if (error) {
        throw error;
      }
      
      if (data.user) {
        setUser(data.user);
        if (onLoginStateChange) onLoginStateChange(true);
        setEmail('');
        setPassword('');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'Failed to login');
    } finally {
      setLoading(false);
    }
  };
  
  const handleLogout = async () => {
    setLoading(true);
    
    try {
      const { error } = await signOut();
      
      if (error) {
        throw error;
      }
      
      setUser(null);
      if (onLoginStateChange) onLoginStateChange(false);
    } catch (err: any) {
      console.error('Logout error:', err);
      setError(err.message || 'Failed to logout');
    } finally {
      setLoading(false);
    }
  };
  
  if (user) {
    return (
      <div className="p-4 border border-gray-200 rounded-md bg-gray-50">
        <div className="mb-3">
          <span className="font-medium">Logged in as: </span>
          <span>{user.email}</span>
        </div>
        <button
          onClick={handleLogout}
          disabled={loading}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
        >
          {loading ? 'Logging out...' : 'Logout'}
        </button>
      </div>
    );
  }
  
  return (
    <div className="p-4 border border-gray-200 rounded-md">
      <h2 className="text-lg font-semibold mb-4">Admin Login</h2>
      
      {error && (
        <div className="mb-4 p-2 bg-red-100 text-red-700 border border-red-200 rounded">
          {error}
        </div>
      )}
      
      <form onSubmit={handleLogin}>
        <div className="mb-4">
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        <div className="mb-4">
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>
    </div>
  );
};

export default LoginForm;