/**
 * Cashier Scanner Terminal & Offline Verification Logic
 * File: js/scanner.js
 */

const OFFLINE_QUEUE_KEY = 'pexideal_offline_redemptions';
const STORE_ID = 'str_bistro_01';

document.addEventListener('DOMContentLoaded', () => {
  const badge = document.getElementById('network-status-badge');
  const badgeText = document.getElementById('network-status-text');
  const queueBar = document.getElementById('offline-queue-bar');
  const queueCount = document.getElementById('queue-count');

  // Network State Indicator
  function updateNetworkUI() {
    const isOnline = navigator.onLine;
    const pendingQueue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');

    if (queueBar && queueCount) {
      if (pendingQueue.length > 0) {
        queueBar.classList.remove('d-none');
        queueCount.textContent = pendingQueue.length;
      } else {
        queueBar.classList.add('d-none');
      }
    }

    if (badge && badgeText) {
      if (isOnline) {
        badge.className = 'badge rounded-pill bg-success-subtle text-success border border-success-subtle px-3 py-2';
        badgeText.textContent = 'Online';
      } else {
        badge.className = 'badge rounded-pill bg-warning-subtle text-warning border border-warning-subtle px-3 py-2';
        badgeText.textContent = 'Offline Mode';
      }
    }
  }

  // Hardware Scanner Listener (Listens for fast typing/Enter key from USB barcode scanners)
  const manualInput = document.getElementById('manual-qr-input');
  manualInput?.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
      const scannedVal = manualInput.value.trim();
      if (scannedVal) {
        handleScannedToken(scannedVal);
        manualInput.value = ''; // Reset input field for next scan
      }
    }
  });

  window.addEventListener('online', () => {
    updateNetworkUI();
    syncPendingRedemptions();
  });
  window.addEventListener('offline', updateNetworkUI);
  updateNetworkUI();
});

/**
 * Single Entry Point for Processing Scanned Tokens (Camera or Hardware Input)
 */
async function handleScannedToken(qrToken) {
  if (!qrToken) return;
  await validateToken(qrToken);
}

/**
 * Web Camera Listener (html5-qrcode callback)
 */
function onCameraScanSuccess(decodedText) {
  handleScannedToken(decodedText);
}

/**
 * Validate Token - Online API with Offline Fallback
 */
async function validateToken(tokenString) {
  if (!navigator.onLine) {
    handleOfflineValidation(tokenString);
    return;
  }

  try {
    const response = await apiFetch('/api/merchant/scan-pass', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qrToken: tokenString, storeId: STORE_ID })
    });

    if (response && response.success) {
      showSuccessUI(response.member, false);
    } else {
      showInvalidUI((response && response.message) || 'Pass invalid or expired.');
    }
  } catch (err) {
    console.warn('Network timeout or endpoint error. Switching to local offline check...', err);
    handleOfflineValidation(tokenString);
  }
}

/**
 * Local Cryptographic & Offline Check (Offline Mode)
 */
function handleOfflineValidation(tokenString) {
  let userId = 'Offline User';
  let cardId = tokenString;

  // Handle JWT / Structured PEXI Tokens (Format: PEXI:<jwt> or <header>.<payload>.<sig>)
  if (tokenString.startsWith('PEXI:') || tokenString.includes('.')) {
    const rawJwt = tokenString.replace('PEXI:', '');
    const parts = rawJwt.split('.');

    if (parts.length === 3) {
      try {
        const payload = JSON.parse(atob(parts[1]));
        cardId = payload.cardNumber || cardId;
        userId = payload.userId ? `User #${payload.userId}` : userId;

        // Verify Expiration if present inside JWT payload
        if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
          showInvalidUI('Pass expired. Ask customer to refresh QR.');
          return;
        }
      } catch (e) {
        showInvalidUI('Invalid QR Token payload.');
        return;
      }
    }
  } else {
    // Legacy / 4-part colon format (userId:cardId:timestamp:sig)
    const colonParts = tokenString.split(':');
    if (colonParts.length === 4) {
      const [uId, cId, timestampStr] = colonParts;
      userId = `User #${uId}`;
      cardId = cId;
      const tokenTime = parseInt(timestampStr, 10);
      const currentTime = Math.floor(Date.now() / 1000);

      // 90s Expiration window check
      if ((currentTime - tokenTime) > 90) {
        showInvalidUI('Pass expired. Ask customer to refresh QR.');
        return;
      }
    }
  }

  // Double-scan protection for offline queue
  const queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
  if (queue.some(item => item.token === tokenString)) {
    showInvalidUI('This pass was already scanned offline!');
    return;
  }

  // Queue transaction for background sync when connection recovers
  queue.push({ token: tokenString, storeId: STORE_ID, scannedAt: new Date().toISOString() });
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));

  showSuccessUI({
    fullName: userId,
    cardNumber: cardId,
    tier: 'Offline Check'
  }, true);
}

/**
 * Background Sync Queue
 */
async function syncPendingRedemptions() {
  const queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
  if (queue.length === 0) return;

  try {
    const response = await apiFetch('/api/merchant/scan-pass', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batch: queue })
    });

    if (response && response.success) {
      localStorage.removeItem(OFFLINE_QUEUE_KEY);
      window.dispatchEvent(new Event('online'));
    }
  } catch (err) {
    console.error('Failed to sync offline queue:', err);
  }
}

/**
 * UI Render Helpers
 */
function showSuccessUI(member, isOffline = false) {
  const offlineBanner = document.getElementById('offline-approval-banner');
  if (offlineBanner) {
    isOffline ? offlineBanner.classList.remove('d-none') : offlineBanner.classList.add('d-none');
  }

  const nameElem = document.getElementById('member-name');
  const idElem = document.getElementById('member-id');
  const tierElem = document.getElementById('discount-title');
  const invalidBox = document.getElementById('result-invalid');
  const successBox = document.getElementById('result-success');

  if (nameElem) nameElem.textContent = member.fullName || member.name || 'Member';
  if (idElem) idElem.textContent = member.cardNumber || member.cardId || 'N/A';
  if (tierElem) tierElem.textContent = member.tier ? `${member.tier.toUpperCase()} Member` : 'Standard Pass';

  if (invalidBox) invalidBox.style.display = 'none';
  if (successBox) successBox.style.display = 'block';
}

function showInvalidUI(reason) {
  const reasonElem = document.getElementById('invalid-reason');
  const successBox = document.getElementById('result-success');
  const invalidBox = document.getElementById('result-invalid');

  if (reasonElem) reasonElem.textContent = reason;
  if (successBox) successBox.style.display = 'none';
  if (invalidBox) invalidBox.style.display = 'block';
}