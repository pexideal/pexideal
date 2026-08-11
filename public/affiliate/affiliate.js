/**
 * Affiliate / Merchant Terminal Logic
 * File: public/affiliate/affiliate.js
 */

document.addEventListener('DOMContentLoaded', () => {
  const verifyForm = document.getElementById('verifyForm');
  const qrInput = document.getElementById('qrInput');
  const resultBanner = document.getElementById('resultBanner');
  const syncOfflineBtn = document.getElementById('syncOfflineBtn');

  // Verify scanned token string
  verifyForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = qrInput.value.trim();

    if (!token) return;

    try {
      const response = await apiFetch('/v1/discounts/verify', {
        method: 'POST',
        body: JSON.stringify({ token, storeId: 'store_branch_1' })
      });

      if (response.success) {
        showResult(`✅ Verified! Customer: ${response.customer.name}`, 'success');
        qrInput.value = '';
      } else {
        showResult(`❌ Verification Failed: ${response.message}`, 'error');
      }
    } catch (error) {
      // Offline fallback strategy
      saveOfflineRedemption(token);
      showResult('⚠️ Saved offline. Will sync when connection restores.', 'warning');
      qrInput.value = '';
    }
  });

  function showResult(msg, type) {
    resultBanner.textContent = msg;
    resultBanner.className = `alert alert-${type}`;
    resultBanner.style.display = 'block';
  }

  function saveOfflineRedemption(token) {
    const queue = JSON.parse(localStorage.getItem('pexideal_offline_queue') || '[]');
    queue.push({ token, scannedAt: new Date().toISOString() });
    localStorage.setItem('pexideal_offline_queue', JSON.stringify(queue));
  }

  // Batch sync offline redemptions
  syncOfflineBtn?.addEventListener('click', async () => {
    const queue = JSON.parse(localStorage.getItem('pexideal_offline_queue') || '[]');
    if (queue.length === 0) {
      alert('No offline redemptions queued.');
      return;
    }

    try {
      const res = await apiFetch('/v1/discounts/sync-offline', {
        method: 'POST',
        body: JSON.stringify({ batch: queue })
      });

      if (res.success) {
        localStorage.removeItem('pexideal_offline_queue');
        alert(`Successfully synced ${res.syncedCount} redemptions!`);
      }
    } catch (err) {
      alert('Sync failed. Please check internet connection.');
    }
  });
});