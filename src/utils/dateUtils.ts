/**
 * Date Utility Functions
 * Handles timezone-aware date conversions for the application
 */

/**
 * Convert a date string from an HTML date input (YYYY-MM-DD) to a Date object
 * at midnight in the LOCAL timezone (not UTC).
 * 
 * This prevents the common issue where selecting "October 8" in a date picker
 * results in "October 7" in the database when timezone conversion happens.
 * 
 * @param dateString - Date string in YYYY-MM-DD format from date input
 * @returns Date object at midnight in local timezone
 * 
 * @example
 * // User in EST (UTC-5) selects "2025-10-08"
 * const date = dateInputToLocalDate("2025-10-08");
 * // Returns: Date object for 2025-10-08T00:00:00 in local time
 * // When converted to ISO: "2025-10-08T05:00:00.000Z" (midnight EST = 5am UTC)
 */
export function dateInputToLocalDate(dateString: string): Date {
  if (!dateString) {
    return new Date();
  }

  // Split the date string
  const [year, month, day] = dateString.split('-').map(Number);
  
  // Create date in LOCAL timezone (month is 0-indexed)
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

/**
 * Convert a Date object to a date string for HTML date inputs (YYYY-MM-DD)
 * using the LOCAL timezone.
 * 
 * @param date - Date object to convert
 * @returns Date string in YYYY-MM-DD format
 * 
 * @example
 * const dateStr = dateToLocalDateString(new Date());
 * // Returns: "2025-10-08" (based on local date)
 */
export function dateToLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Get today's date as a string suitable for HTML date inputs (YYYY-MM-DD)
 * in the LOCAL timezone.
 * 
 * @returns Today's date in YYYY-MM-DD format
 */
export function getTodayLocalDateString(): string {
  return dateToLocalDateString(new Date());
}

/**
 * Convert a UTC timestamp string to a local date string (YYYY-MM-DD)
 * 
 * @param utcTimestamp - ISO timestamp string (e.g., from Supabase)
 * @returns Date string in YYYY-MM-DD format in local timezone
 */
export function utcTimestampToLocalDateString(utcTimestamp: string | null): string {
  if (!utcTimestamp) {
    return '';
  }
  
  const date = new Date(utcTimestamp);
  return dateToLocalDateString(date);
}

/**
 * Format a date for display in a human-readable format
 * 
 * @param date - Date to format
 * @param options - Intl.DateTimeFormat options
 * @returns Formatted date string
 */
export function formatDateForDisplay(
  date: Date | string | null, 
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }
): string {
  if (!date) {
    return '-';
  }
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleDateString('en-US', options);
}
