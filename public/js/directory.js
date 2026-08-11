/**
 * Affiliate Store Directory & Leaflet Map Controller
 * File: js/directory.js
 */

document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('store-search');
  const filterButtons = document.querySelectorAll('#filter-buttons .btn');
  const storeCards = document.querySelectorAll('.store-card-wrapper');
  const noResultsMsg = document.getElementById('no-results');
  const storeGrid = document.getElementById('store-grid');
  const storeMapContainer = document.getElementById('store-map-container');
  const btnGrid = document.getElementById('btn-view-grid');
  const btnMap = document.getElementById('btn-view-map');

  // Guard clause: Exit if not on directory page
  if (!storeGrid) return;

  let currentCategory = 'all';
  let currentQuery = '';
  let map = null;
  let mapMarkers = [];

  /**
   * Image Fallback Listener
   * Wire placeholder-store.svg to any store images that fail to load
   */
  const storeImages = document.querySelectorAll('.store-card-wrapper img');
  storeImages.forEach(img => {
    img.addEventListener('error', () => {
      img.src = '../assets/images/placeholder-store.svg';
    });
  });

  /**
   * Filter store cards based on active category and search query.
   * Also updates map markers if the map view is instantiated.
   */
  function filterStores() {
    let visibleCount = 0;

    storeCards.forEach(card => {
      const cardCategory = card.getAttribute('data-category');
      const cardTitle = card.querySelector('.card-title')?.textContent.toLowerCase() || '';
      const cardDesc = card.querySelector('.card-text')?.textContent.toLowerCase() || '';

      const matchesCategory = (currentCategory === 'all' || cardCategory === currentCategory);
      const matchesSearch = cardTitle.includes(currentQuery) || cardDesc.includes(currentQuery);

      if (matchesCategory && matchesSearch) {
        card.classList.remove('d-none');
        visibleCount++;
      } else {
        card.classList.add('d-none');
      }
    });

    // Toggle Empty State Message
    if (noResultsMsg) {
      if (visibleCount === 0) {
        noResultsMsg.classList.remove('d-none');
      } else {
        noResultsMsg.classList.add('d-none');
      }
    }

    // Sync active map markers with visible cards
    if (map) {
      updateMapMarkers();
    }
  }

  // Live Search Event Handler
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentQuery = e.target.value.toLowerCase().trim();
      filterStores();
    });
  }

  // Category Filter Buttons Handler
  filterButtons.forEach(button => {
    button.addEventListener('click', () => {
      filterButtons.forEach(btn => btn.classList.remove('active', 'btn-primary'));
      filterButtons.forEach(btn => btn.classList.add('btn-outline-primary'));

      button.classList.remove('btn-outline-primary');
      button.classList.add('active', 'btn-primary');

      currentCategory = button.getAttribute('data-filter') || 'all';
      filterStores();
    });
  });

  // Toggle Grid vs. Map View Handlers
  if (btnGrid && btnMap) {
    btnGrid.addEventListener('click', () => {
      // Toggle Active States
      btnGrid.classList.add('btn-primary', 'active');
      btnGrid.classList.remove('btn-outline-primary');

      btnMap.classList.add('btn-outline-primary');
      btnMap.classList.remove('btn-primary', 'active');

      // Toggle Views
      if (storeMapContainer) storeMapContainer.classList.add('d-none');
      storeGrid.classList.remove('d-none');
    });

    btnMap.addEventListener('click', () => {
      // Toggle Active States
      btnMap.classList.add('btn-primary', 'active');
      btnMap.classList.remove('btn-outline-primary');

      btnGrid.classList.add('btn-outline-primary');
      btnGrid.classList.remove('btn-primary', 'active');

      // Toggle Views
      storeGrid.classList.add('d-none');
      if (storeMapContainer) storeMapContainer.classList.remove('d-none');

      // Initialize or Refresh Leaflet Canvas
      if (!map) {
        initLeafletMap();
      } else {
        // Trigger resize event to fix tile rendering issues inside hidden containers
        setTimeout(() => map.invalidateSize(), 200);
      }
    });
  }

  /**
   * Initialize Leaflet OpenStreetMap Instance
   */
  function initLeafletMap() {
    if (typeof L === 'undefined') {
      console.warn('Leaflet library (L) is not loaded.');
      return;
    }

    // Default map center (Gaborone Central: -24.6581, 25.9122)
    map = L.map('leaflet-map').setView([-24.6581, 25.9122], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    updateMapMarkers();
  }

  /**
   * Render custom markers for all currently visible store cards on the map
   */
  function updateMapMarkers() {
    // Clear existing markers
    mapMarkers.forEach(m => map.removeLayer(m));
    mapMarkers = [];

    const bounds = [];

    storeCards.forEach(card => {
      if (!card.classList.contains('d-none')) {
        const lat = parseFloat(card.getAttribute('data-lat'));
        const lng = parseFloat(card.getAttribute('data-lng'));
        const name = card.getAttribute('data-name') || 'Affiliate Partner';
        const perk = card.getAttribute('data-perk') || 'Special Member Offer';

        if (!isNaN(lat) && !isNaN(lng)) {
          const marker = L.marker([lat, lng])
            .addTo(map)
            .bindPopup(`
              <div class="text-center p-1">
                <strong class="d-block text-primary">${name}</strong>
                <small class="text-muted">${perk}</small>
              </div>
            `);

          mapMarkers.push(marker);
          bounds.push([lat, lng]);
        }
      }
    });

    // Auto-fit map viewport around active markers
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    }
  }
});