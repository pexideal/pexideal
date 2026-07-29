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
  // Get stored JWT token
  getToken() {
    return localStorage.getItem(CONFIG.TOKEN_KEY);
  },

  // Save auth state
  setSession(token, user) {
    localStorage.setItem(CONFIG.TOKEN_KEY, token);
    localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(user));
  },

  // Clear session on logout
  logout() {
    localStorage.removeItem(CONFIG.TOKEN_KEY);
    localStorage.removeItem(CONFIG.USER_KEY);
    // Adjust path depending on whether page is in root or subfolder
    const isSubfolder = window.location.pathname.includes('/interface/');
    window.location.href = isSubfolder ? '../login.html' : 'login.html';
  },

  // Get logged-in user profile
  getUser() {
    const raw = localStorage.getItem(CONFIG.USER_KEY);
    try {
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error('Failed to parse user data:', e);
      return null;
    }
  },

  // Check if authenticated
  isLoggedIn() {
    return !!this.getToken();
  }
};

/**
 * Universal Fetch Wrapper with Auth Headers & Trailing Slash Safety
 */
async function apiFetch(endpoint, options = {}) {
  const token = Auth.getToken();
  
  // Ensure endpoint starts with a slash
  const formattedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers
  };

  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}${formattedEndpoint}`, {
      ...options,
      headers
    });
    
    // Auto logout on expired session / invalid token
    if (response.status === 401 || response.status === 403) {
      console.warn('Session expired or unauthorized. Logging out...');
      Auth.logout();
      throw new Error('Session expired. Please log in again.');
    }

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'API request failed');
    return data;

  } catch (error) {
    console.error(`API Error (${formattedEndpoint}):`, error);
    throw error;
  }
}