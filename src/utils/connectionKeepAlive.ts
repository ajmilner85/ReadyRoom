import { supabase } from './supabaseClient';

class ConnectionKeepAlive {
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private isActive = false;
  private readonly KEEP_ALIVE_INTERVAL = 45 * 1000; // 45 seconds - more aggressive
  private consecutiveFailures = 0;
  private readonly MAX_CONSECUTIVE_FAILURES = 3;

  start() {
    if (this.isActive) {
      // console.log('🔄 [KEEP-ALIVE] Already running');
      return;
    }

    // console.log('🚀 [KEEP-ALIVE] Starting connection keep-alive mechanism');
    this.isActive = true;

    // Set up periodic heartbeat
    this.keepAliveInterval = setInterval(() => {
      this.performHeartbeat();
    }, this.KEEP_ALIVE_INTERVAL);

    // Initial heartbeat
    this.performHeartbeat();

    // Set up auth state monitoring
    supabase.auth.onAuthStateChange((event, _session) => {
      // console.log(`🔐 [KEEP-ALIVE] Auth state changed: ${event}`, {
      //   hasSession: !!session,
      //   expiresAt: session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : 'none'
      // });

      if (event === 'TOKEN_REFRESHED') {
        // console.log('🔄 [KEEP-ALIVE] Token refreshed successfully');
      } else if (event === 'SIGNED_OUT') {
        // console.log('🔐 [KEEP-ALIVE] User signed out, stopping keep-alive');
        this.stop();
      }
    });
  }

  stop() {
    if (!this.isActive) {
      return;
    }

    // console.log('🛑 [KEEP-ALIVE] Stopping connection keep-alive');
    this.isActive = false;

    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  private async performHeartbeat() {
    try {
      console.log('💓 [KEEP-ALIVE] Performing heartbeat...');
      const startTime = performance.now();

      // Add timeout to heartbeat query
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Heartbeat timeout')), 10000); // 10 second timeout
      });

      const queryPromise = supabase
        .from('carriers')
        .select('id')
        .limit(1);

      const { error } = await Promise.race([queryPromise, timeoutPromise]) as any;

      const endTime = performance.now();
      const responseTime = (endTime - startTime).toFixed(2);

      if (error) {
        this.consecutiveFailures++;
        console.warn(`⚠️ [KEEP-ALIVE] Heartbeat query failed (${responseTime}ms, ${this.consecutiveFailures} consecutive failures):`, error);
        
        if (this.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
          console.error(`🚨 [KEEP-ALIVE] Too many consecutive failures (${this.consecutiveFailures}), attempting recovery`);
          await this.attemptSessionRefresh();
        }
      } else {
        if (this.consecutiveFailures > 0) {
          console.log(`✅ [KEEP-ALIVE] Heartbeat recovered after ${this.consecutiveFailures} failures (${responseTime}ms)`);
        } else {
          console.log(`✅ [KEEP-ALIVE] Heartbeat successful (${responseTime}ms)`);
        }
        this.consecutiveFailures = 0;
      }
    } catch (error: any) {
      this.consecutiveFailures++;
      const isTimeout = error.message === 'Heartbeat timeout';
      console.error(`💥 [KEEP-ALIVE] Heartbeat ${isTimeout ? 'timed out' : 'exception'} (${this.consecutiveFailures} consecutive failures):`, error);
      
      if (this.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
        console.error(`🚨 [KEEP-ALIVE] Too many consecutive failures, attempting recovery`);
        await this.attemptSessionRefresh();
      }
    }
  }

  private async attemptSessionRefresh() {
    try {
      console.log('🔄 [KEEP-ALIVE] Attempting session refresh...');
      
      // Add timeout to session refresh
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Session refresh timeout')), 10000);
      });

      const refreshPromise = supabase.auth.refreshSession();
      const { error } = await Promise.race([refreshPromise, timeoutPromise]) as any;
      
      if (error) {
        console.error('❌ [KEEP-ALIVE] Session refresh failed:', error);
      } else {
        console.log('✅ [KEEP-ALIVE] Session refreshed successfully, resetting failure count');
        this.consecutiveFailures = 0; // Reset failures on successful refresh
      }
    } catch (error: any) {
      const isTimeout = error.message === 'Session refresh timeout';
      console.error(`💥 [KEEP-ALIVE] Session refresh ${isTimeout ? 'timed out' : 'exception'}:`, error);
    }
  }

  isRunning() {
    return this.isActive;
  }

  // Temporarily pause keep-alive during critical operations
  pause() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
    console.log('🔇 [KEEP-ALIVE] Temporarily paused');
  }

  // Resume keep-alive after critical operations
  resume() {
    if (this.isActive && !this.keepAliveInterval) {
      this.keepAliveInterval = setInterval(() => {
        this.performHeartbeat();
      }, this.KEEP_ALIVE_INTERVAL);
      console.log('🔊 [KEEP-ALIVE] Resumed');
    }
  }
}

// Export singleton instance
export const connectionKeepAlive = new ConnectionKeepAlive();

// Auto-start when user is authenticated
export const initializeKeepAlive = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      // console.log('🔐 [KEEP-ALIVE] User session detected, starting keep-alive');
      connectionKeepAlive.start();
    } else {
      // console.log('🔐 [KEEP-ALIVE] No session found, keep-alive will start after login');
    }
  } catch (error) {
    // console.error('❌ [KEEP-ALIVE] Failed to check initial session:', error);
  }
};