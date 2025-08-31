import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { getSupabase, onAuthStateChange } from '../utils/supabaseClient';
import { getUserProfile, type UserProfile } from '../utils/userProfileService';
import { triggerRoleSync } from '../utils/discordRoleSync';

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
      setUserProfile(null);
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

  // Initialize auth - much simpler now with wake system handling recovery
  useEffect(() => {
    let isMounted = true;
    
    const initializeAuth = async () => {
      try {
        const supabase = getSupabase();
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (!isMounted) return;
        
        if (error) {
          console.error('Error getting initial session:', error);
          setError('Authentication failed');
          setUser(null);
          setSession(null);
          setUserProfile(null);
        } else {
          setUser(session?.user || null);
          setSession(session);
          setError(null);
          
          // If we have a user, ensure profile exists and fetch it
          if (session?.user) {
            try {
              const { createOrUpdateUserProfile } = await import('../utils/userProfileService');
              await createOrUpdateUserProfile(session.user);
              await refreshProfile();
            } catch (profileError) {
              console.error('Error with user profile:', profileError);
              // Don't fail the whole auth process if profile creation fails
            }
          } else {
            setUserProfile(null);
          }
        }
      } catch (err: any) {
        console.error('Error initializing auth:', err);
        if (isMounted) {
          setError(err.message || 'Authentication initialization failed');
          setUser(null);
          setSession(null);
          setUserProfile(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    initializeAuth();
    
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    // Listen for auth state changes
    const { data: { subscription } } = onAuthStateChange(async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (event === 'SIGNED_IN' && session?.user) {
        setLoading(true);
        setError(null);
        
        // Use setTimeout to avoid race conditions with auth state changes
        // This is a known pattern for Supabase auth state management
        setTimeout(async () => {
          try {
            // Profile will be created/updated by the onAuthStateChange handler in supabaseClient
            // Wait a moment for that to complete, then refresh
            await refreshProfile();
          } catch (err) {
            console.error('Error refreshing profile after sign in:', err);
          } finally {
            setLoading(false);
          }
        }, 100); // Short delay to avoid race conditions
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
      // Use setTimeout here too to avoid race conditions
      setTimeout(() => {
        refreshProfile();
      }, 50);
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