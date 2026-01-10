// Map UI - modal dialog with disambiguation editor and Leaflet map

import { Schedule, GeoLocation } from './model.js';
import {
  extractUniquePlaces,
  extractTravelSegments,
  geocodeAllPlaces,
  getSegmentColor,
  calculateBounds,
  updateScheduleWithGeodata,
  TravelSegment
} from './map.js';

// Leaflet types (loaded from CDN)
declare const L: {
  map(element: HTMLElement): LeafletMap;
  tileLayer(url: string, options: Record<string, unknown>): LeafletTileLayer;
  marker(latlng: [number, number]): LeafletMarker;
  polyline(latlngs: [number, number][], options: Record<string, unknown>): LeafletPolyline;
  latLngBounds(corner1: [number, number], corner2: [number, number]): LeafletBounds;
};

interface LeafletMap {
  setView(center: [number, number], zoom: number): LeafletMap;
  addLayer(layer: LeafletTileLayer | LeafletMarker | LeafletPolyline): LeafletMap;
  fitBounds(bounds: LeafletBounds, options?: { padding: [number, number] }): LeafletMap;
  remove(): void;
}

interface LeafletTileLayer {
  addTo(map: LeafletMap): LeafletTileLayer;
}

interface LeafletMarker {
  addTo(map: LeafletMap): LeafletMarker;
  bindPopup(content: string): LeafletMarker;
}

interface LeafletPolyline {
  addTo(map: LeafletMap): LeafletPolyline;
}

interface LeafletBounds {
  extend(latlng: [number, number]): LeafletBounds;
}

type ScheduleUpdateCallback = (schedule: Schedule) => void;

