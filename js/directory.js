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

  if (!storeGrid) return; // Exit if not on index.html

  let currentCategory = 'all';
  let currentQuery = '';
  let map = null;
  let mapMarkers = [];

  // Filter Store Cards
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

    if (noResultsMsg) {
      visibleCount === 0 ? noResultsMsg.classList.remove('d-none') : noResultsMsg.classList.add('d-none');
    }

    if (map) updateMapMarkers();
  }

  // Event Listeners
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentQuery = e.target.value.toLowerCase().trim();
      filterStores();
    });
  }

  filterButtons.forEach(button => {
    button.addEventListener('click', () => {
      filterButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      currentCategory = button.getAttribute('data-filter');
      filterStores();
    });
  });

  // Toggle Grid vs. Map View
  if (btnGrid && btnMap) {
    btnGrid.addEventListener('click', () => {
      btnGrid.classList.add('btn-primary', 'active');
      btnMap.classList.add('btn-outline-primary');
      btnMap.classList.remove('btn-primary', 'active');
      storeMapContainer?.classList.add('d-none');
      storeGrid.classList.remove('d-none');
    });

    btnMap.addEventListener('click', () => {
      btnMap.classList.add('btn-primary', 'active');
      btnGrid.classList.add('btn-outline-primary');
      btnGrid.classList.remove('btn-primary', 'active');
      storeGrid.classList.add('d-none');
      storeMapContainer?.classList.remove('d-none');

      if (!map) {
        initLeafletMap();
      } else {
        map.invalidateSize();
      }
    });
  }

  // Initialize Map
  function initLeafletMap() {
    if (typeof L === 'undefined') return;
    
    map = L.map('leaflet-map').setView([-24.6581, 25.9122], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(map);

    updateMapMarkers();
  }

  function updateMapMarkers() {
    mapMarkers.forEach(m => map.removeLayer(m));
    mapMarkers = [];

    storeCards.forEach(card => {
      if (!card.classList.contains('d-none')) {
        const lat = parseFloat(card.getAttribute('data-lat'));
        const lng = parseFloat(card.getAttribute('data-lng'));
        const name = card.getAttribute('data-name');

        if (lat && lng) {
          const marker = L.marker([lat, lng]).addTo(map).bindPopup(`<strong>${name}</strong>`);
          mapMarkers.push(marker);
        }
      }
    });
  }
});