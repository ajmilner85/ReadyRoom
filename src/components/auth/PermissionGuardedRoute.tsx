import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useSimplePermissions } from '../../hooks/usePermissions';
import { useAuth } from '../../context/AuthContext';

interface PermissionGuardedRouteProps {
  children: React.ReactNode;
  requiredPermission: 'access_home' | 'access_roster' | 'access_events' | 'access_mission_prep' | 'access_flights' | 'access_settings' | 'access_reports' | 'access_mission_debriefing' | 'access_my_training' | 'access_training_management';
  fallbackMessage?: string;
}

const PermissionGuardedRoute: React.FC<PermissionGuardedRouteProps> = ({ 
  children, 
  requiredPermission, 
  fallbackMessage = "You don't have permission to access this page." 
}) => {
  const { user, userProfile, loading: authLoading } = useAuth();
  const activePermissions = useSimplePermissions();

  // Show loading spinner while authentication or permissions are loading
  if (authLoading || activePermissions.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // If not authenticated, this should be handled by ProtectedRoute wrapper
  if (!user || !userProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-red-600 mb-4">Authentication required</p>
        </div>
      </div>
    );
  }

  // Check specific permission
  const hasPermission = (() => {
    switch (requiredPermission) {
      case 'access_home': return activePermissions.canAccessHome;
      case 'access_roster': return activePermissions.canAccessRoster;
      case 'access_events': return activePermissions.canAccessEvents;
      case 'access_mission_prep': return activePermissions.canAccessMissionPrep;
      case 'access_flights': return activePermissions.canAccessFlights;
      case 'access_mission_debriefing': return activePermissions.canAccessMissionDebriefing;
      case 'access_settings': return activePermissions.canAccessSettings;
      case 'access_reports': return activePermissions.canAccessReports;
      case 'access_my_training': return activePermissions.access_my_training;
      case 'access_training_management': return activePermissions.access_training_management;
      default: return false;
    }
  })();

  // If user doesn't have permission, show access denied message
  if (!hasPermission) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="mb-6 flex justify-center">
            <AlertTriangle size={192} style={{ color: '#D1D5DB' }} />
          </div>
          <h2 className="text-xl font-semibold text-gray-800 mb-3">Access Denied</h2>
          <p className="mb-4" style={{ color: '#9CA3AF' }}>{fallbackMessage}</p>
          <p className="text-sm" style={{ color: '#9CA3AF' }}>
            Contact your administrator if you believe you should have access to this page.
          </p>
        </div>
      </div>
    );
  }

  // User has permission, render the protected content
  return <>{children}</>;
};

export default PermissionGuardedRoute;