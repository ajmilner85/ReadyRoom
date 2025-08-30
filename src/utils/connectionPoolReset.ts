// Connection pool reset mechanism to handle browser connection poisoning
class ConnectionPoolManager {
  private timeoutCount = 0;
  private lastSuccessTime = Date.now();
  private readonly TIMEOUT_THRESHOLD = 2; // 2 consecutive timeouts triggers reset
  private readonly STALE_CONNECTION_TIME = 5 * 60 * 1000; // 5 minutes
  private isResetting = false;

  // Track timeout to detect poisoned connection pool
  recordTimeout(operationName: string) {
    this.timeoutCount++;
    console.warn(`🔥 [POOL-RESET] Timeout #${this.timeoutCount} for ${operationName}`);
    
    if (this.shouldResetConnectionPool()) {
      this.resetConnectionPool();
    }
  }

  // Track success to reset timeout counter
  recordSuccess(operationName: string) {
    if (this.timeoutCount > 0) {
      console.log(`✅ [POOL-RESET] ${operationName} succeeded, resetting timeout counter (was ${this.timeoutCount})`);
    }
    this.timeoutCount = 0;
    this.lastSuccessTime = Date.now();
  }

  private shouldResetConnectionPool(): boolean {
    const timeSinceSuccess = Date.now() - this.lastSuccessTime;
    return (
      !this.isResetting &&
      this.timeoutCount >= this.TIMEOUT_THRESHOLD &&
      timeSinceSuccess > this.STALE_CONNECTION_TIME
    );
  }

  private async resetConnectionPool() {
    if (this.isResetting) return;
    
    this.isResetting = true;
    console.warn(`🔄 [POOL-RESET] Connection pool appears poisoned, forcing reset...`);
    
    try {
      // Method 1: Create a new iframe to force browser to create fresh connection pool
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = 'about:blank';
      document.body.appendChild(iframe);
      
      // Small delay to let browser process
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Remove iframe
      document.body.removeChild(iframe);
      
      // Method 2: Force DNS lookup refresh by making a simple request
      try {
        const response = await fetch(`${location.origin}/favicon.ico?_t=${Date.now()}`, {
          method: 'HEAD',
          cache: 'no-cache'
        });
        console.log(`📡 [POOL-RESET] DNS refresh attempt: ${response.status}`);
      } catch (e) {
        console.log(`📡 [POOL-RESET] DNS refresh failed (expected): ${e}`);
      }
      
      // Method 3: Clear any cached connections by creating new fetch context
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.update();
        }
      }
      
      console.log(`✅ [POOL-RESET] Connection pool reset completed`);
      
      // Reset counters
      this.timeoutCount = 0;
      this.lastSuccessTime = Date.now();
      
    } catch (error) {
      console.error(`❌ [POOL-RESET] Reset failed:`, error);
    } finally {
      this.isResetting = false;
    }
  }


  getStatus() {
    return {
      timeoutCount: this.timeoutCount,
      lastSuccessTime: this.lastSuccessTime,
      timeSinceSuccess: Date.now() - this.lastSuccessTime,
      isResetting: this.isResetting
    };
  }
}

export const connectionPool = new ConnectionPoolManager();

// Simple wrapper that handles connection pool issues
export async function withConnectionReset<T>(
  operation: () => Promise<T>,
  operationName: string,
  timeoutMs: number = 10000
): Promise<T> {
  
  console.log(`🌐 [POOL-RESET] Starting ${operationName}`);
  
  try {
    // Race the operation against a timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    
    const result = await Promise.race([operation(), timeoutPromise]);
    
    connectionPool.recordSuccess(operationName);
    console.log(`✅ [POOL-RESET] ${operationName} succeeded`);
    return result;
    
  } catch (error: any) {
    const isTimeout = error.message.includes('timed out');
    
    if (isTimeout) {
      connectionPool.recordTimeout(operationName);
      console.error(`⏰ [POOL-RESET] ${operationName} timed out`);
    } else {
      console.error(`❌ [POOL-RESET] ${operationName} failed:`, error);
    }
    
    throw error;
  }
}