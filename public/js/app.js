/**
 * Shared Application Utilities & Authentication Manager
 * File: js/app.js
 */

const IS_LOCAL = window.location.hostname === 'localhost' || 
                 window.location.hostname === '127.0.0.1' || 
                 window.location.protocol === 'file:';

const CONFIG = {
  API_BASE_URL: IS_LOCAL 
    ? 'http://127.0.0.1:5000' 
    : 'https://pexideal.onrender.com', 
  TOKEN_KEY: 'pexideal_token',
  USER_KEY: 'pexideal_user'
};

const Auth = {
  getToken() {
    return localStorage.getItem(CONFIG.TOKEN_KEY) || 
           localStorage.getItem('pexideal_client_token') || 
           localStorage.getItem('pexideal_affiliate_token');
  },

  setSession(token, user) {
    if (!token) return;
    localStorage.setItem(CONFIG.TOKEN_KEY, token);
    localStorage.setItem('pexideal_client_token', token);
    if (user) {
      localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(user));
    }
  },

  logout() {
    localStorage.removeItem(CONFIG.TOKEN_KEY);
    localStorage.removeItem('pexideal_client_token');
    localStorage.removeItem('pexideal_affiliate_token');
    localStorage.removeItem(CONFIG.USER_KEY);
    
    const path = window.location.pathname;
    if (path.includes('/client/') || path.includes('/affiliate/') || path.includes('/admin/')) {
      window.location.href = 'login.html';
    } else {
      window.location.href = 'client/login.html';
    }
  },

  getUser() {
    const raw = localStorage.getItem(CONFIG.USER_KEY);
    try {
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error('Failed to parse user data:', e);
      return null;
    }
  },

  isLoggedIn() {
    return !!this.getToken();
  }
};

async function apiFetch(endpoint, options = {}) {
  const token = Auth.getToken();
  const formattedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = endpoint.startsWith('http') 
    ? endpoint 
    : `${CONFIG.API_BASE_URL}${formattedEndpoint}`;

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  try {
    const response = await fetch(url, { ...options, headers });
    
    // Only 401 Unauthorized should logout (Invalid or Expired JWT)
    if (response.status === 401) {
      console.warn('Session expired. Logging out...');
      Auth.logout();
      throw new Error('Session expired. Please log in again.');
    }

    const data = await response.json();

    // Handle 403 Forbidden without logging out
    if (response.status === 403) {
      console.error('403 Forbidden:', data.message || 'Access denied.');
      throw new Error(data.message || 'You do not have permission to perform this action.');
    }

    if (!response.ok) {
      throw new Error(data.message || `API request failed with status ${response.status}`);
    }
    return data;

  } catch (error) {
    console.error(`API Error (${formattedEndpoint}):`, error);
    throw error;
  }
}