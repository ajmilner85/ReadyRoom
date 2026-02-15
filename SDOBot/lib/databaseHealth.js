/**
 * DATABASE HEALTH MODULE
 * Provides health check and error classification utilities for database resilience.
 * Implements circuit breaker pattern to prevent cascade failures during outages.
 */

// Error patterns that indicate connectivity/network issues
const CONNECTIVITY_PATTERNS = [
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ECONNRESET',
  'socket hang up',
  'network error',
  'connection refused',
  'timeout',
  'Unable to connect',
  'fetch failed',
  'FetchError',
  'network request failed',
  'EPROTO',
  'EPIPE'
];

/**
 * Classifies whether an error is a connectivity/network error vs a query/logic error.
 * Connectivity errors indicate the database is unreachable and updates should be aborted.
 * @param {Error|string|object} error - The error to classify
 * @returns {boolean} - true if this is a connectivity error
 */
function isConnectivityError(error) {
  if (!error) return false;

  const errorString = String(error?.message || error?.code || error).toLowerCase();
  return CONNECTIVITY_PATTERNS.some(pattern =>
    errorString.includes(pattern.toLowerCase())
  );
}

// Circuit breaker state
let consecutiveFailures = 0;
let lastFailureTime = null;
const FAILURE_THRESHOLD = 3;
const RECOVERY_WINDOW_MS = 60000; // 1 minute

/**
 * Check if the circuit breaker is open (too many recent failures).
 * When open, database operations should be skipped to prevent cascade failures.
 * @returns {boolean} - true if circuit is open (should skip operations)
 */
function isCircuitOpen() {
  if (consecutiveFailures >= FAILURE_THRESHOLD) {
    const timeSinceLastFailure = Date.now() - lastFailureTime;
    if (timeSinceLastFailure < RECOVERY_WINDOW_MS) {
      return true;
    }
    // Allow a probe attempt after recovery window
    consecutiveFailures = Math.max(0, consecutiveFailures - 1);
  }
  return false;
}

/**
 * Record a database failure for circuit breaker tracking.
 * Logs alert when circuit breaker opens.
 */
function recordFailure() {
  consecutiveFailures++;
  lastFailureTime = Date.now();

  if (consecutiveFailures === FAILURE_THRESHOLD) {
    console.error('[ALERT] Database circuit breaker OPEN - Discord updates will be paused to preserve message state');
  } else if (consecutiveFailures > FAILURE_THRESHOLD) {
    console.warn(`[CIRCUIT-BREAKER] Consecutive failures: ${consecutiveFailures}`);
  }
}

/**
 * Reset the circuit breaker after successful operation.
 */
function resetFailures() {
  if (consecutiveFailures > 0) {
    console.log('[CIRCUIT-BREAKER] Database connection restored - circuit breaker reset');
  }
  consecutiveFailures = 0;
  lastFailureTime = null;
}

/**
 * Get the current circuit breaker state for monitoring.
 * @returns {object} - Circuit breaker state
 */
function getCircuitState() {
  return {
    consecutiveFailures,
    lastFailureTime,
    isOpen: isCircuitOpen(),
    failureThreshold: FAILURE_THRESHOLD,
    recoveryWindowMs: RECOVERY_WINDOW_MS
  };
}

/**
 * Execute a database operation with retry logic and exponential backoff.
 * Only retries connectivity errors; query errors fail immediately.
 * Updates circuit breaker state based on outcome.
 *
 * @param {Function} operation - Async function to execute
 * @param {object} options - Retry options
 * @param {number} options.maxRetries - Maximum retry attempts (default: 3)
 * @param {number} options.baseDelayMs - Base delay between retries (default: 1000ms)
 * @param {number} options.maxDelayMs - Maximum delay cap (default: 30000ms)
 * @param {string} options.operationName - Name for logging (default: 'database operation')
 * @returns {Promise<{success: boolean, result?: any, error?: any}>}
 */
async function withRetry(operation, options = {}) {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    operationName = 'database operation'
  } = options;

  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      resetFailures(); // Success - reset circuit breaker
      return { success: true, result };
    } catch (error) {
      lastError = error;

      // Don't retry non-connectivity errors (query syntax, permissions, etc.)
      if (!isConnectivityError(error)) {
        console.error(`[RETRY] ${operationName} failed with non-retryable error:`, error.message || error);
        return { success: false, error };
      }

      if (attempt < maxRetries) {
        // Exponential backoff with jitter
        const jitter = Math.random() * 1000;
        const delay = Math.min(
          baseDelayMs * Math.pow(2, attempt - 1) + jitter,
          maxDelayMs
        );
        console.warn(`[RETRY] ${operationName} attempt ${attempt} failed (connectivity error), retrying in ${Math.round(delay)}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  console.error(`[RETRY] ${operationName} failed after ${maxRetries} attempts`);
  recordFailure(); // Record failure for circuit breaker
  return { success: false, error: lastError };
}

/**
 * Quick health check - attempts a minimal database query.
 * @param {object} supabase - Supabase client
 * @returns {Promise<{healthy: boolean, error?: any, isConnectivityError?: boolean}>}
 */
async function checkDatabaseHealth(supabase) {
  try {
    const { error } = await supabase
      .from('events')
      .select('id')
      .limit(1);

    if (error) {
      recordFailure();
      return {
        healthy: false,
        error,
        isConnectivityError: isConnectivityError(error)
      };
    }

    resetFailures();
    return { healthy: true };
  } catch (error) {
    recordFailure();
    return {
      healthy: false,
      error,
      isConnectivityError: true
    };
  }
}

module.exports = {
  isConnectivityError,
  isCircuitOpen,
  recordFailure,
  resetFailures,
  getCircuitState,
  withRetry,
  checkDatabaseHealth
};
