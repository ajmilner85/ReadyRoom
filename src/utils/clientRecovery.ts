import { supabase } from './supabaseClient';

class ClientRecovery {
  private failureCount = 0;
  private lastReset = Date.now();
  private readonly MAX_FAILURES = 3;
  private readonly RESET_COOLDOWN = 30000; // 30 seconds

  recordFailure(operationName: string, error: any) {
    this.failureCount++;
    console.warn(`🔥 [CLIENT-RECOVERY] Operation ${operationName} failed (${this.failureCount}/${this.MAX_FAILURES} failures):`, error);
    
    if (this.shouldResetClient()) {
      this.resetClient();
    }
  }

  recordSuccess() {
    // Reset failure count on successful operation
    if (this.failureCount > 0) {
      console.log(`✨ [CLIENT-RECOVERY] Operation succeeded, resetting failure count (was ${this.failureCount})`);
      this.failureCount = 0;
    }
  }

  private shouldResetClient(): boolean {
    const timeSinceLastReset = Date.now() - this.lastReset;
    return (
      this.failureCount >= this.MAX_FAILURES &&
      timeSinceLastReset > this.RESET_COOLDOWN
    );
  }

  private async resetClient() {
    try {
      console.warn(`🔄 [CLIENT-RECOVERY] Too many failures (${this.failureCount}), attempting client recovery...`);
      
      // Force refresh the session to get a fresh auth state
      await supabase.auth.refreshSession();
      
      // Reset counters
      this.failureCount = 0;
      this.lastReset = Date.now();
      
      console.log(`✅ [CLIENT-RECOVERY] Client recovery completed`);
    } catch (error) {
      console.error(`❌ [CLIENT-RECOVERY] Client recovery failed:`, error);
      // Don't reset counters if recovery failed - we'll try again
    }
  }

  getStatus() {
    return {
      failureCount: this.failureCount,
      lastReset: this.lastReset,
      timeSinceLastReset: Date.now() - this.lastReset
    };
  }
}

// Singleton instance
export const clientRecovery = new ClientRecovery();

// Enhanced wrapper that includes client recovery
export async function withClientRecovery<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  try {
    const result = await operation();
    clientRecovery.recordSuccess();
    return result;
  } catch (error: any) {
    clientRecovery.recordFailure(operationName, error);
    throw error;
  }
}