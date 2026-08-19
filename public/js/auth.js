/**
 * Authentication & Registration Handlers
 * File: js/auth.js
 */

document.addEventListener('DOMContentLoaded', () => {

  function setButtonLoading(buttonEl, isLoading, defaultText = 'Submit') {
    if (!buttonEl) return;
    
    if (isLoading) {
      if (!buttonEl.dataset.originalText) {
        buttonEl.dataset.originalText = buttonEl.innerHTML;
      }
      buttonEl.disabled = true;
      buttonEl.innerHTML = `
        <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
        Processing...
      `;
    } else {
      buttonEl.disabled = false;
      buttonEl.innerHTML = buttonEl.dataset.originalText || defaultText;
      delete buttonEl.dataset.originalText;
    }
  }

  function displayFormError(containerEl, messageEl, message) {
    if (containerEl) {
      containerEl.className = 'alert alert-danger rounded-3 py-2 px-3 small mb-3';
      if (messageEl) {
        messageEl.textContent = message;
      } else {
        containerEl.textContent = message;
      }
      containerEl.classList.remove('d-none');
    } else {
      alert(message);
    }
  }

  function getInputValue(elementId) {
    const el = document.getElementById(elementId);
    return el ? el.value.trim() : '';
  }

  async function executeAuthRequest(endpoints, options = {}) {
    let lastError = null;

    for (const url of endpoints) {
      try {
        if (typeof apiFetch === 'function') {
          return await apiFetch(url, options);
        }

        const fetchOptions = {
          method: options.method || 'GET',
          headers: { 
            'Content-Type': 'application/json',
            ...(options.headers || {})
          },
          ...options
        };

        const res = await fetch(url, fetchOptions);
        const data = await res.json().catch(() => ({}));

        if (!res.ok || data.success === false) {
          throw new Error(data.message || `Request failed with status ${res.status}`);
        }
        return data;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('Authentication request failed. Please check your network connection.');
  }

  const loginForm = document.getElementById('client-login-form') || 
                    document.getElementById('affiliate-login-form') || 
                    document.getElementById('admin-login-form');

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const submitBtn = document.getElementById('btn-submit') || loginForm.querySelector('button[type="submit"]');
      const rawIdentifier = (
        getInputValue('login-identifier') || 
        getInputValue('signin-email') || 
        getInputValue('email')
      );

      const password = (
        document.getElementById('login-password')?.value || 
        document.getElementById('signin-password')?.value || 
        document.getElementById('password')?.value || ''
      );

      const errorAlert = document.getElementById('auth-alert') || document.getElementById('error-alert');
      const errorMessage = document.getElementById('error-message');

      if (errorAlert) errorAlert.classList.add('d-none');

      if (!rawIdentifier || !password) {
        displayFormError(errorAlert, errorMessage, 'Please fill in all required fields.');
        return;
      }

      setButtonLoading(submitBtn, true);

      try {
        const endpoints = ['/api/auth/client/login', '/api/auth/login'];
        const data = await executeAuthRequest(endpoints, {
          method: 'POST',
          body: JSON.stringify({
            identifier: rawIdentifier,
            email: rawIdentifier,
            password
          })
        });

        if (data.success) {
          if (typeof Auth !== 'undefined' && Auth.setSession) {
            Auth.setSession(data.token, data.user);
          } else if (data.token) {
            localStorage.setItem('pexideal_token', data.token);
            localStorage.setItem('pexideal_client_token', data.token);
            if (data.user) localStorage.setItem('pexideal_user', JSON.stringify(data.user));
          }
          
          if (errorAlert) {
            errorAlert.className = 'alert alert-success rounded-3 py-2 px-3 small mb-3';
            if (errorMessage) errorMessage.textContent = 'Sign in successful! Redirecting...';
            else errorAlert.textContent = 'Sign in successful! Redirecting...';
            errorAlert.classList.remove('d-none');
          }

          const role = data.user?.role;
          setTimeout(() => {
            if (role === 'affiliate' || role === 'merchant' || window.location.pathname.includes('/affiliate/')) {
              window.location.href = '../affiliate/dashboard.html';
            } else if (role === 'admin' || window.location.pathname.includes('/admin/')) {
              window.location.href = '../admin/dashboard.html';
            } else {
              window.location.href = 'dashboard.html';
            }
          }, 400);
        }
      } catch (err) {
        displayFormError(errorAlert, errorMessage, err.message || 'Invalid credentials. Please try again.');
      } finally {
        setButtonLoading(submitBtn, false);
      }
    });
  }

  const clientForm = document.getElementById('signup-form') || document.getElementById('client-signup-form');
  if (clientForm) {
    clientForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const submitBtn = clientForm.querySelector('button[type="submit"]');
      const errorAlert = document.getElementById('auth-alert') || document.getElementById('error-alert');
      const errorMessage = document.getElementById('error-message');

      const selectedTierEl = document.querySelector('.tier-option.selected');
      const tierName = selectedTierEl ? selectedTierEl.getAttribute('data-tier') : 'standard';

      const firstName = getInputValue('first-name');
      const lastName = getInputValue('last-name');

      const payload = {
        firstName,
        lastName,
        fullName: `${firstName} ${lastName}`.trim(),
        email: getInputValue('email'),
        phone: getInputValue('phone'),
        password: document.getElementById('password')?.value || '',
        tier: tierName,
        tierName: tierName,
        role: 'client'
      };

      setButtonLoading(submitBtn, true);

      try {
        const endpoints = ['/api/auth/client/signup', '/api/auth/register-client', '/api/auth/signup'];
        const data = await executeAuthRequest(endpoints, {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (data.success) {
          if (typeof Auth !== 'undefined' && Auth.setSession) {
            Auth.setSession(data.token, data.user);
          } else if (data.token) {
            localStorage.setItem('pexideal_token', data.token);
            localStorage.setItem('pexideal_client_token', data.token);
            if (data.user) localStorage.setItem('pexideal_user', JSON.stringify(data.user));
          }

          setTimeout(() => {
            window.location.href = 'dashboard.html';
          }, 800);
        }
      } catch (err) {
        displayFormError(errorAlert, errorMessage, err.message || 'Client registration failed.');
      } finally {
        setButtonLoading(submitBtn, false);
      }
    });
  }
});