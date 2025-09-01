/**
 * Debug utility to check pilot roles in the database
 * Usage: Call this function from browser console: window.debugPilotRoles()
 */

import { supabase } from './supabaseClient';

async function debugPilotRoles() {
  // console.log('=== DEBUG: Checking pilot_roles table ===');
  
  const { data, error } = await supabase
    .from('pilot_roles')
    .select(`
      *,
      pilots:pilot_id (id, callsign),
      roles:role_id (id, name)
    `)
    .order('created_at', { ascending: false })
    .limit(10);
    
  if (error) {
    console.error('Error fetching pilot roles:', error);
    return;
  }
  
  console.log('Recent pilot role assignments:');
  data?.forEach((pr, index) => {
    console.log(`${index + 1}.`, {
      id: pr.id,
      pilot: pr.pilots?.callsign,
      role: pr.roles?.name,
      effective_date: pr.effective_date,
      end_date: pr.end_date,
      is_acting: pr.is_acting,
      created_at: pr.created_at
    });
  });
  
  // Check for any roles with unexpected end_dates
  const activeRoles = data?.filter(pr => !pr.end_date) || [];
  const endedRoles = data?.filter(pr => pr.end_date) || [];
  
  console.log(`\nActive roles (no end_date): ${activeRoles.length}`);
  console.log(`Ended roles (with end_date): ${endedRoles.length}`);
  
  // Check for roles ending today (which might indicate the bug)
  const today = new Date().toISOString().split('T')[0];
  const rolesTodayEnded = endedRoles.filter(pr => pr.end_date === today);
  
  if (rolesTodayEnded.length > 0) {
    rolesTodayEnded.forEach(pr => {
      console.log(`  - ${pr.pilots?.callsign}: ${pr.roles?.name} (ended: ${pr.end_date})`);
    });
  }
}

async function debugPilotsWithRoles() {
  // console.log('=== DEBUG: Testing pilots query with join ===');
  
  // Test the exact query used in getAllPilots
  const { data, error } = await supabase
    .from('pilots')
    .select(`
      id,
      callsign,
      boardNumber,
      pilot_roles (
        id,
        role_id,
        effective_date,
        is_acting,
        end_date,
        created_at,
        updated_at,
        roles:role_id (
          id,
          name,
          isExclusive,
          compatible_statuses,
          order
        )
      )
    `)
    .order('boardNumber', { ascending: true })
    .limit(5);
    
  if (error) {
    console.error('❌ Error in pilots query:', error);
    return;
  }
  
  data?.forEach((pilot, index) => {
    console.log(`${index + 1}. ${pilot.callsign}:`, {
      id: pilot.id,
      pilot_roles: pilot.pilot_roles,
      pilot_roles_count: pilot.pilot_roles?.length || 0
    });
  });
}

async function testPilotRolesRelationship() {
  // console.log('=== DEBUG: Testing pilot_roles relationship ===');
  
  // First, check if pilot_roles table has any data
  const { data: allRoles, error: rolesError } = await supabase
    .from('pilot_roles')
    .select('*')
    .limit(5);
    
  if (rolesError) {
    console.error('❌ Error fetching pilot_roles:', rolesError);
    return;
  }
  
  
  if (!allRoles || allRoles.length === 0) {
    return;
  }
  
  // Test different join approaches
  
  // Method 1: Simple join
  const { data: method1, error: error1 } = await supabase
    .from('pilots')
    .select(`
      id, callsign,
      pilot_roles (*)
    `)
    .limit(3);
    
  console.log('Method 1 (simple join):', { data: method1, error: error1 });
  
  // Method 2: With foreign key name
  const { data: method2, error: error2 } = await supabase
    .from('pilots')
    .select(`
      id, callsign,
      pilot_roles!pilot_roles_pilot_id_fkey (*)
    `)
    .limit(3);
    
  console.log('Method 2 (with FK name):', { data: method2, error: error2 });
  
  // Method 3: Manual join using pilot_id
  const { data: method3, error: error3 } = await supabase
    .from('pilot_roles')
    .select(`
      *,
      pilots!pilot_roles_pilot_id_fkey (id, callsign)
    `)
    .limit(3);
    
  console.log('Method 3 (reverse join):', { data: method3, error: error3 });
}

// Make both functions available globally for browser console debugging
(window as any).debugPilotRoles = debugPilotRoles;
(window as any).debugPilotsWithRoles = debugPilotsWithRoles;
(window as any).testPilotRolesRelationship = testPilotRolesRelationship;

