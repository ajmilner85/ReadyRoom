import { PostgrestError } from '@supabase/supabase-js';
import { withConnectionReset } from './connectionPoolReset';

// Simple retry for basic auth errors only
const isAuthError = (error: PostgrestError | Error): boolean => {
  if ('code' in error) {
    const authCodes = ['PGRST301', 'PGRST302', '401'];
    return authCodes.includes(error.code);
  }
  if (error.message) {
    const message = error.message.toLowerCase();
    return message.includes('jwt expired') || message.includes('jwt invalid');
  }
  return false;
};

export async function withRetry<T>(
  operation: () => Promise<{ data: T | null; error: PostgrestError | null }>,
  operationName: string = 'Database operation'
): Promise<{ data: T | null; error: PostgrestError | null }> {
  
  // Use connection reset wrapper to handle timeout/poisoning issues
  return await withConnectionReset(operation, operationName);
}

export async function withRetryAuth<T>(
  operation: () => Promise<{ data: T | null; error: any }>
): Promise<{ data: T | null; error: any }> {
  // Simple retry for auth errors only - if JWT expired, try once more
  try {
    const result = await operation();
    
    if (result.error && isAuthError(result.error)) {
      console.warn(`🔐 [AUTH-RETRY] Auth error detected, retrying once:`, result.error);
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
      return await operation();
    }
    
    return result;
  } catch (error: any) {
    if (isAuthError(error)) {
      console.warn(`🔐 [AUTH-RETRY] Auth exception, retrying once:`, error);
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        return await operation();
      } catch (retryError: any) {
        return { data: null, error: retryError };
      }
    }
    
    return { data: null, error };
  }
}