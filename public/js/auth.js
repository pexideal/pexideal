/**
 * Authentication & Registration Handlers
 * File: js/auth.js
 */

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

  function setBtnLoading(btn, loading) {
    if (!btn) return;
    btn.disabled = loading;
    if (loading) {
      btn.dataset.txt = btn.innerHTML;
      btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Processing...`;
    } else if (btn.dataset.txt) {
      btn.innerHTML = btn.dataset.txt;
    }
  }

  function showError(msg) {
    const alertBox = document.getElementById('auth-alert') || document.getElementById('error-alert');
    const msgEl = document.getElementById('error-message');
    if (alertBox) {
      alertBox.className = 'alert alert-danger rounded-3 py-2 px-3 small mb-3';
      if (msgEl) msgEl.textContent = msg; else alertBox.textContent = msg;
      alertBox.classList.remove('d-none');
    } else alert(msg);
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
    if (typeof apiFetch === 'function') return await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(body) });
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) throw new Error(data.message || 'Request failed');
    return data;
  }

  // Live Input Sync
  ['first-name', 'last-name'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
      const name = `${getVal('first-name')} ${getVal('last-name')}`.trim();
      const label = document.getElementById('card-name-label');
      if (label) label.textContent = name || 'Your Name Here';
    });
  });

  // Login Form
  const loginForm = document.getElementById('client-login-form') || document.getElementById('affiliate-login-form');
  loginForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = loginForm.querySelector('button[type="submit"]');
    const identifier = getVal('login-identifier') || getVal('signin-email') || getVal('email');
    const password = document.getElementById('login-password')?.value || document.getElementById('password')?.value || '';

    setBtnLoading(btn, true);
    try {
      const data = await postAuth('/api/auth/client/login', { identifier, email: identifier, password });
      if (data.success) {
        localStorage.setItem('pexideal_token', data.token);
        if (data.user) localStorage.setItem('pexideal_user', JSON.stringify(data.user));
        setTimeout(() => window.location.href = 'dashboard.html', 400);
      }
    } catch (err) {
      showError(err.message);
    } finally {
      setBtnLoading(btn, false);
    }
  });

  // Signup Form
  const signupForm = document.getElementById('signup-form') || document.getElementById('client-signup-form');
  signupForm?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = signupForm.querySelector('button[type="submit"]');
    const tier = document.querySelector('.tier-option.selected')?.getAttribute('data-tier') || 'standard';
    const fName = getVal('first-name');
    const lName = getVal('last-name');
    const fullName = `${fName} ${lName}`.trim();

    const payload = {
      firstName: fName, lastName: lName, fullName,
      email: getVal('email'), phone: getVal('phone'),
      password: document.getElementById('password')?.value || '',
      tier, tierName: tier, role: 'client'
    };

    setBtnLoading(btn, true);
    try {
      const data = await postAuth('/api/auth/client/signup', payload);
      if (data.success) {
        localStorage.setItem('pexideal_token', data.token);
        if (data.user) localStorage.setItem('pexideal_user', JSON.stringify(data.user));

        const card = data.card || { cardNumber: 'DC-' + Math.floor(1000 + Math.random() * 9000), qrCodeToken: data.token, tierName: tier };
        localStorage.setItem('pexideal_card', JSON.stringify(card));

        renderPass(card, fullName);
        document.getElementById('form-container')?.classList.add('d-none');
        document.getElementById('issued-pass-container')?.classList.remove('d-none');
