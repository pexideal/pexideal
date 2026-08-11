/**
 * System Admin Portal Logic
 * File: public/admin/admin.js
 */

document.addEventListener('DOMContentLoaded', async () => {
  const adminLoginForm = document.getElementById('adminLoginForm');
  const loginError = document.getElementById('loginError');
  const adminLogoutBtn = document.getElementById('adminLogoutBtn');

  // Admin Login Handler
  if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      loginError.style.display = 'none';

      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;

      try {
        const response = await apiFetch('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password })
        });

        if (response.success && response.user.role === 'admin') {
          Auth.setSession(response.token, response.user);
          window.location.href = 'dashboard.html';
        } else {
          loginError.textContent = 'Access denied. Administrative account required.';
          loginError.style.display = 'block';
        }
      } catch (err) {
        loginError.textContent = err.message || 'Login failed.';
        loginError.style.display = 'block';
      }
    });
  }

  // Admin Dashboard Loader
  if (document.getElementById('statUsers')) {
    // Guard route: check if logged in as admin
    if (!Auth.isLoggedIn() || Auth.getUser()?.role !== 'admin') {
      window.location.href = 'login.html';
      return;
    }

    loadDashboardOverview();
  }

  async function loadDashboardOverview() {
    try {
      const data = await apiFetch('/api/admin/overview');
      if (data.success) {
        document.getElementById('statUsers').textContent = data.stats.totalUsers;
        document.getElementById('statCards').textContent = data.stats.activeCards;
        document.getElementById('statMerchants').textContent = data.stats.totalMerchants;
        document.getElementById('statRedemptions').textContent = data.stats.totalRedemptions;

        renderRedemptionsTable(data.recentActivity);
      }
    } catch (err) {
      console.error('Error loading admin stats:', err);
    }
  }

  function renderRedemptionsTable(list) {
    const tbody = document.getElementById('redemptionsTable');
    if (!list || list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3">No redemptions logged yet.</td></tr>';
      return;
    }

    tbody.innerHTML = list.map(item => `
      <tr>
        <td>${item.full_name || 'Cardholder'}</td>
        <td>${item.store_id}</td>
        <td>${new Date(item.redeemed_at).toLocaleString()}</td>
      </tr>
    `).join('');
  }

  adminLogoutBtn?.addEventListener('click', () => {
    Auth.logout();
    window.location.href = 'login.html';
  });
});