/** Create and show the map modal */
export function showMapModal(
  schedule: Schedule,
  onScheduleUpdate: ScheduleUpdateCallback
): void {
  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.className = 'map-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'map-modal';

  // Header
  const header = document.createElement('div');
  header.className = 'map-modal-header';
  header.innerHTML = `
    <h2>Trip Map</h2>
    <button class="map-modal-close">&times;</button>
  `;

  // Content area with two sections
  const content = document.createElement('div');
  content.className = 'map-modal-content';

  // Left panel: disambiguation editor
  const leftPanel = document.createElement('div');
  leftPanel.className = 'map-panel-left';
  leftPanel.innerHTML = `
    <h3>Place Disambiguation</h3>
    <p class="map-panel-hint">Add hints to disambiguate place names (e.g., "Scotland" for Edinburgh)</p>
    <div id="disambiguation-list"></div>
    <button id="geocode-btn" class="map-btn-primary">Generate Map</button>
    <div id="geocode-status"></div>
  `;

  // Right panel: map
  const rightPanel = document.createElement('div');
  rightPanel.className = 'map-panel-right';
  rightPanel.innerHTML = `<div id="map-container"></div>`;

  content.appendChild(leftPanel);
  content.appendChild(rightPanel);

  modal.appendChild(header);
  modal.appendChild(content);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Initialize disambiguation list
  const places = extractUniquePlaces(schedule);
  const disambiguationList = document.getElementById('disambiguation-list')!;
  const disambiguations = { ...schedule.placeDisambiguations };
  const hiddenPlaces = { ...schedule.hiddenPlaces };

  renderDisambiguationList(disambiguationList, places, disambiguations, hiddenPlaces);

  // Handle close
  const closeBtn = header.querySelector('.map-modal-close')!;
  closeBtn.addEventListener('click', () => {
    cleanupMap();
    overlay.remove();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      cleanupMap();
      overlay.remove();
    }
  });

  // Handle escape key
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      cleanupMap();
      overlay.remove();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);

  // Map instance reference for cleanup
  let mapInstance: LeafletMap | null = null;

  function cleanupMap(): void {
    if (mapInstance) {
      mapInstance.remove();
      mapInstance = null;
    }
  }

  // Handle generate map button
  const geocodeBtn = document.getElementById('geocode-btn')!;
  const statusDiv = document.getElementById('geocode-status')!;

  geocodeBtn.addEventListener('click', async () => {
    geocodeBtn.setAttribute('disabled', 'true');
    geocodeBtn.textContent = 'Geocoding...';
    statusDiv.textContent = '';

    // Collect current disambiguation values
    const textInputs = disambiguationList.querySelectorAll('input[type="text"]');
    textInputs.forEach((input) => {
      const place = (input as HTMLInputElement).dataset.place!;
      const value = (input as HTMLInputElement).value.trim();
      if (value) {
        disambiguations[place] = value;
      } else {
        delete disambiguations[place];
      }
    });

    // Collect hidden state (checkbox checked = show, unchecked = hidden)
    const checkboxes = disambiguationList.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach((checkbox) => {
      const place = (checkbox as HTMLInputElement).dataset.place!;
      if ((checkbox as HTMLInputElement).checked) {
        delete hiddenPlaces[place]; // Checked = show, so remove from hidden
      } else {
        hiddenPlaces[place] = true; // Unchecked = hidden
      }
    });

    try {
      const geocodedPlaces = await geocodeAllPlaces(
        places,
        disambiguations,
        schedule.geocodedPlaces,
        (completed, total) => {
          statusDiv.textContent = `Geocoding: ${completed}/${total}`;
        }
      );

      // Update schedule with new data
      const updatedSchedule = updateScheduleWithGeodata(schedule, disambiguations, geocodedPlaces, hiddenPlaces);
      schedule = updatedSchedule;
      onScheduleUpdate(updatedSchedule);

      // Check for failed geocodes
      const failedPlaces = places.filter(p => !geocodedPlaces[p]);
      if (failedPlaces.length > 0) {
        statusDiv.textContent = `Warning: Could not geocode: ${failedPlaces.join(', ')}`;
        statusDiv.className = 'geocode-warning';
      } else {
        statusDiv.textContent = 'All places geocoded successfully';
        statusDiv.className = 'geocode-success';
      }

      // Render map (excluding hidden places)
      cleanupMap();
      mapInstance = renderMap(schedule, places, geocodedPlaces, hiddenPlaces);

    } catch (error) {
      statusDiv.textContent = `Error: ${error}`;
      statusDiv.className = 'geocode-error';
    }

    geocodeBtn.removeAttribute('disabled');
    geocodeBtn.textContent = 'Generate Map';
  });

  // If we have existing geocoded data, render map immediately
  if (Object.keys(schedule.geocodedPlaces).length > 0) {
    mapInstance = renderMap(schedule, places, schedule.geocodedPlaces, hiddenPlaces);
  }
}