// Expose Supabase client for debugging
(window as any).supabase = supabase;

// Debug authentication and mission integration
async function debugAuth() {
  console.log('=== ReadyRoom Authentication Debug ===');
  
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('❌ Auth error:', error);
      return;
    }
    
    if (session) {
      console.log('✅ User authenticated:', session.user.email || session.user.id);
      console.log('Session expires:', session.expires_at ? new Date(session.expires_at * 1000) : 'No expiration');
      
      // Test database access
      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('id, name')
        .limit(5);
        
      if (eventsError) {
        console.error('❌ Events query error:', eventsError);
      } else {
        console.log('✅ Events accessible:', events?.length || 0, 'events');
      }
      
      // Test missions table
      const { data: missions, error: missionsError } = await supabase
        .from('missions')
        .select('id, name')
        .limit(5);
        
      if (missionsError) {
        console.error('❌ Missions table error (table may not exist):', missionsError);
      } else {
        console.log('✅ Missions table accessible:', missions?.length || 0, 'missions');
      }
      
    } else {
      console.log('❌ No active session');
    }
    
  } catch (err) {
    console.error('❌ Debug failed:', err);
  }
}

(window as any).debugAuth = debugAuth;

// Debug auth state changes to track UI flashing issue
function debugAuthStateChanges() {
  console.log('=== Auth State Change Monitoring ===');
  
  // Monitor auth state changes
  const unsubscribe = supabase.auth.onAuthStateChange((event, session) => {
    console.log(`🔄 Auth state change: ${event}`, {
      event,
      hasSession: !!session,
      hasUser: !!session?.user,
      userEmail: session?.user?.email,
      timestamp: new Date().toISOString()
    });
  });
  
  console.log('✅ Auth state monitoring started. Call stopAuthDebug() to stop.');
  
  // Make stop function available
  (window as any).stopAuthDebug = () => {
    unsubscribe.data.subscription.unsubscribe();
    console.log('🛑 Auth state monitoring stopped');
  };
}

(window as any).debugAuthStateChanges = debugAuthStateChanges;

// Debug React rendering issues
function debugRender() {
  console.log('=== React Render Debug ===');
  
  // Check if React root exists
  const root = document.getElementById('root');
  console.log('Root element exists:', !!root);
  console.log('Root innerHTML length:', root?.innerHTML?.length || 0);
  console.log('Root children count:', root?.children?.length || 0);
  
  // Check for React components in the DOM
  const reactElements = document.querySelectorAll('[data-reactroot], [data-react-*]');
  console.log('React elements found:', reactElements.length);
  
  // Check for error boundaries or crash indicators
  const errorElements = document.querySelectorAll('.error, .crash, [data-error="true"]');
  console.log('Error elements found:', errorElements.length);
  
  // Check if main app components are rendered
  const navBar = document.querySelector('nav, .navigation, .navbar');
  const mainContent = document.querySelector('main, .main-content, .content');
  console.log('Navigation found:', !!navBar);
  console.log('Main content found:', !!mainContent);
  
  // Check React DevTools
  console.log('React DevTools available:', !!(window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__);
  
  // Check for unhandled promise rejections
  let unhandledRejections = 0;
  const originalHandler = window.onunhandledrejection;
  window.onunhandledrejection = (event) => {
    unhandledRejections++;
    console.error('Unhandled promise rejection:', event.reason);
    if (originalHandler) originalHandler.call(window, event);
  };
  
  console.log('Debug setup complete. Monitoring for issues...');
  
  // Return cleanup function
  return () => {
    window.onunhandledrejection = originalHandler;
  };
}

(window as any).debugRender = debugRender;

// Debug component mounting
function debugComponentMounting() {
  console.log('=== Component Mounting Debug ===');
  
  // Hook into React error boundaries
  const originalError = console.error;
  console.error = (...args) => {
    if (args[0] && args[0].includes && (
      args[0].includes('React') || 
      args[0].includes('component') || 
      args[0].includes('render')
    )) {
      console.log('🔴 React Error Detected:', ...args);
    }
    originalError(...args);
  };
  
  console.log('✅ Component mounting debug active');
  
  return () => {
    console.error = originalError;
  };
}

(window as any).debugComponentMounting = debugComponentMounting;

export { debugPilotRoles, debugPilotsWithRoles, testPilotRolesRelationship };
