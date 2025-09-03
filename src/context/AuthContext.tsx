import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { getSupabase, onAuthStateChange } from '../utils/supabaseClient';
import { getUserProfile, createOrUpdateUserProfile, type UserProfile } from '../utils/userProfileService';
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
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);

  const refreshProfile = async () => {
    console.log('refreshProfile called, user:', user?.id, 'isCreatingProfile:', isCreatingProfile);
    if (!user) {
      console.log('No user in refreshProfile, setting profile to null');
      setUserProfile(null);
      setIsCreatingProfile(false);
      return;
    }

    // Prevent concurrent profile creation attempts
    if (isCreatingProfile) {
      console.log('Profile creation already in progress, skipping...');
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
      
      // If no profile exists, create one for the new user
      if (!profile && !isCreatingProfile) {
        console.log('No profile found, creating new user profile...');
        setIsCreatingProfile(true);
        
        try {
          const { profile: newProfile, error: createError } = await createOrUpdateUserProfile(user);
          
          if (createError) {
            // Handle the case where profile was created by another concurrent call
            if ((createError as any).code === '23505') {
              console.log('Profile already exists (created concurrently), fetching it...');
              const { profile: existingProfile } = await getUserProfile(user.id);
              if (existingProfile) {
                console.log('Found existing profile:', existingProfile.id);
                setUserProfile(existingProfile);
                setError(null);
                setIsCreatingProfile(false);
                return;
              }
            }
            
            console.error('Error creating user profile:', createError);
            setError(createError.message);
            setIsCreatingProfile(false);
            return;
          }
          
          if (newProfile) {
            console.log('New profile created:', newProfile.id);
            setUserProfile(newProfile);
            setError(null);
            setIsCreatingProfile(false);
            return;
          } else {
            console.error('Profile creation returned null without error');
            setError('Failed to create user profile');
            setIsCreatingProfile(false);
            return;
          }
        } catch (createErr: any) {
          console.error('Unexpected error during profile creation:', createErr);
          setError(createErr.message || 'Failed to create user profile');
          setIsCreatingProfile(false);
          return;
        }
      }
      
      // Profile exists, continue with role sync
      if (profile) {
        try {
          const syncSuccess = await triggerRoleSync(profile);
          if (syncSuccess) {
            // Refetch profile to get updated permissions
            const { profile: updatedProfile } = await getUserProfile(user.id);
            setUserProfile(updatedProfile || profile);
          } else {
            setUserProfile(profile);
          }
        } catch (syncError) {
          console.warn('Role sync failed, using existing profile:', syncError);
          setUserProfile(profile);
        }
      }
      
      setError(null);
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
      setIsCreatingProfile(false); // Reset profile creation flag on auth state change

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