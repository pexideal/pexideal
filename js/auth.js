/**
 * Authentication & Registration Handlers
 * File: js/auth.js
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- 1. Login Form Handler (login.html) ---
  const loginForm = document.getElementById('signin-form') || document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('signin-email')?.value.trim();
      const password = document.getElementById('signin-password')?.value;
      const errorAlert = document.getElementById('error-alert');
      const errorMessage = document.getElementById('error-message');

      if (errorAlert) errorAlert.classList.add('d-none');

      try {
        const data = await apiFetch('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password })
        });

        if (data.success) {
          Auth.setSession(data.token, data.user);
          // Redirect based on user role
          if (data.user.role === 'merchant') {
            window.location.href = 'interface/cashier-scanner.html';
          } else {
            window.location.href = 'index.html';
          }
        }
      } catch (err) {
        if (errorMessage && errorAlert) {
          errorMessage.textContent = err.message || 'Invalid credentials.';
          errorAlert.classList.remove('d-none');
        }
      }
    });
  }

  // --- 2. Client Signup Handler (client-signup.html) ---
  const clientForm = document.getElementById('client-signup-form');
  if (clientForm) {
    clientForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        firstName: document.getElementById('first-name')?.value.trim(),
        lastName: document.getElementById('last-name')?.value.trim(),
        email: document.getElementById('email')?.value.trim(),
        password: document.getElementById('password')?.value,
        role: 'client'
      };

      try {
        const data = await apiFetch('/api/auth/register-client', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (data.success) {
          Auth.setSession(data.token, data.user);
          window.location.href = 'index.html';
        }
      } catch (err) {
        alert(err.message || 'Registration failed.');
      }
    });
  }

  // --- 3. Merchant Onboarding Handler (merch-signup.html) ---
  const merchForm = document.getElementById('merch-signup-form');
  if (merchForm) {
    merchForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        businessName: document.getElementById('business-name')?.value.trim(),
        category: document.getElementById('business-category')?.value,
        email: document.getElementById('merch-email')?.value.trim(),
        password: document.getElementById('merch-password')?.value,
        role: 'merchant'
      };

      try {
        const data = await apiFetch('/api/auth/register-merchant', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (data.success) {
          Auth.setSession(data.token, data.user);
          window.location.href = 'interface/cashier-scanner.html';
        }
      } catch (err) {
        alert(err.message || 'Merchant registration failed.');
      }
    });
  }
});