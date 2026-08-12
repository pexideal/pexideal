/**
 * Shared Application Utilities & Authentication Manager
 * File: js/app.js
 */

// Dynamically use localhost during development, and Render in production
const IS_LOCAL = window.location.hostname === 'localhost' || 
                 window.location.hostname === '127.0.0.1' || 
                 window.location.protocol === 'file:';

const CONFIG = {
  // Stripped trailing slash to prevent double slashes in API endpoints
  API_BASE_URL: IS_LOCAL 
    ? 'http://127.0.0.1:5000' 
    : 'https://pexideal.onrender.com', 
  TOKEN_KEY: 'pexideal_token',
  USER_KEY: 'pexideal_user'
};

const Auth = {
  /**
   * Get stored JWT token across primary, client, or affiliate storage keys
   * @returns {string|null}
   */
  getToken() {
    return localStorage.getItem(CONFIG.TOKEN_KEY) || 
           localStorage.getItem('pexideal_client_token') || 
           localStorage.getItem('pexideal_affiliate_token');
  },

  /**
   * Save authentication state synchronously across key namespaces
   * @param {string} token 
   * @param {Object} [user] 
   */
  setSession(token, user) {
    if (!token) return;
    localStorage.setItem(CONFIG.TOKEN_KEY, token);
    localStorage.setItem('pexideal_client_token', token);
    if (user) {
      localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(user));
    }
  },

  /**
   * Clear all auth tokens and session keys, then perform a root-relative redirect
   */
  logout() {
    localStorage.removeItem(CONFIG.TOKEN_KEY);
    localStorage.removeItem('pexideal_client_token');
    localStorage.removeItem('pexideal_affiliate_token');
    localStorage.removeItem(CONFIG.USER_KEY);
    
    // Always use absolute path to prevent subdirectory redirect loops (e.g. inside /client/)
    window.location.href = '/login.html';
  },

  /**
   * Get logged-in user profile from localStorage
   * @returns {Object|null}
   */
  getUser() {
    const raw = localStorage.getItem(CONFIG.USER_KEY);
    try {
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error('Failed to parse user data:', e);
      return null;
    }
  },

  /**
   * Check if user is currently authenticated
   * @returns {boolean}
   */
  isLoggedIn() {
    return !!this.getToken();
  }
};

/**
 * Universal Fetch Wrapper with Auth Headers, Base URL Resolution & Trailing Slash Safety
 * @param {string} endpoint - API route path or full URL
 * @param {Object} [options] - Fetch options
 * @returns {Promise<any>}
 */
async function apiFetch(endpoint, options = {}) {
  const token = Auth.getToken();
  
  // Ensure endpoint starts with a slash if relative
  const formattedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  
  // Build full URL if absolute URL is not provided
  const url = endpoint.startsWith('http') 
    ? endpoint 
    : `${CONFIG.API_BASE_URL}${formattedEndpoint}`;

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers
    });
    
    // Auto logout on expired session or unauthorized response
    if (response.status === 401 || response.status === 403) {
      console.warn('Session expired or unauthorized. Logging out...');
      Auth.logout();
      throw new Error('Session expired. Please log in again.');
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || `API request failed with status ${response.status}`);
    }
    return data;

  } catch (error) {
    console.error(`API Error (${formattedEndpoint}):`, error);
    throw error;
  }
}