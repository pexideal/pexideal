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
  
  // Storage Keys for Passholders / Clients
  CLIENT_TOKEN_KEY: 'pexideal_token',
  CLIENT_USER_KEY: 'pexideal_user',
  
  // Storage Keys for Merchants / Partners / Affiliates
  PARTNER_TOKEN_KEY: 'pexideal_partner_token',
  PARTNER_USER_KEY: 'pexideal_partner_user'
};

const Auth = {
  /**
   * Retrieves active auth token checking both client and partner storage locations (local & session)
   */
  getToken() {
    return localStorage.getItem(CONFIG.CLIENT_TOKEN_KEY) ||
           sessionStorage.getItem(CONFIG.CLIENT_TOKEN_KEY) ||
           localStorage.getItem(CONFIG.PARTNER_TOKEN_KEY) ||
           sessionStorage.getItem(CONFIG.PARTNER_TOKEN_KEY) ||
           localStorage.getItem('pexideal_affiliate_token') || null;
  },

  /**
   * Stores session tokens & user data dynamically based on user role
   */
  setSession(token, user, isPartner = false, remember = true) {
    if (!token) return;
    const storage = remember ? localStorage : sessionStorage;
    
    if (isPartner || user?.role === 'affiliate' || user?.role === 'merchant') {
      storage.setItem(CONFIG.PARTNER_TOKEN_KEY, token);
      if (user) storage.setItem(CONFIG.PARTNER_USER_KEY, JSON.stringify(user));
    } else {
      storage.setItem(CONFIG.CLIENT_TOKEN_KEY, token);
      if (user) storage.setItem(CONFIG.CLIENT_USER_KEY, JSON.stringify(user));
    }
  },

  /**
   * Clears all client and merchant session keys and redirects appropriately
   */
  logout() {
    // Clear Client Keys
    localStorage.removeItem(CONFIG.CLIENT_TOKEN_KEY);
    localStorage.removeItem(CONFIG.CLIENT_USER_KEY);
    sessionStorage.removeItem(CONFIG.CLIENT_TOKEN_KEY);
    sessionStorage.removeItem(CONFIG.CLIENT_USER_KEY);
    localStorage.removeItem('pexideal_card');

    // Clear Partner / Merchant Keys
    localStorage.removeItem(CONFIG.PARTNER_TOKEN_KEY);
    localStorage.removeItem(CONFIG.PARTNER_USER_KEY);
    sessionStorage.removeItem(CONFIG.PARTNER_TOKEN_KEY);
    sessionStorage.removeItem(CONFIG.PARTNER_USER_KEY);
    localStorage.removeItem('pexideal_affiliate_token');
    
    const path = window.location.pathname.toLowerCase();
    
    // Redirect logic based on section
    if (path.includes('/merchant/') || path.includes('/affiliate/') || path.includes('/partner/')) {
      window.location.href = 'login.html';
    } else if (path.includes('/admin/')) {
      window.location.href = 'admin-login.html';
    } else {
      window.location.href = 'login.html';
    }
  },

  /**
   * Retrieves active parsed user object
   */
  getUser() {
    const raw = localStorage.getItem(CONFIG.CLIENT_USER_KEY) ||
                sessionStorage.getItem(CONFIG.CLIENT_USER_KEY) ||
                localStorage.getItem(CONFIG.PARTNER_USER_KEY) ||
                sessionStorage.getItem(CONFIG.PARTNER_USER_KEY);
    try {
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error('Failed to parse user session data:', e);
      return null;
    }
  },

  /**
   * Checks if user has a valid active token
   */
  isLoggedIn() {
    return !!this.getToken();
  }
};

/**
 * Standardized API Fetch wrapper with Automatic Authorization Header injection
 */
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

    // Handle 401 Unauthorized (Expired or invalid token -> Force Logout)
    if (response.status === 401) {
      console.warn('Session expired or unauthorized. Logging out...');
      Auth.logout();
      throw new Error('Session expired. Please log in again.');
    }

    const data = await response.json().catch(() => ({}));

    // Handle 403 Forbidden without destroying the active session
    if (response.status === 403) {
      console.error('403 Forbidden:', data.message || 'Access denied.');
      throw new Error(data.message || 'You do not have permission to perform this action.');
    }

    if (!response.ok || data.success === false) {
      throw new Error(data.message || `API request failed with status ${response.status}`);
    }

    return data;

  } catch (error) {
    console.error(`API Error [${formattedEndpoint}]:`, error.message);
    throw error;
  }
}