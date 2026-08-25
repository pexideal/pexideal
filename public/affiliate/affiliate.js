/**
 * Affiliate / Merchant Terminal Logic
 * File: public/affiliate/affiliate.js
 */

document.addEventListener('DOMContentLoaded', () => {
  const verifyForm = document.getElementById('verifyForm');
  const qrInput = document.getElementById('qrInput');
  const resultBanner = document.getElementById('resultBanner');
  const syncOfflineBtn = document.getElementById('syncOfflineBtn');
  const offlineQueueBadge = document.getElementById('offlineQueueBadge');

  // Retrieve current active merchant/store context from auth helper
  const currentMerchant = typeof Auth !== 'undefined' ? Auth.getCurrentUser() : null;
  const storeId = currentMerchant?.storeId || currentMerchant?.id || 'store_branch_1';

  // Update offline queue UI indicator on launch
  updateOfflineQueueUI();

  // Handle pass/QR code verification submission
  verifyForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = qrInput?.value.trim();

    if (!token) return;

    // Optional UI Loading State
    setLoadingState(true);

    try {
      // Use standard global apiFetch utility or fallback to browser fetch
      const fetchApi = typeof apiFetch === 'function' ? apiFetch : defaultApiFetch;

      const response = await fetchApi('/v1/discounts/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, storeId })
      });

      if (response && response.success) {
        const customerName = response.customer?.name || response.data?.customerName || 'Customer';
        const passDetails = response.discount?.title ? ` (${response.discount.title})` : '';
        showResult(`✅ Verified! ${customerName}${passDetails}`, 'success');
        if (qrInput) qrInput.value = '';
      } else {
        const errorMsg = response?.message || 'Invalid or expired pass.';
        showResult(`❌ Verification Failed: ${errorMsg}`, 'danger');
      }
    } catch (error) {
      console.warn('Network request failed. Falling back to offline queue storage:', error);
      
      // Save locally if network call fails
      saveOfflineRedemption(token, storeId);
      showResult('⚠️ Saved offline. Pass will sync when internet connection restores.', 'warning');
      if (qrInput) qrInput.value = '';
    } finally {
      setLoadingState(false);
    }
  });

  // Display status feedback banner in the terminal UI
  function showResult(msg, type = 'info') {
    if (!resultBanner) return;

    // Reset previous alert classes
    resultBanner.className = `alert alert-${type} alert-dismissible fade show mt-3`;
    resultBanner.innerHTML = `
      <span>${msg}</span>
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    resultBanner.style.display = 'block';

    // Auto-scroll into view if necessary
    resultBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Save redemption locally in localStorage queue
  function saveOfflineRedemption(token, currentStoreId) {
    const queue = JSON.parse(localStorage.getItem('pexideal_offline_queue') || '[]');
    queue.push({
      token,
      storeId: currentStoreId,
      scannedAt: new Date().toISOString()
    });
    localStorage.setItem('pexideal_offline_queue', JSON.stringify(queue));
    updateOfflineQueueUI();
  }

  // Sync queued offline redemptions to backend server
  async function syncOfflineQueue() {
    const queue = JSON.parse(localStorage.getItem('pexideal_offline_queue') || '[]');
    
    if (queue.length === 0) {
      showResult('ℹ️ No offline redemptions queued for sync.', 'info');
      return;
    }

    try {
      const fetchApi = typeof apiFetch === 'function' ? apiFetch : defaultApiFetch;

      const res = await fetchApi('/v1/discounts/sync-offline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch: queue })
      });

      if (res && res.success) {
        const syncedCount = res.syncedCount || queue.length;
        localStorage.removeItem('pexideal_offline_queue');
        updateOfflineQueueUI();
        showResult(`🎉 Successfully synced ${syncedCount} offline redemption(s)!`, 'success');
      } else {
        showResult(`⚠️ Sync completed with errors: ${res?.message || 'Check terminal server log'}`, 'warning');
      }
    } catch (err) {
      console.error('Offline batch sync error:', err);
      showResult('❌ Sync failed. Please verify internet connectivity.', 'danger');
    }
  }

  // Manual Trigger: Sync Offline Button
  syncOfflineBtn?.addEventListener('click', () => {
    syncOfflineQueue();
  });

  // Auto Trigger: Listen for network connectivity restoration
  window.addEventListener('online', () => {
    const queue = JSON.parse(localStorage.getItem('pexideal_offline_queue') || '[]');
    if (queue.length > 0) {
      showResult('🌐 Connection restored. Syncing pending offline redemptions...', 'info');
      syncOfflineQueue();
    }
  });

  // Helper: Update UI badge/button status for queued offline records
  function updateOfflineQueueUI() {
    const queue = JSON.parse(localStorage.getItem('pexideal_offline_queue') || '[]');
    
    if (offlineQueueBadge) {
      offlineQueueBadge.textContent = queue.length;
      offlineQueueBadge.classList.toggle('d-none', queue.length === 0);
    }

    if (syncOfflineBtn) {
      syncOfflineBtn.disabled = queue.length === 0;
      if (queue.length > 0) {
        syncOfflineBtn.classList.add('btn-warning');
      } else {
        syncOfflineBtn.classList.remove('btn-warning');
      }
    }
  }

  // Helper: Disable submit button during active network requests
  function setLoadingState(isLoading) {
    const submitBtn = verifyForm?.querySelector('button[type="submit"]');
    if (!submitBtn) return;

    if (isLoading) {
      submitBtn.disabled = true;
      submitBtn.dataset.originalText = submitBtn.innerHTML;
      submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span> Verifying...`;
    } else {
      submitBtn.disabled = false;
      if (submitBtn.dataset.originalText) {
        submitBtn.innerHTML = submitBtn.dataset.originalText;
      }
    }
  }

  // Fallback API Fetch utility if global apiFetch is unavailable
  async function defaultApiFetch(endpoint, options = {}) {
    const baseUrl = typeof CONFIG !== 'undefined' ? CONFIG.API_BASE_URL : '';
    const token = localStorage.getItem('pexideal_token');

    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...options.headers
    };

    const response = await fetch(`${baseUrl}${endpoint}`, { ...options, headers });
    return await response.json();
  }
});