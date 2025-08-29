import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase, onAuthStateChange } from '../utils/supabaseClient';
import { getUserProfile, type UserProfile } from '../utils/userProfileService';
import { triggerRoleSync } from '../utils/discordRoleSync';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userProfile: UserProfile | null;
  loading: boolean;
  error: string | null;
  isRecovering: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isRecovering, setIsRecovering] = useState(false);

  // Check for deployment-related recovery loops and prevent them
  useEffect(() => {
    const reloadCount = sessionStorage.getItem('auth_reload_count') || '0';
    const reloadCountNum = parseInt(reloadCount);
    
    // If we've had multiple reloads in this session, stop the cycle
    if (reloadCountNum >= 2) {
      console.log('Multiple authentication reloads detected - stopping recovery cycle');
      sessionStorage.removeItem('auth_reload_count');
      // Clear auth storage and let user manually sign in
      clearAuthStorage();
      setError(null);
      setLoading(false);
      return;
    }
  }, []);

  // Silent automatic recovery when authentication error occurs
  useEffect(() => {
    let recoveryTimeout: NodeJS.Timeout;
    
    if (error && !isRecovering && retryCount < 1) { // Reduced to single retry
      console.log('Authentication error detected, starting silent recovery:', error);
      setIsRecovering(true);
      setRetryCount(prev => prev + 1);
      
      // Check for persistent failures before attempting recovery
      const persistentFailures = localStorage.getItem('session_failures') || '0';
      const failureCount = parseInt(persistentFailures);
      
      // Track reload attempts in this session to prevent infinite loops
      const reloadCount = sessionStorage.getItem('auth_reload_count') || '0';
      const reloadCountNum = parseInt(reloadCount);
      
      if (reloadCountNum >= 2) {
        console.log('Too many reload attempts in this session - giving up recovery');
        setIsRecovering(false);
        clearAuthStorage();
        setError(null);
        setLoading(false);
        return;
      }
      
      recoveryTimeout = setTimeout(() => {
        console.log('Authentication error - clearing cache and attempting recovery');
        
        try {
          // Clear all authentication storage
          clearAuthStorage();
          localStorage.removeItem('app_version');
          
          // Increment reload counter
          sessionStorage.setItem('auth_reload_count', (reloadCountNum + 1).toString());
          
          if (failureCount >= 1) { // Reduced threshold
            console.log('Persistent session failures detected - forcing clean start');
            // Clear all localStorage except essential user preferences
            try {
              const keysToKeep = ['theme', 'user_preferences'];
              const storage: { [key: string]: string } = {};
              keysToKeep.forEach(key => {
                const value = localStorage.getItem(key);
                if (value) storage[key] = value;
              });
              localStorage.clear();
              Object.entries(storage).forEach(([key, value]) => {
                localStorage.setItem(key, value);
              });
            } catch (e) {
              console.error('Error cleaning localStorage:', e);
            }
          }
        } catch (storageError) {
          console.error('Error clearing storage:', storageError);
        }
        
        // Force immediate page reload - but only if we haven't exceeded reload limit
        window.location.reload();
      }, 1500); // Longer delay to prevent rapid reloads
    }
    
    return () => {
      if (recoveryTimeout) {
        clearTimeout(recoveryTimeout);
      }
    };
  }, [error, isRecovering, retryCount]);

  // Check if we need to clear cache due to deployment changes
  const checkForDeploymentChanges = () => {
    try {
      const currentVersion = new Date().toDateString(); // Simple version check
      const storedVersion = localStorage.getItem('app_version');
      
      if (!storedVersion) {
        // First time - store current version
        localStorage.setItem('app_version', currentVersion);
        return false;
      }
      
      // If we detect potential deployment issues (could be enhanced with actual build hash)
      const hasAuthStorage = Object.keys(localStorage).some(key => key.startsWith('sb-'));
      if (hasAuthStorage && session === null && user === null && error) {
        console.log('Detected potential deployment-related auth issues, clearing cache');
        return true;
      }
      
      return false;
    } catch (err) {
      console.error('Error checking deployment changes:', err);
      return false;
    }
  };

  // Clear corrupted auth storage
  const clearAuthStorage = () => {
    try {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('sb-') || key.includes('supabase')) {
          localStorage.removeItem(key);
        }
      });
      Object.keys(sessionStorage).forEach(key => {
        if (key.startsWith('sb-') || key.includes('supabase')) {
          sessionStorage.removeItem(key);
        }
      });
      console.log('Cleared auth storage');
      return true;
    } catch (err) {
      console.error('Error clearing auth storage:', err);
      return false;
    }
  };

  // Simplified - no complex session refresh logic needed anymore

  const refreshProfile = async () => {
    if (!user) {
      return;
    }

    try {
      const { profile, error: profileError } = await getUserProfile(user.id);
      
      if (profileError) {
        console.error('Error fetching user profile:', profileError);
        setError(profileError.message);
        return;
      }
      
      if (profile) {
        // Trigger Discord role sync if needed
        try {
          const syncSuccess = await triggerRoleSync(profile);
          if (syncSuccess) {
            // Refetch profile to get updated permissions
            const { profile: updatedProfile } = await getUserProfile(user.id);
            setUserProfile(updatedProfile);
          } else {
            setUserProfile(profile);
          }
        } catch (syncError) {
          console.warn('Role sync failed, using existing profile:', syncError);
          setUserProfile(profile);
        }
        
        setError(null);
      }
    } catch (err: any) {
      console.error('Unexpected error fetching profile:', err);
      setError(err.message || 'Failed to load user profile');
    }
  };

  useEffect(() => {
    let isMounted = true;
    
    // Fallback timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      if (isMounted && loading) {
        console.log('Authentication timeout reached - forcing clean state');
        setLoading(false);
        setError(null); // Don't set error to avoid triggering recovery
        setUser(null);
        setSession(null);
        setUserProfile(null);
      }
    }, 8000); // Longer timeout
    
    // Get initial session
    const initializeAuth = async () => {
      try {
        // Check if we're in a reload loop after deployment
        const reloadCount = sessionStorage.getItem('auth_reload_count') || '0';
        const reloadCountNum = parseInt(reloadCount);
        const persistentFailures = localStorage.getItem('session_failures') || '0';
        const failureCount = parseInt(persistentFailures);
        
        // If we've had failures or reloads, be more aggressive about bypassing session check
        if (reloadCountNum >= 1 || failureCount >= 2) {
          console.log('Post-deployment recovery detected - bypassing session check completely');
          clearAuthStorage();
          localStorage.removeItem('session_failures');
          sessionStorage.removeItem('auth_reload_count');
          
          // Skip session check entirely and start fresh
          if (isMounted) {
            setUser(null);
            setSession(null);
            setUserProfile(null);
            setError(null);
            setLoading(false);
          }
          clearTimeout(timeout);
          return;
        }

        // Check for deployment-related issues first
        const needsCacheClearing = checkForDeploymentChanges();
        if (needsCacheClearing) {
          console.log('Clearing cache due to detected deployment issues');
          clearAuthStorage();
        }

        // Try getSession with shorter timeout and better error handling
        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('getSession timeout')), 5000)) // Reduced timeout
        ]).catch((err) => {
          console.error('Initial session check failed:', err.message);
          
          // Immediately increment failure count
          const currentFailures = parseInt(localStorage.getItem('session_failures') || '0') + 1;
          console.log(`Session failure count: ${currentFailures}`);
          localStorage.setItem('session_failures', currentFailures.toString());
          
          // If this is the first or second failure, bypass session entirely
          if (currentFailures >= 1) {
            console.log('Session timeout detected - bypassing session check');
            clearAuthStorage();
            return { data: { session: null }, error: null }; // No error to avoid triggering recovery
          }
          
          return { data: { session: null }, error: err };
        }) as any;
        
        const sessionData = sessionResult.data || { session: null };
        const sessionError = sessionResult.error;
        
        // Clear failure count on successful session retrieval
        if (!sessionError) {
          localStorage.removeItem('session_failures');
        }
        
        let initialUser = sessionData.session?.user || null;
        let userError = sessionError;
        
        if (!isMounted) {
          clearTimeout(timeout);
          return;
        }
        
        if (userError) {
          console.error('Error getting initial user:', userError);
          
          // Set error immediately - let the recovery useEffect handle it
          setError('Authentication failed - clearing cache automatically');
          setUser(null);
          setUserProfile(null);
        } else {
          setUser(initialUser);
          setSession(sessionData.session);
          
          // If we have a user, fetch their profile
          if (initialUser) {
            // Always ensure a profile exists (regardless of provider)
            try {
              const { createOrUpdateUserProfile } = await import('../utils/userProfileService');
              await createOrUpdateUserProfile(initialUser);
            } catch (profileError) {
              console.error('Error creating profile:', profileError);
              // Don't fail the whole auth process if profile creation fails
            }
            
            if (isMounted) {
              await refreshProfile();
            }
          } else {
            // No user, set profile to null and clear error
            setUserProfile(null);
            setError(null);
          }
        }
      } catch (err: any) {
        console.error('Error initializing auth:', err);
        if (isMounted) {
          setError(err.message || 'Authentication initialization failed');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
        clearTimeout(timeout);
      }
    };

    initializeAuth();
    
    return () => {
      isMounted = false;
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    // Listen for auth state changes
    const { data: { subscription } } = onAuthStateChange(async (event, session) => {
      
      setSession(session);
      setUser(session?.user ?? null);

      if (event === 'SIGNED_IN' && session?.user) {
        // Clear recovery flags on successful sign in
        localStorage.removeItem('session_failures');
        sessionStorage.removeItem('auth_reload_count');
        console.log('Successful sign in - cleared recovery flags');
        
        setLoading(true);
        setError(null); // Clear any existing errors
        setIsRecovering(false); // Stop any recovery process
        
        // Profile will be created/updated by the onAuthStateChange handler in supabaseClient
        // Wait a moment for that to complete, then refresh
        setTimeout(async () => {
          await refreshProfile();
          setLoading(false);
        }, 1000);
      } else if (event === 'SIGNED_OUT') {
        setUserProfile(null);
        setError(null);
        setLoading(false);
        setIsRecovering(false);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // Update profile when user changes (but don't call refreshProfile if we don't have a user)
  useEffect(() => {
    if (user && !loading) {
      refreshProfile();
    } else if (!user && !loading) {
      setUserProfile(null);
    }
  }, [user?.id, loading]);

  const value: AuthContextType = {
    user,
    session,
    userProfile,
    loading,
    error,
    isRecovering,
    refreshProfile
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}