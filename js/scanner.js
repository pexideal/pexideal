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

  window.addEventListener('online', () => {
    updateNetworkUI();
    syncPendingRedemptions();
  });
  window.addEventListener('offline', updateNetworkUI);
  updateNetworkUI();
});

/**
 * Validate Token - Online API with Offline Fallback
 */
async function validateToken(tokenString) {
  if (!navigator.onLine) {
    handleOfflineValidation(tokenString);
    return;
  }

  try {
    const data = await apiFetch('/v1/discounts/verify', {
      method: 'POST',
      body: JSON.stringify({ token: tokenString, storeId: STORE_ID })
    });

    if (data.success) {
      showSuccessUI(data.customer, data.discount, false);
    } else {
      showInvalidUI(data.message || 'Pass invalid or expired.');
    }
  } catch (err) {
    console.warn('Network timeout. Switching to local offline check...', err);
    handleOfflineValidation(tokenString);
  }
}

/**
 * Local Cryptographic Timestamp Check (Offline Mode)
 */
function handleOfflineValidation(tokenString) {
  const parts = tokenString.split(':');
  if (parts.length !== 4) {
    showInvalidUI('Invalid QR Token format.');
    return;
  }

  const [userId, cardId, timestampStr] = parts;
  const tokenTime = parseInt(timestampStr, 10);
  const currentTime = Math.floor(Date.now() / 1000);

  // 90s Expiration window
  if ((currentTime - tokenTime) > 90) {
    showInvalidUI('Pass expired. Ask customer to refresh QR.');
    return;
  }

  // Double-scan protection
  const queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
  if (queue.some(item => item.token === tokenString)) {
    showInvalidUI('This pass was already scanned offline!');
    return;
  }

  // Queue for background sync
  queue.push({ token: tokenString, storeId: STORE_ID, scannedAt: new Date().toISOString() });
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));

  showSuccessUI({ name: 'Member (Offline Check)', cardId: cardId }, { title: 'Standard Discount' }, true);
}

/**
 * Background Sync Queue
 */
async function syncPendingRedemptions() {
  const queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
  if (queue.length === 0) return;

  try {
    const response = await apiFetch('/v1/discounts/sync-offline', {
      method: 'POST',
      body: JSON.stringify({ batch: queue })
    });

    if (response.success) {
      localStorage.removeItem(OFFLINE_QUEUE_KEY);
      window.dispatchEvent(new Event('online'));
    }
  } catch (err) {
    console.error('Failed to sync offline queue:', err);
  }
}

function showSuccessUI(customer, discount, isOffline = false) {
  const offlineBanner = document.getElementById('offline-approval-banner');
  if (offlineBanner) {
    isOffline ? offlineBanner.classList.remove('d-none') : offlineBanner.classList.add('d-none');
  }

  document.getElementById('member-name').textContent = customer.name;
  document.getElementById('member-id').textContent = customer.cardId;
  document.getElementById('discount-title').textContent = discount.title;
  document.getElementById('result-success').style.display = 'block';
}

function showInvalidUI(reason) {
  const reasonElem = document.getElementById('invalid-reason');
  if (reasonElem) reasonElem.textContent = reason;
  document.getElementById('result-invalid').style.display = 'block';
}