/**
 * Debug utility to check pilot roles in the database
 * Usage: Call this function from browser console: window.debugPilotRoles()
 */

import { supabase } from './supabaseClient';

async function debugPilotRoles() {
  console.log('=== DEBUG: Checking pilot_roles table ===');
  
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
    console.log(`\n⚠️  Roles ended today (${today}):`, rolesTodayEnded.length);
    rolesTodayEnded.forEach(pr => {
      console.log(`  - ${pr.pilots?.callsign}: ${pr.roles?.name} (ended: ${pr.end_date})`);
    });
  }
}

async function debugPilotsWithRoles() {
  console.log('=== DEBUG: Testing pilots query with join ===');
  
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
  
  console.log('✅ Pilots query successful. Sample data:');
  data?.forEach((pilot, index) => {
    console.log(`${index + 1}. ${pilot.callsign}:`, {
      id: pilot.id,
      pilot_roles: pilot.pilot_roles,
      pilot_roles_count: pilot.pilot_roles?.length || 0
    });
  });
}

async function testPilotRolesRelationship() {
  console.log('=== DEBUG: Testing pilot_roles relationship ===');
  
  // First, check if pilot_roles table has any data
  const { data: allRoles, error: rolesError } = await supabase
    .from('pilot_roles')
    .select('*')
    .limit(5);
    
  if (rolesError) {
    console.error('❌ Error fetching pilot_roles:', rolesError);
    return;
  }
  
  console.log('📊 pilot_roles table data:', allRoles);
  
  if (!allRoles || allRoles.length === 0) {
    console.log('⚠️  No data in pilot_roles table!');
    return;
  }
  
  // Test different join approaches
  console.log('\n🔍 Testing different join syntaxes:');
  
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

export { debugPilotRoles, debugPilotsWithRoles, testPilotRolesRelationship };
