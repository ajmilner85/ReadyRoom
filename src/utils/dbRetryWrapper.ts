import { PostgrestError } from '@supabase/supabase-js';
import { withClientRecovery } from './clientRecovery';
import { withNavigationRecovery } from './navigationRecovery';

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 5000,
  backoffFactor: 2
};

const isRetryableError = (error: PostgrestError | Error): boolean => {
  // console.log(`🔍 [DB-RETRY] Analyzing error for retry eligibility:`, error);
  
  if ('code' in error) {
    // PostgreSQL connection errors that should be retried
    const retryableCodes = [
      '08000', // connection_exception
      '08003', // connection_does_not_exist
      '08006', // connection_failure
      '57P01', // admin_shutdown
      '57P02', // crash_shutdown
      '57P03', // cannot_connect_now
      'PGRST301', // JWT expired
      'PGRST302', // JWT invalid
      '401',    // Unauthorized (token expired)
      '503',    // Service unavailable
      '502',    // Bad gateway
      '504',    // Gateway timeout
    ];
    const isRetryable = retryableCodes.includes(error.code);
    // console.log(`🔍 [DB-RETRY] Error code '${error.code}' is ${isRetryable ? 'retryable' : 'not retryable'}`);
    return isRetryable;
  }
  
  if (error.message) {
    const retryableMessages = [
      'connection',
      'timeout',
      'network',
      'jwt expired',
      'jwt invalid',
      'failed to fetch',
      'load failed',
      'networkerror',
      'fetch failed',
      'request failed',
      'aborted',
      'offline',
      'no network',
      'connection refused',
      'connection reset',
      'connection aborted',
      'socket hang up'
    ];
    const message = error.message.toLowerCase();
    const isRetryable = retryableMessages.some(msg => message.includes(msg));
    // console.log(`🔍 [DB-RETRY] Error message '${error.message}' is ${isRetryable ? 'retryable' : 'not retryable'}`);
    return isRetryable;
  }
  
  // Check for network errors by error name/type
  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    // console.log(`🔍 [DB-RETRY] Network TypeError detected - retryable`);
    return true;
  }
  
  // console.log(`🔍 [DB-RETRY] Unknown error type - not retryable`);
  return false;
};

const delay = (ms: number): Promise<void> => 
  new Promise(resolve => setTimeout(resolve, ms));

// Track pending operations to prevent duplicates and detect hangs
const pendingOperations = new Map<string, Promise<any>>();

// Hard timeout wrapper to prevent hung requests
const withTimeout = <T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation ${operationName} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    })
  ]);
};

export async function withRetry<T>(
  operation: () => Promise<{ data: T | null; error: PostgrestError | null }>,
  config: Partial<RetryConfig> = {},
  operationName: string = 'Database operation'
): Promise<{ data: T | null; error: PostgrestError | null }> {
  const { maxRetries, baseDelay, maxDelay, backoffFactor } = {
    ...DEFAULT_RETRY_CONFIG,
    ...config
  };

  // Check for duplicate pending operations
  if (pendingOperations.has(operationName)) {
    console.warn(`⚠️ [DB-RETRY] ${operationName} already in progress, waiting for existing operation`);
    try {
      return await pendingOperations.get(operationName)!;
    } catch (error: any) {
      // If existing operation failed, continue with new attempt
      pendingOperations.delete(operationName);
    }
  }

  console.log(`🔄 [DB-RETRY] Starting ${operationName} with retry wrapper`);
  let lastError: PostgrestError | null = null;
  
  const executeOperation = async (): Promise<{ data: T | null; error: PostgrestError | null }> => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 [DB-RETRY] ${operationName} - Attempt ${attempt + 1}/${maxRetries + 1}`);
        const startTime = performance.now();
        
        // Add aggressive timeout (15 seconds per attempt) and client recovery
        const result = await withTimeout(
          withClientRecovery(operation, `${operationName} attempt ${attempt + 1}`),
          15000,
          `${operationName} attempt ${attempt + 1}`
        );
        
        const endTime = performance.now();
        console.log(`⏱️ [DB-RETRY] ${operationName} completed in ${(endTime - startTime).toFixed(2)}ms`);
        
        if (result.error && isRetryableError(result.error) && attempt < maxRetries) {
          lastError = result.error;
          const delayMs = Math.min(baseDelay * Math.pow(backoffFactor, attempt), maxDelay);
          console.warn(`⚠️ [DB-RETRY] ${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delayMs}ms:`, result.error);
          await delay(delayMs);
          continue;
        }
        
        if (result.error) {
          console.error(`❌ [DB-RETRY] ${operationName} failed with non-retryable error:`, result.error);
        } else {
          console.log(`✅ [DB-RETRY] ${operationName} succeeded`);
        }
        
        return result;
      } catch (error: any) {
        const isTimeout = error.message.includes('timed out');
        console.error(`💥 [DB-RETRY] ${operationName} ${isTimeout ? 'timed out' : 'threw exception'} on attempt ${attempt + 1}:`, error);
        
        if ((isRetryableError(error) || isTimeout) && attempt < maxRetries) {
          lastError = error;
          const delayMs = Math.min(baseDelay * Math.pow(backoffFactor, attempt), maxDelay);
          console.warn(`🔄 [DB-RETRY] ${operationName} ${isTimeout ? 'timeout' : 'exception'} is retryable, retrying in ${delayMs}ms`);
          await delay(delayMs);
          continue;
        }
        
        console.error(`❌ [DB-RETRY] ${operationName} failed permanently:`, error);
        return { data: null, error: error };
      }
    }
    
    console.error(`❌ [DB-RETRY] ${operationName} exhausted all retries`);
    return { data: null, error: lastError };
  };

  // Store and execute the operation with full recovery tracking
  const operationPromise = withNavigationRecovery(executeOperation, operationName);
  pendingOperations.set(operationName, operationPromise);
  
  try {
    const result = await operationPromise;
    return result;
  } finally {
    pendingOperations.delete(operationName);
  }
}

export async function withRetryAuth<T>(
  operation: () => Promise<{ data: T | null; error: any }>,
  config: Partial<RetryConfig> = {}
): Promise<{ data: T | null; error: any }> {
  const { maxRetries, baseDelay, maxDelay, backoffFactor } = {
    ...DEFAULT_RETRY_CONFIG,
    ...config
  };

  let lastError: any = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      
      if (result.error && isRetryableError(result.error) && attempt < maxRetries) {
        lastError = result.error;
        const delayMs = Math.min(baseDelay * Math.pow(backoffFactor, attempt), maxDelay);
        console.warn(`Auth operation failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delayMs}ms:`, result.error);
        await delay(delayMs);
        continue;
      }
      
      return result;
    } catch (error: any) {
      if (isRetryableError(error) && attempt < maxRetries) {
        lastError = error;
        const delayMs = Math.min(baseDelay * Math.pow(backoffFactor, attempt), maxDelay);
        console.warn(`Auth operation failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delayMs}ms:`, error);
        await delay(delayMs);
        continue;
      }
      
      return { data: null, error };
    }
  }
  
  return { data: null, error: lastError };
}