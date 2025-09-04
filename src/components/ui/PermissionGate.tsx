import React from 'react';
import { useComponentPermissions } from '../../hooks/usePermissions';
import type { PermissionCheckContext } from '../../types/PermissionTypes';

// Tooltip component for disabled states (you may want to use your existing tooltip)
interface TooltipProps {
  content: string;
  children: React.ReactNode;
}

const Tooltip: React.FC<TooltipProps> = ({ content, children }) => (
  <div className="relative group">
    {children}
    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
      {content}
      <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
    </div>
  </div>
);

export type PermissionGateMode = 'hide' | 'disable' | 'show-tooltip';

interface PermissionGateProps {
  /** The permission required to access the wrapped content */
  permission: string;
  
  /** Context for scoped permissions (squadron, wing, etc.) */
  context?: PermissionCheckContext;
  
  /** How to handle insufficient permissions */
  mode?: PermissionGateMode;
  
  /** Content to show when permission is denied (only for 'hide' mode) */
  fallback?: React.ReactNode;
  
  /** Custom message for disabled tooltip */
  deniedMessage?: string;
  
  /** Additional CSS classes to apply based on permission state */
  className?: string;
  
  /** Children to protect with permission check */
  children: React.ReactNode;
  
  /** If true, require loading to complete before showing content */
  waitForLoad?: boolean;
}

/**
 * PermissionGate component for protecting UI elements based on user permissions
 * 
 * Modes:
 * - 'hide': Completely hide the component when permission is denied
 * - 'disable': Show the component but disable it and apply disabled styling
 * - 'show-tooltip': Same as disable but with tooltip explaining why it's disabled
 * 
 * @example
 * // Hide button if user can't sync with Discord
 * <PermissionGate permission="sync_with_discord">
 *   <Button onClick={handleSync}>Sync with Discord</Button>
 * </PermissionGate>
 * 
 * // Show disabled button with tooltip for squadron-specific permission
 * <PermissionGate 
 *   permission="manage_squadron_settings" 
 *   context={{ squadronId: squadron.id }}
 *   mode="show-tooltip"
 * >
 *   <Button onClick={handleEdit}>Edit Squadron</Button>
 * </PermissionGate>
 * 
 * // Show fallback content when permission denied
 * <PermissionGate 
 *   permission="access_admin_tools"
 *   fallback={<div>Admin tools not available</div>}
 * >
 *   <AdminPanel />
 * </PermissionGate>
 */
export const PermissionGate: React.FC<PermissionGateProps> = ({
  permission,
  context,
  mode = 'hide',
  fallback,
  deniedMessage,
  className = '',
  children,
  waitForLoad = false
}) => {
  const { 
    isVisible, 
    isEnabled, 
    getPermissionClasses, 
    loading 
  } = useComponentPermissions();

  // Wait for loading to complete if requested
  if (waitForLoad && loading) {
    return <div className="animate-pulse bg-gray-200 rounded h-8 w-24"></div>;
  }

  const hasPermission = isVisible(permission, context);
  const shouldDisable = !isEnabled(permission, context);

  // Handle hide mode
  if (mode === 'hide' && !hasPermission) {
    return <>{fallback || null}</>;
  }

  // Handle disable modes
  if ((mode === 'disable' || mode === 'show-tooltip') && shouldDisable) {
    // Clone the child element and apply disabled properties
    const childElement = React.Children.only(children) as React.ReactElement;
    
    const disabledElement = React.cloneElement(childElement, {
      disabled: true,
      className: `${childElement.props.className || ''} ${getPermissionClasses(permission, context)} ${className}`.trim(),
      onClick: undefined, // Remove click handlers
      onSubmit: undefined, // Remove submit handlers
      'aria-disabled': true,
      'data-permission-denied': true
    });

    // Wrap with tooltip for show-tooltip mode
    if (mode === 'show-tooltip') {
      const tooltipMessage = deniedMessage || `You don't have permission to ${permission.replace(/_/g, ' ')}`;
      return (
        <Tooltip content={tooltipMessage}>
          {disabledElement}
        </Tooltip>
      );
    }

    return disabledElement;
  }

  // Permission granted - render normally
  const childElement = React.Children.only(children) as React.ReactElement;
  
  // Apply permission classes if provided
  if (className) {
    return React.cloneElement(childElement, {
      className: `${childElement.props.className || ''} ${className}`.trim()
    });
  }

  return <>{children}</>;
};

/**
 * Higher-order component version of PermissionGate for class components
 */
