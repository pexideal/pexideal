/**
 * Authentication & Registration Handlers (Client & Merchant Integrated)
 * File: js/auth.js
 */

const AUTH_TOKEN_KEY = 'pexideal_partner_token';
const AUTH_USER_KEY = 'pexideal_partner_user';
const CLIENT_TOKEN_KEY = 'pexideal_token';
const CLIENT_USER_KEY = 'pexideal_user';

// Global function to toggle pass tier selection in client forms
window.selectTier = function (el) {
  if (!el) return;
  document.querySelectorAll('.tier-option').forEach(t => t.classList.remove('selected'));
  el.classList.add('selected');

  const tier = el.getAttribute('data-tier') || 'standard';
  const label = document.getElementById('card-tier-label');
  const card = document.getElementById('digital-card');

  if (label) label.textContent = tier === 'vip' ? 'VIP ALL-ACCESS PASS' : 'STANDARD PASS';
  if (card) card.classList.toggle('vip', tier === 'vip');
};

document.addEventListener('DOMContentLoaded', () => {

  const getVal = id => document.getElementById(id)?.value.trim() || '';

  function setBtnLoading(btn, loading, defaultText = null) {
    if (!btn) return;
    btn.disabled = loading;
    if (loading) {
      if (!btn.dataset.txt) btn.dataset.txt = btn.innerHTML;
      btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span> Processing...`;
    } else {
      btn.innerHTML = defaultText || btn.dataset.txt || 'Submit';
    }
  }

  function showError(msg, type = 'danger') {
    const alertBox = document.getElementById('auth-alert') || 
                     document.getElementById('error-alert') || 
                     document.getElementById('auth-error');
    const msgEl = document.getElementById('error-message');
    
    if (alertBox) {
      alertBox.className = `alert alert-${type} rounded-3 py-2 px-3 small mb-3`;
      if (msgEl) msgEl.textContent = msg; else alertBox.textContent = msg;
      alertBox.classList.remove('d-none');
    } else {
      alert(msg);
    }
  }

  function renderPass(cardData, fullName) {
    const numEl = document.getElementById('card-number-label');
    const nameEl = document.getElementById('card-name-label');
    const tierEl = document.getElementById('card-tier-label');
    const qrBox = document.getElementById('issued-qr');

    if (numEl && cardData?.cardNumber) numEl.textContent = cardData.cardNumber;
    if (nameEl && fullName) nameEl.textContent = fullName;
    if (tierEl && cardData?.tierName) tierEl.textContent = cardData.tierName === 'vip' ? 'VIP ALL-ACCESS PASS' : 'STANDARD PASS';

    if (qrBox && cardData?.qrCodeToken) {
      qrBox.innerHTML = '';
      if (typeof QRCode !== 'undefined') {
        new QRCode(qrBox, { text: cardData.qrCodeToken, width: 130, height: 130 });
      } else {
        qrBox.innerHTML = `<img src="https://quickchart.io/qr?text=${encodeURIComponent(cardData.qrCodeToken)}&size=130" style="width:100%"/>`;
      }
    }
  }

  async function postAuth(endpoint, body) {
    if (typeof apiFetch === 'function') {
      return await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(body) });
    }
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.message || 'Request failed');
    }
    return data;
  }

  // Live Input Sync for Digital Cards
  ['first-name', 'last-name'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
      const name = `${getVal('first-name')} ${getVal('last-name')}`.trim();
      const label = document.getElementById('card-name-label');
      if (label) label.textContent = name || 'Your Name Here';
    });
  });

  // ==========================================
  // 1. LOGIN FORM HANDLER (Client & Merchant)
  // ==========================================
  const loginForm = document.getElementById('client-login-form') || document.getElementById('affiliate-login-form');
  loginForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = loginForm.querySelector('button[type="submit"]') || document.getElementById('btn-submit');
    
    const isMerchant = loginForm.id === 'affiliate-login-form';
    const identifier = getVal('login-identifier') || getVal('signin-email') || getVal('email');
    const password = document.getElementById('login-password')?.value || document.getElementById('password')?.value || '';
    const rememberMe = document.getElementById('remember-me')?.checked || false;

    if (!identifier || !password) {
      showError('Please enter both your credentials and password.');
      return;
    }

    setBtnLoading(btn, true);

    try {
      const endpoint = isMerchant ? '/api/merchant/auth/login' : '/api/auth/client/login';
      const data = await postAuth(endpoint, { identifier, email: identifier, password, rememberMe });

      if (data.success) {
        showError(data.message || 'Authentication successful! Redirecting...', 'success');

        const storage = rememberMe ? localStorage : sessionStorage;
        if (isMerchant) {
          storage.setItem(AUTH_TOKEN_KEY, data.token);
          if (data.merchant || data.user) storage.setItem(AUTH_USER_KEY, JSON.stringify(data.merchant || data.user));
        } else {
          storage.setItem(CLIENT_TOKEN_KEY, data.token);
          if (data.user) storage.setItem(CLIENT_USER_KEY, JSON.stringify(data.user));
          if (data.card) localStorage.setItem('pexideal_card', JSON.stringify(data.card));
        }

        setTimeout(() => {
          window.location.href = data.redirectUrl || 'dashboard.html';
        }, 800);
      }
    } catch (err) {
      showError(err.message || 'Login failed. Please verify your credentials.');
      setBtnLoading(btn, false, isMerchant ? 'Open Merchant Terminal' : 'Sign In');
    }
  });

  // ==========================================
  // 2. SIGNUP FORM HANDLER (Client & Merchant)
  // ==========================================
  const signupForm = document.getElementById('signup-form') || 
                     document.getElementById('client-signup-form') || 
                     document.getElementById('affiliate-signup-form');

  signupForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = signupForm.querySelector('button[type="submit"]') || document.getElementById('btn-submit');
    const isMerchant = signupForm.id === 'affiliate-signup-form';

    setBtnLoading(btn, true);

    try {
      if (isMerchant) {
        // --- Merchant Registration ---
        const businessName = getVal('business-name');
        const category = document.getElementById('business-category')?.value;
        const location = getVal('store-location');
        const website = getVal('store-website');
        const discountType = document.getElementById('discount-type')?.value;
        const offerHeadline = getVal('discount-value');
        const offerTerms = getVal('offer-terms');

        const fullName = getVal('contact-name');
        const roleTitle = getVal('contact-role');
        const email = getVal('contact-email');
        const phone = getVal('contact-phone');
        const password = document.getElementById('contact-password')?.value || '';
        const confirmPassword = document.getElementById('confirm-password')?.value || '';

        if (!businessName || !category || !location || !discountType || !offerHeadline || 
            !fullName || !roleTitle || !email || !phone || !password || !confirmPassword) {
          throw new Error('Please complete all required fields (*).');
        }

        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters long.');
        }

        if (password !== confirmPassword) {
          throw new Error('Passwords do not match.');
        }

        const merchantPayload = {
          businessName, category, location, website,
          offer: { type: discountType, headline: offerHeadline, terms: offerTerms },
          contact: { fullName, roleTitle, email, phone },
          password
        };

        const data = await postAuth('/api/merchant/auth/signup', merchantPayload);

        if (data.success) {
          const formContainer = document.getElementById('form-container');
          const formSuccess = document.getElementById('form-success');

          if (formContainer && formSuccess) {
            formContainer.classList.add('d-none');
            formSuccess.classList.remove('d-none');
          }

          if (data.token) {
            sessionStorage.setItem(AUTH_TOKEN_KEY, data.token);
            if (data.merchant) sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.merchant));
          }
        }

      } else {
        // --- Client / Passholder Registration ---
        const tier = document.querySelector('.tier-option.selected')?.getAttribute('data-tier') || 'standard';
        const fName = getVal('first-name');
        const lName = getVal('last-name');
        const fullName = `${fName} ${lName}`.trim();
        const password = document.getElementById('password')?.value || '';

        if ((!fName && !fullName) || !password) {
          throw new Error('Please fill in required fields.');
        }

        const clientPayload = {
          firstName: fName, lastName: lName, fullName,
          email: getVal('email'), phone: getVal('phone'),
          password, tier, tierName: tier, role: 'client'
        };

        const data = await postAuth('/api/auth/client/signup', clientPayload);

        if (data.success) {
          localStorage.setItem(CLIENT_TOKEN_KEY, data.token);
          if (data.user) localStorage.setItem(CLIENT_USER_KEY, JSON.stringify(data.user));

          const card = data.card || { cardNumber: 'DC-' + Math.floor(1000 + Math.random() * 9000), qrCodeToken: data.token, tierName: tier };
          localStorage.setItem('pexideal_card', JSON.stringify(card));

          renderPass(card, fullName);
          document.getElementById('form-container')?.classList.add('d-none');
          document.getElementById('issued-pass-container')?.classList.remove('d-none');

          setTimeout(() => window.location.href = 'dashboard.html', 2500);
        }
      }
    } catch (err) {
      showError(err.message);
      setBtnLoading(btn, false, isMerchant ? 'Submit Affiliate Application <i class="bi bi-arrow-right ms-2"></i>' : 'Create Account');
    }
  });
});