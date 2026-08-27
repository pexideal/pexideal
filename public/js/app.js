/**
 * Shared Application Utilities, Authentication Manager & API Module
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

/**
 * Unified API Interface for Client and Merchant Endpoints
 */
const API = {
  // Authentication
  auth: {
    async clientSignup(payload) {
      return apiFetch('/api/auth/client/signup', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },

    async clientLogin(email, password, remember = true) {
      const res = await apiFetch('/api/auth/client/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      if (res.token) {
        Auth.setSession(res.token, res.user, false, remember);
      }
      return res;
    },

    async merchantSignup(payload) {
      return apiFetch('/api/auth/merchant/signup', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },

    async merchantLogin(identifier, password, remember = true) {
      const res = await apiFetch('/api/auth/merchant/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password })
      });
      if (res.token) {
        Auth.setSession(res.token, res.user, true, remember);
      }
      return res;
    },

    async verifyToken() {
      return apiFetch('/api/auth/verify', { method: 'GET' });
    },

    logout() {
      Auth.logout();
    }
  },

  // Client Cards & Dynamic Passes
  cards: {
    async getMyCard() {
      return apiFetch('/api/cards/me', { method: 'GET' });
    },

    async generateDynamicQR() {
      return apiFetch('/api/cards/qr-token', { method: 'GET' });
    }
  },

  // Merchant Scanning & Offline Processing
  scan: {
    async validatePass(qrData, storeId = 'DEFAULT', discountAmount = 0) {
      return apiFetch('/v1/discounts/verify', {
        method: 'POST',
        body: JSON.stringify({ token: qrData, qrData, storeId, discountAmount })
      });
    },

    async syncOfflineBatch(batch) {
      return apiFetch('/v1/discounts/sync-offline', {
        method: 'POST',
        body: JSON.stringify({ batch })
      });
    }
  },

  // Merchant Dashboard & Metrics
  merchant: {
    async getStats() {
      return apiFetch('/api/merchant/dashboard/stats', { method: 'GET' });
    },

    async getRedemptionLogs(page = 1, limit = 20, status = '') {
      const query = `?page=${page}&limit=${limit}${status ? `&status=${status}` : ''}`;
      return apiFetch(`/api/merchant/redemptions${query}`, { method: 'GET' });
    },

    async getStorePerformance() {
      return apiFetch('/api/merchant/stores', { method: 'GET' });
    }
  }
};

/**
 * Dynamic Redemption History Table Manager
 */
class RedemptionHistoryTable {
  constructor(options = {}) {
    this.containerId = options.containerId || 'redemption-history-container';
    this.pageSize = options.pageSize || 5;
    this.currentPage = 1;
    this.totalRecords = 0;
    this.data = [];

    this.init();
  }

  init() {
    this.renderSkeleton();
    this.fetchRedemptionHistory(this.currentPage);
  }

  /**
   * Render base UI Shell (Table Frame & Pagination Controls)
   */
  renderSkeleton() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="card bg-dark border-secondary mt-4">
        <div class="card-header bg-dark border-secondary d-flex justify-content-between align-items-center py-3">
          <h6 class="fw-bold text-white mb-0">
            <i class="bi bi-clock-history me-2 text-emerald"></i>Redemption History
          </h6>
          <span class="badge bg-secondary text-white-50 fs-8" id="history-total-count">0 items</span>
        </div>
        <div class="card-body p-0">
          <div class="table-responsive">
            <table class="table table-dark table-hover mb-0 align-middle text-nowrap">
              <thead class="table-borderless border-bottom border-secondary text-white-50 fs-8">
                <tr>
                  <th scope="col" class="ps-3">TIMESTAMP</th>
                  <th scope="col">MEMBER NAME</th>
                  <th scope="col">MEMBER ID</th>
                  <th scope="col">DISCOUNT APPLIED</th>
                  <th scope="col">STATUS</th>
                </tr>
              </thead>
              <tbody id="history-table-body" class="fs-7">
                <tr>
                  <td colspan="5" class="text-center py-4 text-white-50">Loading redemptions...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="card-footer bg-dark border-secondary d-flex justify-content-between align-items-center py-2">
          <small class="text-white-50 fs-8" id="pagination-info">Showing 0-0 of 0</small>
          <ul class="pagination pagination-sm mb-0" id="pagination-controls">
            <!-- Pagination items inserted dynamically -->
          </ul>
        </div>
      </div>
    `;
  }

  /**
   * Fetch redemption data via backend API with fallback mock payload
   */
  async fetchRedemptionHistory(page) {
    try {
      let result;
      
      // Attempt API call if user is logged in
      if (Auth.isLoggedIn()) {
        try {
          const apiRes = await API.merchant.getRedemptionLogs(page, this.pageSize);
          result = {
            page: apiRes.page || page,
            total: apiRes.total || apiRes.items?.length || 0,
            items: apiRes.items || apiRes.data || []
          };
        } catch (apiErr) {
          console.warn('Backend API unavailable. Switching to mock data fallback.', apiErr.message);
          result = await this.getMockData(page, this.pageSize);
        }
      } else {
        result = await this.getMockData(page, this.pageSize);
      }

      this.currentPage = result.page;
      this.totalRecords = result.total;
      this.data = result.items;

      this.renderRows();
      this.renderPagination();
    } catch (error) {
      console.error('Failed to load redemption history:', error);
      const tbody = document.getElementById('history-table-body');
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-3">Error loading records.</td></tr>`;
      }
    }
  }

  /**
   * Render dynamic table rows
   */
  renderRows() {
    const tbody = document.getElementById('history-table-body');
    const totalBadge = document.getElementById('history-total-count');
    if (!tbody) return;

    if (totalBadge) totalBadge.textContent = `${this.totalRecords} total`;

    if (this.data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-white-50 py-4">No redemption history found.</td></tr>`;
      return;
    }

    tbody.innerHTML = this.data.map(item => `
      <tr>
        <td class="ps-3 text-white-50">${item.timestamp}</td>
        <td class="fw-semibold text-white">${item.memberName}</td>
        <td class="text-white-50"><code>${item.memberId}</code></td>
        <td class="text-warning fw-bold">${item.discount}</td>
        <td>
          <span class="badge ${item.isOffline ? 'bg-warning-subtle text-warning' : 'bg-success-subtle text-success'} rounded-pill px-2 fs-8">
            ${item.isOffline ? '<i class="bi bi-wifi-off me-1"></i>Offline' : '<i class="bi bi-check-circle me-1"></i>Verified'}
          </span>
        </td>
      </tr>
    `).join('');
  }

  /**
   * Render pagination button controls & current record range text
   */
  renderPagination() {
    const totalPages = Math.ceil(this.totalRecords / this.pageSize) || 1;
    const paginationInfo = document.getElementById('pagination-info');
    const controls = document.getElementById('pagination-controls');

    const startIdx = this.totalRecords === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1;
    const endIdx = Math.min(this.currentPage * this.pageSize, this.totalRecords);
    
    if (paginationInfo) {
      paginationInfo.textContent = `Showing ${startIdx}-${endIdx} of ${this.totalRecords}`;
    }

    if (!controls) return;

    let html = '';

    // Previous Button
    html += `
      <li class="page-item ${this.currentPage === 1 ? 'disabled' : ''}">
        <button class="page-link bg-dark text-white border-secondary fs-8" onclick="window.redemptionTable.goToPage(${this.currentPage - 1})">&laquo;</button>
      </li>
    `;

    // Numeric Buttons
    for (let i = 1; i <= totalPages; i++) {
      html += `
        <li class="page-item ${i === this.currentPage ? 'active' : ''}">
          <button class="page-link ${i === this.currentPage ? 'bg-success border-success text-white' : 'bg-dark text-white border-secondary'} fs-8" onclick="window.redemptionTable.goToPage(${i})">${i}</button>
        </li>
      `;
    }

    // Next Button
    html += `
      <li class="page-item ${this.currentPage === totalPages || totalPages === 0 ? 'disabled' : ''}">
        <button class="page-link bg-dark text-white border-secondary fs-8" onclick="window.redemptionTable.goToPage(${this.currentPage + 1})">&raquo;</button>
      </li>
    `;

    controls.innerHTML = html;
  }

  goToPage(page) {
    const totalPages = Math.ceil(this.totalRecords / this.pageSize);
    if (page < 1 || page > totalPages) return;
    this.fetchRedemptionHistory(page);
  }

  /**
   * Mock Data Generator for offline & demonstration usage
   */
  getMockData(page, pageSize) {
    const mockDb = Array.from({ length: 14 }).map((_, i) => ({
      timestamp: `2026-08-27 1${4 - Math.floor(i / 2)}:${(30 - i * 2).toString().padStart(2, '0')}`,
      memberName: ['Titose Machacha', 'Puso Ratina', 'Kabo Setlhare', 'Mpho Mooketsi'][i % 4],
      memberId: `PX-${8800 + i}`,
      discount: i % 3 === 0 ? 'P15.00 Off' : '10% Discount',
      isOffline: i % 5 === 0
    }));

    const start = (page - 1) * pageSize;
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({
          page,
          total: mockDb.length,
          items: mockDb.slice(start, start + pageSize)
        });
      }, 150);
    });
  }
}

// Global Exports
if (typeof window !== 'undefined') {
  window.CONFIG = CONFIG;
  window.Auth = Auth;
  window.apiFetch = apiFetch;
  window.API = API;
  window.RedemptionHistoryTable = RedemptionHistoryTable;

  // Auto-initialize when container exists on current page DOM
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('redemption-history-container')) {
      window.redemptionTable = new RedemptionHistoryTable({ pageSize: 5 });
    }
  });
}