export function withPermissionGate<P extends object>(
  Component: React.ComponentType<P>,
  permission: string,
  options?: {
    context?: PermissionCheckContext;
    mode?: PermissionGateMode;
    fallback?: React.ReactNode;
    deniedMessage?: string;
  }
) {
  const WrappedComponent = (props: P) => (
    <PermissionGate
      permission={permission}
      context={options?.context}
      mode={options?.mode}
      fallback={options?.fallback}
      deniedMessage={options?.deniedMessage}
    >
      <Component {...props} />
    </PermissionGate>
  );

  WrappedComponent.displayName = `withPermissionGate(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}

/**
 * Specialized permission gates for common use cases
 */

interface AdminOnlyProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  mode?: PermissionGateMode;
}

export const AdminOnly: React.FC<AdminOnlyProps> = ({ children, fallback, mode = 'hide' }) => (
  <PermissionGate 
    permission="access_admin_tools" 
    mode={mode}
    fallback={fallback}
    deniedMessage="Administrator access required"
  >
    {children}
  </PermissionGate>
);

interface SquadronManagerOnlyProps {
  squadronId?: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  mode?: PermissionGateMode;
}

export const SquadronManagerOnly: React.FC<SquadronManagerOnlyProps> = ({ 
  squadronId, 
  children, 
  fallback, 
  mode = 'hide' 
}) => (
  <PermissionGate 
    permission="manage_squadron_settings"
    context={squadronId ? { squadronId } : undefined}
    mode={mode}
    fallback={fallback}
    deniedMessage="Squadron management access required"
  >
    {children}
  </PermissionGate>
);

interface RosterManagerOnlyProps {
  squadronId?: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  mode?: PermissionGateMode;
}

export const RosterManagerOnly: React.FC<RosterManagerOnlyProps> = ({ 
  squadronId, 
  children, 
  fallback, 
  mode = 'hide' 
}) => (
  <PermissionGate 
    permission="manage_roster"
    context={squadronId ? { squadronId } : undefined}
    mode={mode}
    fallback={fallback}
    deniedMessage="Roster management access required"
  >
    {children}
  </PermissionGate>
);

/**
 * Multi-permission gate that requires ANY of the specified permissions
 */
interface AnyPermissionGateProps {
  permissions: string[];
  context?: PermissionCheckContext;
  mode?: PermissionGateMode;
  fallback?: React.ReactNode;
  deniedMessage?: string;
  children: React.ReactNode;
}

export const AnyPermissionGate: React.FC<AnyPermissionGateProps> = ({
  permissions,
  context,
  mode = 'hide',
  fallback,
  deniedMessage,
  children
}) => {
  const { hasAnyPermission, loading } = useComponentPermissions();

  if (loading) {
    return <div className="animate-pulse bg-gray-200 rounded h-8 w-24"></div>;
  }

  const hasAccess = hasAnyPermission(permissions, context);

  if (!hasAccess && mode === 'hide') {
    return <>{fallback || null}</>;
  }

  if (!hasAccess && (mode === 'disable' || mode === 'show-tooltip')) {
    const childElement = React.Children.only(children) as React.ReactElement;
    
    const disabledElement = React.cloneElement(childElement, {
      disabled: true,
      className: `${childElement.props.className || ''} opacity-50 cursor-not-allowed`.trim(),
      onClick: undefined,
      'aria-disabled': true
    });

    if (mode === 'show-tooltip') {
      const message = deniedMessage || `You need one of these permissions: ${permissions.join(', ')}`;
      return (
        <Tooltip content={message}>
          {disabledElement}
        </Tooltip>
      );
    }

    return disabledElement;
  }

  return <>{children}</>;
};

/**
 * Multi-permission gate that requires ALL of the specified permissions
 */
interface AllPermissionGateProps {
  permissions: string[];
  context?: PermissionCheckContext;
  mode?: PermissionGateMode;
  fallback?: React.ReactNode;
  deniedMessage?: string;
  children: React.ReactNode;
}

export const AllPermissionGate: React.FC<AllPermissionGateProps> = ({
  permissions,
  context,
  mode = 'hide',
  fallback,
  deniedMessage,
  children
}) => {
  const { hasAllPermissions, loading } = useComponentPermissions();

  if (loading) {
    return <div className="animate-pulse bg-gray-200 rounded h-8 w-24"></div>;
  }

  const hasAccess = hasAllPermissions(permissions, context);

  if (!hasAccess && mode === 'hide') {
    return <>{fallback || null}</>;
  }

  if (!hasAccess && (mode === 'disable' || mode === 'show-tooltip')) {
    const childElement = React.Children.only(children) as React.ReactElement;
    
    const disabledElement = React.cloneElement(childElement, {
      disabled: true,
      className: `${childElement.props.className || ''} opacity-50 cursor-not-allowed`.trim(),
      onClick: undefined,
      'aria-disabled': true
    });

    if (mode === 'show-tooltip') {
      const message = deniedMessage || `You need all of these permissions: ${permissions.join(', ')}`;
      return (
        <Tooltip content={message}>
          {disabledElement}
        </Tooltip>
      );
    }

    return disabledElement;
  }

  return <>{children}</>;
};

export default PermissionGate;