// Permission middleware for API protection
// This module provides middleware functions to protect API endpoints with the new permission system

import type { Request, Response, NextFunction } from 'express';
import { permissionService } from './permissionService';
import type { PermissionCheckContext } from '../types/PermissionTypes';

// Extend Express Request to include user information
interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    authUserId: string;
    [key: string]: any;
  };
}

// Permission error response interface
interface PermissionErrorResponse {
  error: string;
  code: 'INSUFFICIENT_PERMISSIONS' | 'INVALID_SCOPE' | 'PERMISSION_NOT_FOUND';
  required: string;
  context?: PermissionCheckContext;
  message: string;
}

/**
 * Middleware factory to require a specific permission for an endpoint
 * 
 * @param permission - The permission name required to access the endpoint
 * @param getContext - Optional function to extract permission context from request
 * @returns Express middleware function
 * 
 * @example
 * // Protect roster management endpoint
 * app.get('/api/pilots', requirePermission('manage_roster'), getPilots);
 * 
 * // Protect squadron-specific endpoint with context
 * app.put('/api/squadrons/:id/settings', 
 *   requirePermission('manage_squadron_settings', req => ({ squadronId: req.params.id })),
 *   updateSquadronSettings
 * );
 */
export function requirePermission(
  permission: string, 
  getContext?: (req: AuthenticatedRequest) => PermissionCheckContext
) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // Check if user is authenticated
      if (!req.user?.authUserId) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'UNAUTHENTICATED',
          message: 'You must be logged in to access this endpoint'
        });
      }
      
      // Extract context if provided
      const context = getContext ? getContext(req) : undefined;
      
      // Check permission
      const hasAccess = await permissionService.hasPermission(
        req.user.authUserId, 
        permission, 
        context
      );
      
      if (!hasAccess) {
        const errorResponse: PermissionErrorResponse = {
          error: 'Insufficient permissions',
          code: 'INSUFFICIENT_PERMISSIONS',
          required: permission,
          context,
          message: `You don't have the '${permission}' permission${context ? ` for the specified scope` : ''}`
        };
        
        return res.status(403).json(errorResponse);
      }
      
      // Permission granted, proceed to next middleware
      next();
      
    } catch (error) {
      console.error('Permission middleware error:', error);
      
      return res.status(500).json({
        error: 'Permission check failed',
        code: 'PERMISSION_CHECK_ERROR',
        message: 'An error occurred while checking permissions'
      });
    }
  };
}

/**
 * Middleware to require one of multiple permissions (OR logic)
 * 
 * @param permissions - Array of permission names, user needs at least one
 * @param getContext - Optional function to extract permission context from request
 * @returns Express middleware function
 * 
 * @example
 * // Allow either roster management or squadron settings access
 * app.get('/api/pilots/:id', 
 *   requireAnyPermission(['manage_roster', 'manage_squadron_settings']),
 *   getPilotDetails
 * );
 */
export function requireAnyPermission(
  permissions: string[],
  getContext?: (req: AuthenticatedRequest) => PermissionCheckContext
) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.authUserId) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'UNAUTHENTICATED',
          message: 'You must be logged in to access this endpoint'
        });
      }
      
      const context = getContext ? getContext(req) : undefined;
      
      // Check if user has any of the required permissions
      const hasAnyAccess = await Promise.all(
        permissions.map(permission => 
          permissionService.hasPermission(req.user.authUserId, permission, context)
        )
      );
      
      if (!hasAnyAccess.some(hasAccess => hasAccess)) {
        const errorResponse: PermissionErrorResponse = {
          error: 'Insufficient permissions',
          code: 'INSUFFICIENT_PERMISSIONS',
          required: permissions.join(' OR '),
          context,
          message: `You need one of the following permissions: ${permissions.join(', ')}`
        };
        
        return res.status(403).json(errorResponse);
      }
      
      next();
      
    } catch (error) {
      console.error('Permission middleware error:', error);
      return res.status(500).json({
        error: 'Permission check failed',
        code: 'PERMISSION_CHECK_ERROR',
        message: 'An error occurred while checking permissions'
      });
    }
  };
}

/**
 * Middleware to require all of multiple permissions (AND logic)
 * 
 * @param permissions - Array of permission names, user needs all of them
 * @param getContext - Optional function to extract permission context from request
 * @returns Express middleware function
 * 
 * @example
 * // Require both roster management and admin tools access
 * app.delete('/api/pilots/:id', 
 *   requireAllPermissions(['manage_roster', 'access_admin_tools']),
 *   deletePilot
 * );
 */
