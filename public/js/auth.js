/**
 * Authentication & Registration Handlers
 * File: js/auth.js
 */

// 1. Global Tier Selection Handler (accessible via inline onclick or DOM listeners)
window.selectTier = function (element) {
  if (!element) return;
  
  // Clear selection from all tier option containers
  document.querySelectorAll('.tier-option').forEach(el => el.classList.remove('selected'));
  element.classList.add('selected');

  const tier = element.getAttribute('data-tier') || 'standard';
  const cardTierLabel = document.getElementById('card-tier-label');
  const digitalCard = document.getElementById('digital-card');

  if (cardTierLabel) {
    cardTierLabel.textContent = tier === 'vip' ? 'VIP ALL-ACCESS PASS' : 'STANDARD PASS';
  }

  if (digitalCard) {
    if (tier === 'vip') {
      digitalCard.classList.add('vip');
    } else {
      digitalCard.classList.remove('vip');
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {

  // ==========================================
  // UTILITY & UI HELPERS
  // ==========================================

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

  /**
   * Render Digital Pass & QR Code into DOM
   */
  function renderIssuedCard(cardData, fullName) {
    const cardNumberEl = document.getElementById('card-number-label');
    const cardNameEl = document.getElementById('card-name-label');
    const cardTierEl = document.getElementById('card-tier-label');
    const qrContainer = document.getElementById('issued-qr');

    if (cardNumberEl && cardData?.cardNumber) {
      cardNumberEl.textContent = cardData.cardNumber;
    }
    if (cardNameEl && fullName) {
      cardNameEl.textContent = fullName;
    }
    if (cardTierEl && cardData?.tierName) {
      cardTierEl.textContent = cardData.tierName === 'vip' ? 'VIP ALL-ACCESS PASS' : 'STANDARD PASS';
    }

    if (qrContainer && cardData?.qrCodeToken) {
      qrContainer.innerHTML = '';
      if (typeof QRCode !== 'undefined') {
        new QRCode(qrContainer, {
          text: cardData.qrCodeToken,
          width: 130,
          height: 130,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.H
        });
      } else {
        // Fallback QuickChart API image if QRCode library is unattached
        const encodedToken = encodeURIComponent(cardData.qrCodeToken);
        qrContainer.innerHTML = `<img src="https://quickchart.io/qr?text=${encodedToken}&size=130&margin=1" alt="Pass QR Code" style="width:100%; height:auto;" />`;
      }
    }
  }

  async function executeAuthRequest(endpoint, options = {}) {
    const targetUrl = Array.isArray(endpoint) ? endpoint[0] : endpoint;

    if (typeof apiFetch === 'function') {
      return await apiFetch(targetUrl, options);
    }

    const fetchOptions = {
      method: options.method || 'GET',
      headers: { 
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options
    };

    const res = await fetch(targetUrl, fetchOptions);
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.success === false) {
      throw new Error(data.message || `Request failed with status ${res.status}`);
    }
    return data;
  }

  // ==========================================
  // REAL-TIME CARD PREVIEW INPUT SYNC
  // ==========================================

  const firstNameInput = document.getElementById('first-name');
  const lastNameInput = document.getElementById('last-name');
  const cardNameLabel = document.getElementById('card-name-label');

  function updateCardNamePreview() {
    if (!cardNameLabel) return;
    const fName = getInputValue('first-name');
    const lName = getInputValue('last-name');
    const fullName = `${fName} ${lName}`.trim();
    cardNameLabel.textContent = fullName.length > 0 ? fullName : 'Your Name Here';
  }

  if (firstNameInput) firstNameInput.addEventListener('input', updateCardNamePreview);
  if (lastNameInput) lastNameInput.addEventListener('input', updateCardNamePreview);

  // ==========================================
  // LOGIN FORM HANDLER
  // ==========================================

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
        const data = await executeAuthRequest('/api/auth/client/login', {
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

          if (data.card) {
            localStorage.setItem('pexideal_card', JSON.stringify(data.card));
            renderIssuedCard(data.card, data.user?.fullName);
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

  // ==========================================
  // SIGNUP FORM HANDLER
  // ==========================================

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

      if (errorAlert) errorAlert.classList.add('d-none');
      setButtonLoading(submitBtn, true);

      try {
        const data = await executeAuthRequest('/api/auth/client/signup', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (data.success) {
          // 1. Session & Card Storage
          if (typeof Auth !== 'undefined' && Auth.setSession) {
            Auth.setSession(data.token, data.user);
          } else if (data.token) {
            localStorage.setItem('pexideal_token', data.token);
            localStorage.setItem('pexideal_client_token', data.token);
            if (data.user) localStorage.setItem('pexideal_user', JSON.stringify(data.user));
          }

          const card = data.card || {
            cardNumber: 'DC-' + Math.floor(1000 + Math.random() * 9000) + '-2026',
            qrCodeToken: data.token || 'PEXIDEAL-PASS-DEFAULT',
            tierName: tierName
          };

          localStorage.setItem('pexideal_card', JSON.stringify(card));

          // 2. Populate Issued View UI
          const userFirstNameEl = document.getElementById('user-first-name');
          const issuedTierBadge = document.getElementById('issued-tier-badge');
          const issuedCardNumber = document.getElementById('issued-card-number');

          if (userFirstNameEl) userFirstNameEl.textContent = firstName || 'Member';
          if (issuedTierBadge) issuedTierBadge.textContent = tierName === 'vip' ? 'VIP Pass' : 'Standard Pass';
          if (issuedCardNumber && card.cardNumber) issuedCardNumber.textContent = card.cardNumber;

          // Generate QR code token in target div
          renderIssuedCard(card, payload.fullName);

          // 3. Perform View Switch with Smooth CSS Entrance
          const formContainer = document.getElementById('form-container');
          const previewPlaceholder = document.getElementById('preview-placeholder');
          const issuedPassContainer = document.getElementById('issued-pass-container');

          if (previewPlaceholder) previewPlaceholder.classList.add('d-none');

          if (formContainer) {
            formContainer.classList.add('d-none');
            const rightCol = issuedPassContainer?.closest('.col-lg-5');
            if (rightCol) {
              rightCol.classList.remove('col-lg-5');
              rightCol.classList.add('col-lg-6', 'mx-auto');
            }
          }

          if (issuedPassContainer) {
            issuedPassContainer.classList.remove('d-none');
            setTimeout(() => {
              issuedPassContainer.classList.add('pass-active');
            }, 20);
          }

          // 4. Redirect after 3-second pass display
          setTimeout(() => {
            window.location.href = 'dashboard.html';
          }, 3000);
        }
      } catch (err) {
        displayFormError(errorAlert, errorMessage, err.message || 'Client registration failed.');
        setButtonLoading(submitBtn, false);
      }
    });
  }
});