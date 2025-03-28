// lib/utils.js

/**
 * Converts an amount in rupees to paise.
 * Razorpay requires the amount in paise (e.g., ₹9 becomes 900 paise).
 *
 * @param {number} rupees - The amount in rupees.
 * @returns {number} The amount in paise.
 */
export function rupeesToPaise(rupees) {
    return Math.round(rupees * 100);
  }
  
  /**
   * Formats a number as Indian Rupees (INR).
   *
   * @param {number} amount - The amount in rupees.
   * @returns {string} The formatted currency string.
   */
  export function formatINR(amount) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount);
  }
  
  /**
   * Formats a date into a human-readable string.
   *
   * @param {Date|string|number} date - A date object, date string, or timestamp.
   * @returns {string} The formatted date string.
   */
  export function formatDate(date) {
    const d = new Date(date);
    return d.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
  
  /**
   * Generates a random alphanumeric token of a specified length.
   * This can be used as an additional helper if needed (e.g., for creating reference IDs).
   *
   * @param {number} [length=16] - The desired length of the token.
   * @returns {string} A randomly generated token.
   */
  export function generateRandomToken(length = 16) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < length; i++) {
      token += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return token;
  }
  
  /**
   * Logs an error message with a timestamp.
   *
   * @param {Error|string} error - The error object or message.
   */
  export function logError(error) {
    console.error(`[${new Date().toISOString()}] Error:`, error);
  }