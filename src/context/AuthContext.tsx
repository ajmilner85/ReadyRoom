import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase, getCurrentUser, onAuthStateChange } from '../utils/supabaseClient';
import { getUserProfile, type UserProfile } from '../utils/userProfileService';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userProfile: UserProfile | null;
  loading: boolean;
  error: string | null;
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

  const refreshProfile = async () => {
    if (!user) {
      return;
    }

    try {
      const { profile, error: profileError } = await getUserProfile(user.id);
      
      if (profileError) {
        console.error('Error fetching user profile:', profileError);
        setError(profileError.message);
      } else {
        setUserProfile(profile);
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
        // Try getSession first (with timeout protection)
        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('getSession timeout')), 2000))
        ]).catch(err => {
          console.error('Session check failed:', err.message);
          return { data: { session: null }, error: err };
        }) as any;
        
        const sessionData = sessionResult.data || { session: null };
        const sessionError = sessionResult.error;
        
        let initialUser = sessionData.session?.user || null;
        let userError = sessionError;
        
        // Skip getCurrentUser entirely since it hangs - just rely on session
        if (!initialUser && !sessionError) {
          userError = null; // Don't treat this as an error
        }
        
        if (!isMounted) {
          clearTimeout(timeout);
          return;
        }
        
        if (userError) {
          console.error('Error getting initial user:', userError);
          setError(userError.message);
          setUser(null);
          setUserProfile(null);
        } else {
          setUser(initialUser);
          
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
    refreshProfile
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}