export function requireAllPermissions(
  permissions: string[],
  getContext?: (req: AuthenticatedRequest) => PermissionCheckContext
) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.authUserId) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'UNAUTHENTICATED',
          message: 'You must be logged in to access this endpoint'
        });
      }
      
      const context = getContext ? getContext(req) : undefined;
      
      // Check if user has all required permissions
      const hasAllAccess = await Promise.all(
        permissions.map(permission => 
          permissionService.hasPermission(req.user.authUserId, permission, context)
        )
      );
      
      if (!hasAllAccess.every(hasAccess => hasAccess)) {
        const missingPermissions = permissions.filter((_, index) => !hasAllAccess[index]);
        
        const errorResponse: PermissionErrorResponse = {
          error: 'Insufficient permissions',
          code: 'INSUFFICIENT_PERMISSIONS',
          required: permissions.join(' AND '),
          context,
          message: `You are missing the following permissions: ${missingPermissions.join(', ')}`
        };
        
        return res.status(403).json(errorResponse);
      }
      
      next();
      
    } catch (error) {
      console.error('Permission middleware error:', error);
      return res.status(500).json({
        error: 'Permission check failed',
        code: 'PERMISSION_CHECK_ERROR',
        message: 'An error occurred while checking permissions'
      });
    }
  };
}

/**
 * Middleware to check permission and attach result to request for use in handler
 * Does not block the request, just provides permission information
 * 
 * @param permission - The permission name to check
 * @param getContext - Optional function to extract permission context from request
 * @returns Express middleware function that adds permissionCheck to request
 * 
 * @example
 * app.get('/api/pilots', 
 *   checkPermission('manage_roster'),
 *   (req, res) => {
 *     const canEdit = req.permissionCheck?.hasPermission;
 *     // Return different data based on permission
 *   }
 * );
 */
export function checkPermission(
  permission: string,
  getContext?: (req: AuthenticatedRequest) => PermissionCheckContext
) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.authUserId) {
        (req as any).permissionCheck = {
          hasPermission: false,
          reason: 'User not authenticated'
        };
        return next();
      }
      
      const context = getContext ? getContext(req) : undefined;
      
      const checkResult = await permissionService.checkPermission(
        req.user.authUserId, 
        permission, 
        context
      );
      
      (req as any).permissionCheck = checkResult;
      next();
      
    } catch (error) {
      console.error('Permission check middleware error:', error);
      (req as any).permissionCheck = {
        hasPermission: false,
        reason: 'Permission check failed'
      };
      next();
    }
  };
}

/**
 * Helper function to create squadron context extractor for common endpoints
 * 
 * @param paramName - Name of the URL parameter containing squadron ID (default: 'squadronId')
 * @returns Context extractor function
 * 
 * @example
 * app.put('/api/squadrons/:squadronId/pilots', 
 *   requirePermission('manage_roster', squadronContext()),
 *   updateSquadronPilots
 * );
 */
export function squadronContext(paramName: string = 'squadronId') {
  return (req: AuthenticatedRequest): PermissionCheckContext => ({
    squadronId: req.params[paramName]
  });
}

/**
 * Helper function to create wing context extractor
 * 
 * @param paramName - Name of the URL parameter containing wing ID (default: 'wingId')
 * @returns Context extractor function
 */
export function wingContext(paramName: string = 'wingId') {
  return (req: AuthenticatedRequest): PermissionCheckContext => ({
    wingId: req.params[paramName]
  });
}

/**
 * Helper function to create user context extractor (for self-context permissions)
 * 
 * @param paramName - Name of the URL parameter containing user ID (default: 'userId')
 * @returns Context extractor function
 * 
 * @example
 * app.put('/api/users/:userId/profile', 
 *   requirePermission('edit_user_profile', userContext()),
 *   updateUserProfile
 * );
 */
export function userContext(paramName: string = 'userId') {
  return (req: AuthenticatedRequest): PermissionCheckContext => ({
    userId: req.params[paramName]
  });
}

/**
 * Legacy permission middleware adapter for gradual migration
 * Maps legacy permission names to new permission names
 * 
 * @deprecated Use requirePermission with new permission names instead
 */
export function requireLegacyPermission(legacyPermission: string) {
  // Map legacy permissions to new permissions
  const permissionMapping: Record<string, string> = {
    'canManageRoster': 'manage_roster',
    'canManageEvents': 'manage_events',
    'canManageFlights': 'access_flights',
    'canAccessSettings': 'access_settings',
    'canEditSquadrons': 'manage_squadron_settings',
    'canViewAdminTools': 'access_admin_tools'
  };
  
  const newPermission = permissionMapping[legacyPermission] || legacyPermission;
  
  return requirePermission(newPermission);
}

// Type definitions for extended request objects
declare global {
  namespace Express {
    interface Request {
      permissionCheck?: {
        hasPermission: boolean;
        matchingScopes?: any[];
        reason?: string;
      };
    }
  }
}

// Export types for use in other files
export type { AuthenticatedRequest, PermissionErrorResponse };