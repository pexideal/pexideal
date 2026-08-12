/**
 * Authentication & Registration Handlers
 * File: js/auth.js
 */

document.addEventListener('DOMContentLoaded', () => {

  // Helper: Toggle button loading state during API calls
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

  // Helper: Unified request error UI display
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

  // Helper: Fallback fetcher supporting both custom apiFetch helper and standard fetch
  async function executeAuthRequest(endpoints, options = {}) {
    let lastError = null;

    for (const url of endpoints) {
      try {
        if (typeof apiFetch === 'function') {
          return await apiFetch(url, options);
        } else {
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
        }
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('Authentication request failed.');
  }

  // --- Live Preview & Tier Selection for Signup Pages ---
  const firstNameInput = document.getElementById('first-name');
  const lastNameInput = document.getElementById('last-name');
  const cardNameLabel = document.getElementById('card-name-label');

  if (firstNameInput && cardNameLabel) {
    const updatePreviewName = () => {
      const fn = firstNameInput?.value.trim() || '';
      const ln = lastNameInput?.value.trim() || '';
      cardNameLabel.textContent = (fn || ln) ? `${fn} ${ln}` : 'Your Name Here';
    };
    firstNameInput.addEventListener('input', updatePreviewName);
    if (lastNameInput) lastNameInput.addEventListener('input', updatePreviewName);
  }

  // Expose tier selection globally for onclick attributes
  window.selectTier = function(element) {
    if (!element) return;
    document.querySelectorAll('.tier-option').forEach(el => el.classList.remove('selected'));
    element.classList.add('selected');

    const tier = element.getAttribute('data-tier') || 'standard';
    const tierLabel = document.getElementById('card-tier-label');
    if (tierLabel) {
      tierLabel.textContent = tier === 'vip' ? 'VIP All-Access' : 'Standard Pass';
    }
  };


  // --- 1. Universal Login Form Handler (Client, Affiliate, Admin) ---
  const loginForm = document.getElementById('client-login-form') || 
                    document.getElementById('affiliate-login-form') || 
                    document.getElementById('admin-login-form');

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const submitBtn = document.getElementById('btn-submit') || loginForm.querySelector('button[type="submit"]');
      const rawIdentifier = (
        document.getElementById('login-identifier') || 
        document.getElementById('signin-email') || 
        document.getElementById('email')
      )?.value.trim();

      const password = (
        document.getElementById('login-password') || 
        document.getElementById('signin-password') || 
        document.getElementById('password')
      )?.value;

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

          // Role-based or path-based dashboard redirection
          const role = data.user?.role;
          setTimeout(() => {
            if (role === 'affiliate' || role === 'merchant' || window.location.pathname.includes('/affiliate/')) {
              window.location.href = '/affiliate/dashboard.html';
            } else if (role === 'admin' || window.location.pathname.includes('/admin/')) {
              window.location.href = '/admin/dashboard.html';
            } else {
              window.location.href = '/client/dashboard.html';
            }
          }, 800);
        }
      } catch (err) {
        displayFormError(errorAlert, errorMessage, err.message || 'Invalid credentials. Please try again.');
      } finally {
        setButtonLoading(submitBtn, false);
      }
    });
  }


  // --- 2. Client Signup Handler ---
  const clientForm = document.getElementById('signup-form') || document.getElementById('client-signup-form');
  if (clientForm) {
    clientForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const submitBtn = clientForm.querySelector('button[type="submit"]');
      const errorAlert = document.getElementById('auth-alert') || document.getElementById('error-alert');
      const errorMessage = document.getElementById('error-message');

      const selectedTierEl = document.querySelector('.tier-option.selected');
      const tierName = selectedTierEl ? selectedTierEl.getAttribute('data-tier') : 'standard';

      const firstName = document.getElementById('first-name')?.value.trim();
      const lastName = document.getElementById('last-name')?.value.trim();

      const payload = {
        firstName,
        lastName,
        fullName: `${firstName || ''} ${lastName || ''}`.trim(),
        email: document.getElementById('email')?.value.trim(),
        phone: document.getElementById('phone')?.value.trim() || '',
        password: document.getElementById('password')?.value,
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

          // Dynamic Instant Card UI updates
          const issuedContainer = document.getElementById('issued-pass-container');
          const previewPlaceholder = document.getElementById('preview-placeholder');

          if (issuedContainer) {
            const userFirstName = data.user?.firstName || data.user?.first_name || payload.firstName;
            const cardCode = data.user?.id || data.user?.cardCode || data.card?.cardNumber || 'DC-2026-ACTIVE';
            const qrToken = data.card?.qrCodeToken || cardCode;

            const nameEl = document.getElementById('user-first-name');
            const cardNumEl = document.getElementById('issued-card-number');
            const tierBadgeEl = document.getElementById('issued-tier-badge');

            if (nameEl) nameEl.textContent = userFirstName;
            if (cardNumEl) cardNumEl.textContent = cardCode;
            if (tierBadgeEl) tierBadgeEl.textContent = `${tierName.toUpperCase()} PASS`;
            
            const qrImgEl = document.getElementById('issued-qr');
            if (qrImgEl) {
              const qrData = `PEXIDEAL:${qrToken}:${cardCode}`;
              qrImgEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qrData)}`;
            }

            if (previewPlaceholder) previewPlaceholder.classList.add('d-none');
            issuedContainer.classList.remove('d-none');

            setTimeout(() => {
              window.location.href = '/client/dashboard.html';
            }, 2500);
          } else {
            window.location.href = '/client/dashboard.html';
          }
        }
      } catch (err) {
        displayFormError(errorAlert, errorMessage, err.message || 'Client registration failed.');
      } finally {
        setButtonLoading(submitBtn, false);
      }
    });
  }


  // --- 3. Merchant / Affiliate Onboarding Handler ---
  const merchForm = document.getElementById('affiliate-signup-form') || document.getElementById('merchant-signup-form');
  if (merchForm) {
    merchForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const submitBtn = merchForm.querySelector('button[type="submit"]');
      const errorAlert = document.getElementById('auth-alert') || document.getElementById('error-alert');
      const errorMessage = document.getElementById('error-message');

      const payload = {
        businessName: document.getElementById('business-name')?.value.trim(),
        category: document.getElementById('business-category')?.value,
        email: (document.getElementById('merch-email') || document.getElementById('email'))?.value.trim(),
        password: (document.getElementById('merch-password') || document.getElementById('password'))?.value,
        role: 'affiliate'
      };

      setButtonLoading(submitBtn, true);

      try {
        const endpoints = ['/api/auth/affiliate/signup', '/api/auth/register-merchant'];
        const data = await executeAuthRequest(endpoints, {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (data.success) {
          if (typeof Auth !== 'undefined' && Auth.setSession) {
            Auth.setSession(data.token, data.user);
          } else if (data.token) {
            localStorage.setItem('pexideal_token', data.token);
            localStorage.setItem('pexideal_affiliate_token', data.token);
            if (data.user) localStorage.setItem('pexideal_user', JSON.stringify(data.user));
          }
          window.location.href = '/affiliate/dashboard.html';
        }
      } catch (err) {
        displayFormError(errorAlert, errorMessage, err.message || 'Merchant registration failed.');
      } finally {
        setButtonLoading(submitBtn, false);
      }
    });
  }

});