function renderDisambiguationList(
  container: HTMLElement,
  places: string[],
  disambiguations: Record<string, string>,
  hiddenPlaces: Record<string, boolean>
): void {
  container.innerHTML = '';

  if (places.length === 0) {
    container.innerHTML = '<p class="map-no-places">No places found in schedule</p>';
    return;
  }

  const table = document.createElement('table');
  table.className = 'disambiguation-table';

  // Header row
  const headerRow = document.createElement('tr');
  headerRow.className = 'disambiguation-header';
  const showHeader = document.createElement('th');
  showHeader.textContent = 'Show';
  showHeader.title = 'Include location on map';
  const placeHeader = document.createElement('th');
  placeHeader.textContent = 'Place';
  const hintHeader = document.createElement('th');
  hintHeader.textContent = 'Details';
  headerRow.appendChild(showHeader);
  headerRow.appendChild(placeHeader);
  headerRow.appendChild(hintHeader);
  table.appendChild(headerRow);

  // Store all text inputs for navigation
  const textInputs: HTMLInputElement[] = [];

  for (let i = 0; i < places.length; i++) {
    const place = places[i];
    const row = document.createElement('tr');

    // Show checkbox cell (checked = included, unchecked = hidden)
    const showCell = document.createElement('td');
    showCell.className = 'show-cell';
    const showCheckbox = document.createElement('input');
    showCheckbox.type = 'checkbox';
    showCheckbox.checked = !hiddenPlaces[place]; // Inverted: checked means show
    showCheckbox.dataset.place = place;
    showCheckbox.title = 'Include on map';
    showCell.appendChild(showCheckbox);

    // Place name cell
    const placeCell = document.createElement('td');
    placeCell.className = 'place-name';
    placeCell.textContent = place;

    // Disambiguation input cell
    const inputCell = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'e.g., Scotland, PA, France...';
    input.value = disambiguations[place] || '';
    input.dataset.place = place;
    input.dataset.index = String(i);
    inputCell.appendChild(input);

    textInputs.push(input);

    row.appendChild(showCell);
    row.appendChild(placeCell);
    row.appendChild(inputCell);
    table.appendChild(row);
  }

  container.appendChild(table);

  // Add keyboard navigation to all text inputs
  textInputs.forEach((input, index) => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        const nextIndex = index + 1;
        if (nextIndex < textInputs.length) {
          textInputs[nextIndex].focus();
          textInputs[nextIndex].select();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = index - 1;
        if (prevIndex >= 0) {
          textInputs[prevIndex].focus();
          textInputs[prevIndex].select();
        }
      }
    });
  });
}

function renderMap(
  schedule: Schedule,
  places: string[],
  geocodedPlaces: Record<string, GeoLocation>,
  hiddenPlaces: Record<string, boolean>
): LeafletMap | null {
  const container = document.getElementById('map-container');
  if (!container) return null;

  // Check if Leaflet is loaded
  if (typeof L === 'undefined') {
    container.innerHTML = '<p class="map-error">Leaflet library not loaded</p>';
    return null;
  }

  // Filter out hidden places for display
  const visiblePlaces = places.filter(p => !hiddenPlaces[p]);

  // Get geocoded locations (only visible ones for bounds calculation)
  const locations = visiblePlaces
    .map(p => geocodedPlaces[p])
    .filter((loc): loc is GeoLocation => loc !== undefined);

  if (locations.length === 0) {
    container.innerHTML = '<p class="map-error">No geocoded locations available (or all hidden)</p>';
    return null;
  }

  // Create map
  container.innerHTML = '';
  const map = L.map(container);

  // Add tile layer (OpenStreetMap)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 18
  }).addTo(map);

  // Add markers for each visible place
  for (const place of visiblePlaces) {
    const loc = geocodedPlaces[place];
    if (loc) {
      L.marker([loc.lat, loc.lng])
        .addTo(map)
        .bindPopup(`<b>${place}</b><br>${loc.displayName}`);
    }
  }

  // Draw travel segments (only between visible places)
  const segments = extractTravelSegments(schedule);
  const visibleSegments = segments.filter(
    s => !hiddenPlaces[s.from] && !hiddenPlaces[s.to]
  );
  const totalSegments = visibleSegments.length;

  visibleSegments.forEach((segment, idx) => {
    const fromLoc = geocodedPlaces[segment.from];
    const toLoc = geocodedPlaces[segment.to];

    if (fromLoc && toLoc) {
      const color = getSegmentColor(idx, totalSegments);
      L.polyline(
        [[fromLoc.lat, fromLoc.lng], [toLoc.lat, toLoc.lng]],
        {
          color,
          weight: 3,
          opacity: 0.8
        }
      ).addTo(map);
    }
  });

  // Fit bounds to show all visible markers
  const bounds = calculateBounds(locations);
  if (bounds) {
    map.fitBounds(
      L.latLngBounds(
        [bounds.minLat, bounds.minLng],
        [bounds.maxLat, bounds.maxLng]
      ),
      { padding: [50, 50] }
    );
  }

  return map;
}
