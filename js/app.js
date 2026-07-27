/**
 * Shared Application Utilities & Authentication Manager
 * File: js/app.js
 */

// Configuration: Replace with your deployed Render backend URL when live
const CONFIG = {
  API_BASE_URL: 'https://perkpass-api.onrender.com', // e.g., 'http://localhost:5000' during dev
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
    window.location.href = 'login.html';
  },

  // Get logged-in user profile
  getUser() {
    const raw = localStorage.getItem(CONFIG.USER_KEY);
    return raw ? JSON.parse(raw) : null;
  },

  // Check if authenticated
  isLoggedIn() {
    return !!this.getToken();
  }
};

/**
 * Universal Fetch Wrapper with Auth Headers
 */
async function apiFetch(endpoint, options = {}) {
  const token = Auth.getToken();
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers
  };

  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}${endpoint}`, {
      ...options,
      headers
    });
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'API request failed');
    return data;
  } catch (error) {
    console.error(`API Error (${endpoint}):`, error);
    throw error;
  }
}