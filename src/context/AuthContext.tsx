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

  // Silent automatic recovery when authentication error occurs
  useEffect(() => {
    let recoveryTimeout: NodeJS.Timeout;
    
    if (error && !isRecovering && retryCount < 1) {
      console.log('Authentication error detected, starting silent recovery:', error);
      setIsRecovering(true);
      
      // Small delay to avoid race conditions
      recoveryTimeout = setTimeout(async () => {
        try {
          // First attempt: try session refresh
          console.log('Attempting session refresh...');
          const refreshSuccess = await attemptSessionRefresh(1);
          
          if (refreshSuccess) {
            console.log('Session refresh successful');
            setError(null);
            setIsRecovering(false);
            return;
          }
          
          // Second attempt: clear storage and reload
          console.log('Session refresh failed, clearing storage and reloading...');
          clearAuthStorage();
          
          // Clear app version to ensure fresh start
          localStorage.removeItem('app_version');
          
          // Force page reload after clearing storage
          window.location.reload();
          
        } catch (recoveryError) {
          console.error('Recovery failed:', recoveryError);
          // If all else fails, clear storage and reload anyway
          clearAuthStorage();
          localStorage.removeItem('app_version');
          window.location.reload();
        }
      }, 1000);
      
      setRetryCount(prev => prev + 1);
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

  // Attempt to refresh session with retry logic
  const attemptSessionRefresh = async (maxRetries = 2) => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        console.log(`Attempting session refresh (attempt ${attempt + 1}/${maxRetries})`);
        
        // First try to refresh the session
        const { data, error: refreshError } = await supabase.auth.refreshSession();
        
        if (!refreshError && data.session) {
          console.log('Session refresh successful');
          setSession(data.session);
          setUser(data.session.user);
          setError(null);
          setRetryCount(0);
          return true;
        }
        
        // If refresh failed, try getting existing session
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        
        if (!sessionError && sessionData.session) {
          console.log('Existing session recovered');
          setSession(sessionData.session);
          setUser(sessionData.session.user);
          setError(null);
          setRetryCount(0);
          return true;
        }
        
        console.warn(`Session refresh attempt ${attempt + 1} failed:`, refreshError || sessionError);
        
        // If this is not the last attempt, clear storage and try again
        if (attempt < maxRetries - 1) {
          clearAuthStorage();
          // Wait a bit before retrying
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (err) {
        console.error(`Session refresh attempt ${attempt + 1} error:`, err);
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    
    return false;
  };

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
        setLoading(false);
        setError('Authentication timeout - please try refreshing');
      }
    }, 5000); // 5 second timeout
    
    // Get initial session
    const initializeAuth = async () => {
      try {
        // Check for deployment-related issues first
        const needsCacheClearing = checkForDeploymentChanges();
        if (needsCacheClearing) {
          console.log('Clearing cache due to detected deployment issues');
          clearAuthStorage();
        }

        // Try getSession first (with timeout protection)
        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('getSession timeout')), 10000))
        ]).catch(async (err) => {
          console.error('Initial session check failed:', err.message);
          
          // If it's a timeout or parse error, try session refresh
          if (err.message.includes('timeout') || err.message.includes('parse') || err.message.includes('JSON')) {
            console.log('Attempting session recovery due to error:', err.message);
            const recoverySuccessful = await attemptSessionRefresh();
            
            if (recoverySuccessful) {
              return await supabase.auth.getSession();
            }
          }
          
          return { data: { session: null }, error: null }; // Don't treat as error in production
        }) as any;
        
        const sessionData = sessionResult.data || { session: null };
        const sessionError = sessionResult.error;
        
        let initialUser = sessionData.session?.user || null;
        let userError = sessionError;
        
        if (!isMounted) {
          clearTimeout(timeout);
          return;
        }
        
        if (userError) {
          console.error('Error getting initial user:', userError);
          
          // Try one more recovery attempt before showing error
          if (retryCount < 2) {
            console.log('Attempting auth recovery...');
            setRetryCount(prev => prev + 1);
            
            const recoverySuccessful = await attemptSessionRefresh();
            if (!recoverySuccessful) {
              setError('Authentication failed - please try logging in again');
            }
          } else {
            setError(userError.message);
          }
          
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
        setLoading(true);
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