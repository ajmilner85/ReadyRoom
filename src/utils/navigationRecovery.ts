// Last resort navigation recovery mechanism
class NavigationRecovery {
  private activeOperations = new Set<string>();
  private operationStartTimes = new Map<string, number>();
  private recoveryAttempts = 0;
  private readonly MAX_RECOVERY_ATTEMPTS = 2;
  private readonly HUNG_OPERATION_THRESHOLD = 30000; // 30 seconds

  startOperation(operationName: string) {
    console.log(`🎯 [NAV-RECOVERY] Tracking operation: ${operationName}`);
    this.activeOperations.add(operationName);
    this.operationStartTimes.set(operationName, Date.now());
    
    // Set up hung operation detection
    setTimeout(() => {
      this.checkForHungOperation(operationName);
    }, this.HUNG_OPERATION_THRESHOLD);
  }

  completeOperation(operationName: string) {
    console.log(`✅ [NAV-RECOVERY] Completed operation: ${operationName}`);
    this.activeOperations.delete(operationName);
    this.operationStartTimes.delete(operationName);
    
    // Reset recovery attempts on successful operation
    if (this.activeOperations.size === 0 && this.recoveryAttempts > 0) {
      console.log(`🔄 [NAV-RECOVERY] All operations completed, resetting recovery attempts`);
      this.recoveryAttempts = 0;
    }
  }

  private checkForHungOperation(operationName: string) {
    if (!this.activeOperations.has(operationName)) {
      return; // Operation already completed
    }

    const startTime = this.operationStartTimes.get(operationName);
    if (!startTime) return;

    const elapsedTime = Date.now() - startTime;
    if (elapsedTime >= this.HUNG_OPERATION_THRESHOLD) {
      console.error(`🚨 [NAV-RECOVERY] Operation ${operationName} hung for ${elapsedTime}ms - attempting recovery`);
      this.attemptRecovery(operationName);
    }
  }

  private async attemptRecovery(operationName: string) {
    this.recoveryAttempts++;
    
    if (this.recoveryAttempts > this.MAX_RECOVERY_ATTEMPTS) {
      console.error(`💀 [NAV-RECOVERY] Max recovery attempts reached. Suggesting page refresh.`);
      this.suggestPageRefresh();
      return;
    }

    try {
      console.warn(`🔧 [NAV-RECOVERY] Attempting recovery ${this.recoveryAttempts}/${this.MAX_RECOVERY_ATTEMPTS} for ${operationName}`);
      
      // Clear the hung operation
      this.activeOperations.delete(operationName);
      this.operationStartTimes.delete(operationName);
      
      // Emit a custom event that components can listen to for recovery
      window.dispatchEvent(new CustomEvent('navigation-recovery', {
        detail: { operationName, attempt: this.recoveryAttempts }
      }));
      
    } catch (error) {
      console.error(`❌ [NAV-RECOVERY] Recovery attempt failed:`, error);
    }
  }

  private suggestPageRefresh() {
    // Show a user-friendly notification suggesting page refresh
    console.error(`🔄 [NAV-RECOVERY] Navigation appears stuck. Consider refreshing the page if navigation is not working.`);
    
    // Emit event for UI to show refresh suggestion
    window.dispatchEvent(new CustomEvent('navigation-stuck', {
      detail: { 
        message: 'Navigation appears to be stuck. Please refresh the page if you cannot navigate to other pages.',
        recoveryAttempts: this.recoveryAttempts
      }
    }));
  }

  getStatus() {
    return {
      activeOperations: Array.from(this.activeOperations),
      recoveryAttempts: this.recoveryAttempts,
      operationTimes: Array.from(this.operationStartTimes.entries()).map(([op, time]) => ({
        operation: op,
        elapsed: Date.now() - time
      }))
    };
  }

  // Force clear all operations (for emergency reset)
  clearAll() {
    console.warn(`🧹 [NAV-RECOVERY] Force clearing all tracked operations`);
    this.activeOperations.clear();
    this.operationStartTimes.clear();
  }
}

export const navigationRecovery = new NavigationRecovery();

// Enhanced wrapper that includes navigation recovery tracking
export async function withNavigationRecovery<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  navigationRecovery.startOperation(operationName);
  
  try {
    const result = await operation();
    navigationRecovery.completeOperation(operationName);
    return result;
  } catch (error: any) {
    navigationRecovery.completeOperation(operationName);
    throw error;
  }
}