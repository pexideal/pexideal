/**
 * Client Portal Logic
 * File: public/client/client.js
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Auth Enforcement & Guard
  const hasAuthObj = typeof Auth !== 'undefined' && typeof Auth.isLoggedIn === 'function';
  const hasToken = localStorage.getItem('pexideal_client_token') || localStorage.getItem('pexideal_token');

  if ((hasAuthObj && !Auth.isLoggedIn()) || (!hasAuthObj && !hasToken)) {
    window.location.href = '/login.html';
    return;
  }

  // 2. DOM Selectors
  const welcomeText = document.getElementById('welcomeText');
  const cardNumber = document.getElementById('cardNumber');
  const cardHolder = document.getElementById('cardHolder');
  const cardStatus = document.getElementById('cardStatus');
  const cardExpiry = document.getElementById('cardExpiry');
  const qrcodeContainer = document.getElementById('qrcode');
  const refreshQrBtn = document.getElementById('refreshQrBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const qrTimer = document.getElementById('qrTimer');
  const qrProgressBar = document.getElementById('qrProgressBar');

  // Timer & QR state constants
  const ROTATION_INTERVAL_SEC = 60;
  let remainingSeconds = ROTATION_INTERVAL_SEC;
  let timerInterval = null;
  let qrCodeInstance = null;

  // 3. Helper: Fetch wrapper fallback if apiFetch is not globally exposed
  async function fetchPassData() {
    if (typeof apiFetch === 'function') {
      return await apiFetch('/api/cards/my-card');
    }

    const token = localStorage.getItem('pexideal_client_token') || localStorage.getItem('pexideal_token');
    const response = await fetch('/api/cards/my-card', {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    return await response.json();
  }

  // 4. Fetch and Render Pass Data
  async function loadPassData() {
    try {
      // Set User Display Info
      if (typeof Auth !== 'undefined' && typeof Auth.getUser === 'function') {
        const user = Auth.getUser();
        if (user && (user.fullName || user.name)) {
          const name = user.fullName || user.name;
          if (welcomeText) welcomeText.textContent = `Welcome back, ${name}!`;
          if (cardHolder) cardHolder.textContent = name;
        }
      }

      // Fetch Card payload
      const res = await fetchPassData();

      if (res && res.success && res.card) {
        const { card } = res;

        if (cardNumber) cardNumber.textContent = card.cardNumber || 'PEXI-0000-0000-0000';
        if (cardHolder && card.holderName) cardHolder.textContent = card.holderName;

        // Status Badge Formatting
        if (cardStatus && card.status) {
          const statusUpper = card.status.toUpperCase();
          cardStatus.textContent = statusUpper;

          cardStatus.className = 'badge px-2 py-1 fs-7 ';
          if (statusUpper === 'ACTIVE') {
            cardStatus.classList.add('bg-success');
          } else if (statusUpper === 'EXPIRED') {
            cardStatus.classList.add('bg-danger');
          } else {
            cardStatus.classList.add('bg-warning', 'text-dark');
          }
        }

        // Expiry Date Formatting
        if (cardExpiry && card.expiresAt) {
          const expDate = new Date(card.expiresAt);
          cardExpiry.textContent = isNaN(expDate.getTime()) 
            ? card.expiresAt 
            : expDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        }

        // QR Code Generation
        if (card.qrToken) {
          renderQrCode(card.qrToken);
          resetCountdownTimer();
        }
      } else {
        console.warn('Card details missing or inactive pass response:', res);
        renderQrCodeFallback('NO_ACTIVE_PASS');
      }
    } catch (err) {
      console.error('Failed to load card data:', err);
      renderQrCodeFallback('ERROR');
    }
  }

  // 5. Render Dynamic QR Code
  function renderQrCode(tokenString) {
    if (!qrcodeContainer) return;

    qrcodeContainer.innerHTML = '';
    
    if (typeof QRCode !== 'undefined') {
      qrCodeInstance = new QRCode(qrcodeContainer, {
        text: tokenString,
        width: 170,
        height: 170,
        colorDark: '#0f172a',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
      });
    } else {
      qrcodeContainer.innerText = tokenString;
    }
  }

  function renderQrCodeFallback(reason) {
    if (!qrcodeContainer) return;
    qrcodeContainer.innerHTML = `
      <div class="text-center p-3 text-muted" style="width: 170px; height: 170px; display: flex; align-items: center; justify-content: center;">
        <small class="fw-semibold">${reason === 'NO_ACTIVE_PASS' ? 'No Pass Found' : 'QR Unavailable'}</small>
      </div>
    `;
  }

  // 6. Countdown Timer & Auto Rotation Logic
  function startCountdownTimer() {
    if (timerInterval) clearInterval(timerInterval);

    timerInterval = setInterval(() => {
      remainingSeconds--;

      if (qrTimer) qrTimer.textContent = `${remainingSeconds}s`;

      if (qrProgressBar) {
        const percent = (remainingSeconds / ROTATION_INTERVAL_SEC) * 100;
        qrProgressBar.style.width = `${percent}%`;
      }

      if (remainingSeconds <= 0) {
        loadPassData();
      }
    }, 1000);
  }

  function resetCountdownTimer() {
    remainingSeconds = ROTATION_INTERVAL_SEC;
    if (qrTimer) qrTimer.textContent = `${remainingSeconds}s`;
    if (qrProgressBar) qrProgressBar.style.width = '100%';
    startCountdownTimer();
  }

  // 7. Event Handlers
  refreshQrBtn?.addEventListener('click', () => {
    refreshQrBtn.disabled = true;
    refreshQrBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Updating...';

    loadPassData().finally(() => {
      setTimeout(() => {
        refreshQrBtn.disabled = false;
        refreshQrBtn.innerHTML = '<i class="bi bi-arrow-clockwise me-1"></i> Refresh QR Token';
      }, 500);
    });
  });

  logoutBtn?.addEventListener('click', () => {
    if (typeof Auth !== 'undefined' && typeof Auth.logout === 'function') {
      Auth.logout();
    } else {
      localStorage.removeItem('pexideal_client_token');
      localStorage.removeItem('pexideal_token');
      localStorage.removeItem('pexideal_user');
    }
    window.location.href = '/login.html';
  });

  // 8. Initial Execution
  await loadPassData();
});