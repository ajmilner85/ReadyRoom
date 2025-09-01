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
    console.log('refreshProfile called, user:', user?.id);
    if (!user) {
      console.log('No user in refreshProfile, setting profile to null');
      setUserProfile(null);
      return;
    }

    try {
      console.log('Fetching user profile for user:', user.id);
      const { profile, error: profileError } = await getUserProfile(user.id);
      
      if (profileError) {
        console.error('Error fetching user profile:', profileError);
        setError(profileError.message);
        return;
      }
      
      console.log('Profile fetched:', !!profile, profile?.id);
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

  // Simplified auth initialization
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
        } else {
          setUser(session?.user || null);
          setSession(session);
          setError(null);
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
      setError(null);

      if (event === 'SIGNED_OUT') {
        setUserProfile(null);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // Load profile when user is available
  useEffect(() => {
    console.log('Profile loading effect triggered:', { 
      hasUser: !!user, 
      loading, 
      userId: user?.id,
      currentProfile: !!userProfile 
    });
    
    if (user && !loading) {
      console.log('Starting profile refresh...');
      refreshProfile().catch(err => {
        console.warn('Profile loading failed, continuing with auth:', err);
        // Don't fail the auth process if profile fails
      });
    } else if (!user) {
      console.log('No user, clearing profile');
      setUserProfile(null);
    } else {
      console.log('Waiting for loading to finish before loading profile');
    }
  }, [user?.id, loading]); // Added loading to dependencies

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