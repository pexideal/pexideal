/**
 * Authentication & Registration Handlers
 * File: js/auth.js
 */

document.addEventListener('DOMContentLoaded', () => {

  // Helper: Toggle button loading state during API calls
  function setButtonLoading(buttonEl, isLoading, defaultText = 'Submit') {
    if (!buttonEl) return;
    if (isLoading) {
      buttonEl.disabled = true;
      buttonEl.dataset.originalText = buttonEl.innerHTML;
      buttonEl.innerHTML = `
        <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
        Processing...
      `;
    } else {
      buttonEl.disabled = false;
      buttonEl.innerHTML = buttonEl.dataset.originalText || defaultText;
    }
  }

  // --- 1. Login Form Handler (login.html / signin.html) ---
  const loginForm = document.getElementById('signin-form') || document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const submitBtn = loginForm.querySelector('button[type="submit"]');
      const email = document.getElementById('signin-email')?.value.trim();
      const password = document.getElementById('signin-password')?.value;
      const errorAlert = document.getElementById('error-alert');
      const errorMessage = document.getElementById('error-message');

      if (errorAlert) errorAlert.classList.add('d-none');
      setButtonLoading(submitBtn, true);

      try {
        const data = await apiFetch('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password })
        });

        if (data.success) {
          Auth.setSession(data.token, data.user);
          
          // Redirect based on user role
          if (data.user.role === 'merchant') {
            window.location.href = 'interface/cashier-scanner.html';
          } else {
            window.location.href = 'index.html';
          }
        }
      } catch (err) {
        if (errorMessage && errorAlert) {
          errorMessage.textContent = err.message || 'Invalid credentials. Please try again.';
          errorAlert.classList.remove('d-none');
        }
      } finally {
        setButtonLoading(submitBtn, false);
      }
    });
  }

  // --- 2. Client Signup Handler (signup.html / client-signup.html) ---
  const clientForm = document.getElementById('client-signup-form') || document.getElementById('signup-form');
  if (clientForm) {
    clientForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const submitBtn = clientForm.querySelector('button[type="submit"]');
      const selectedTierEl = document.querySelector('.tier-option.selected');
      const tierName = selectedTierEl ? selectedTierEl.getAttribute('data-tier') : 'standard';

      const payload = {
        firstName: document.getElementById('first-name')?.value.trim(),
        lastName: document.getElementById('last-name')?.value.trim(),
        email: document.getElementById('email')?.value.trim(),
        phone: document.getElementById('phone')?.value.trim() || '',
        password: document.getElementById('password')?.value,
        tierName: tierName,
        role: 'client'
      };

      setButtonLoading(submitBtn, true);

      try {
        const data = await apiFetch('/api/auth/register-client', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (data.success) {
          Auth.setSession(data.token, data.user);

          // If signup page has instant issued card UI container, populate it before redirecting
          const issuedContainer = document.getElementById('issued-pass-container');
          const formContainer = document.getElementById('form-container');

          if (issuedContainer && formContainer) {
            // Read values safely regardless of property naming
            const userFirstName = data.user?.first_name || data.user?.firstName || payload.firstName;
            const cardCode = data.user?.cardCode || data.card?.cardNumber || data.card?.cardCode || 'PEX-000000';
            const qrToken = data.card?.qrCodeToken || cardCode;

            // 1. Set DOM Text Elements
            const nameEl = document.getElementById('user-first-name');
            const cardNumEl = document.getElementById('issued-card-number');
            if (nameEl) nameEl.textContent = userFirstName;
            if (cardNumEl) cardNumEl.textContent = cardCode;
            
            // 2. Generate and display the QR Code
            const qrImgEl = document.getElementById('issued-qr');
            if (qrImgEl) {
              const qrData = `PEXIDEAL:${qrToken}:${cardCode}`;
              qrImgEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qrData)}`;
            }

            // 3. Swap view states
            formContainer.classList.add('d-none');
            document.getElementById('preview-placeholder')?.classList.add('d-none');
            issuedContainer.classList.remove('d-none');
          } else {
            window.location.href = 'index.html';
          }
        }
      } catch (err) {
        alert(err.message || 'Client registration failed.');
      } finally {
        setButtonLoading(submitBtn, false);
      }
    });
  }

  // --- 3. Merchant Onboarding Handler (merch-signup.html) ---
  const merchForm = document.getElementById('merch-signup-form');
  if (merchForm) {
    merchForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const submitBtn = merchForm.querySelector('button[type="submit"]');
      const payload = {
        businessName: document.getElementById('business-name')?.value.trim(),
        category: document.getElementById('business-category')?.value,
        email: document.getElementById('merch-email')?.value.trim(),
        password: document.getElementById('merch-password')?.value,
        role: 'merchant'
      };

      setButtonLoading(submitBtn, true);

      try {
        const data = await apiFetch('/api/auth/register-merchant', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (data.success) {
          Auth.setSession(data.token, data.user);
          window.location.href = 'interface/cashier-scanner.html';
        }
      } catch (err) {
        alert(err.message || 'Merchant registration failed.');
      } finally {
        setButtonLoading(submitBtn, false);
      }
    });
  }

});