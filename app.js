const map = L.map('map', { center: [-31.9505, 115.8605], zoom: 12 });

L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Esri World Imagery',
    maxZoom: 20
}).addTo(map);

const wfsUrl = 'https://public-services.slip.wa.gov.au/public/services/SLIP_Public_Services/Environment_WFS/MapServer/WFSServer';

const timePeriods = [
    { layer: 'esri:High_Tide__DPIRD-094__2016-01-01_to_2016-06-30', period: '2016', color: '#ff4444' },
    { layer: 'esri:High_Tide__DPIRD-094__2017-01-01_to_2017-06-30', period: '2017', color: '#ff8844' },
    { layer: 'esri:High_Tide__DPIRD-094__2018-01-01_to_2018-06-30', period: '2018', color: '#ffcc44' },
    { layer: 'esri:High_Tide__DPIRD-094__2019-01-01_to_2019-06-30', period: '2019', color: '#88ff44' },
    { layer: 'esri:High_Tide__DPIRD-094__2020-01-01_to_2020-06-30', period: '2020', color: '#44ffcc' },
    { layer: 'esri:High_Tide__DPIRD-094__2021-01-01_to_2021-06-30', period: '2021', color: '#4488ff' },
    { layer: 'esri:High_Tide__DPIRD-094__2022-01-01_to_2022-06-30', period: '2022', color: '#4444ff' }
];

const coastlineLayers = {};
const lineWeight = 4;

// Swap coordinates from [lat, lon] to [lon, lat] for GeoJSON
const swapCoords = (coords) => {
    if (typeof coords[0] === 'number') return [coords[1], coords[0]];
    return coords.map(swapCoords);
};

async function loadWFSLayer(layerName, color) {
    const bounds = map.getBounds();
    // WFS 2.0.0 with EPSG:4326 expects lat,lon order (south,west,north,east)
    const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
    const url = `${wfsUrl}?service=WFS&version=2.0.0&request=GetFeature&typeName=${encodeURIComponent(layerName)}&outputFormat=geojson&srsName=EPSG:4326&bbox=${bbox}`;

    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const data = await response.json();
        if (!data.features?.length) return null;

        data.features.forEach(f => {
            if (f.geometry?.coordinates) f.geometry.coordinates = swapCoords(f.geometry.coordinates);
        });

        return L.geoJSON(data, { style: { color, weight: lineWeight, opacity: 1 } });
    } catch {
        return null;
    }
}

async function loadAllLayers() {
    document.getElementById('loading').classList.remove('hidden');

    // Remove ALL existing coastline layers from map and clear the object
    Object.keys(coastlineLayers).forEach(key => {
        const layer = coastlineLayers[key];
        if (layer && map.hasLayer(layer)) map.removeLayer(layer);
        delete coastlineLayers[key];
    });

    // Load all layers in parallel
    const currentLoadId = Date.now();
    loadAllLayers.currentId = currentLoadId;

    const results = await Promise.all(
        timePeriods.map(async period => {
            if (!layerEnabled[period.layer]) return { key: period.layer, layer: null };
            const layer = await loadWFSLayer(period.layer, period.color);
            return { key: period.layer, layer };
        })
    );

    // Only add layers if this is still the current load (not superseded by a newer one)
    if (loadAllLayers.currentId !== currentLoadId) return;

    // Store layers and add to map if enabled
    results.forEach(({ key, layer }) => {
        if (layer) {
            coastlineLayers[key] = layer;
            if (layerEnabled[key]) layer.addTo(map);
        }
    });

    document.getElementById('loading').classList.add('hidden');
}

// Track which layers are enabled
const layerEnabled = {};
timePeriods.forEach(p => layerEnabled[p.layer] = true);

// Build toggle controls
const toggleContainer = document.getElementById('yearToggles');
timePeriods.forEach(period => {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.id = `toggle-${period.layer}`;
    checkbox.addEventListener('change', e => {
        layerEnabled[period.layer] = e.target.checked;
        const layer = coastlineLayers[period.layer];
        if (layer) {
            if (e.target.checked && !map.hasLayer(layer)) {
                layer.addTo(map);
            } else if (!e.target.checked && map.hasLayer(layer)) {
                map.removeLayer(layer);
            }
        }
    });

    const colorBox = document.createElement('div');
    colorBox.className = 'color-box';
    colorBox.style.background = period.color;

    label.appendChild(checkbox);
    label.appendChild(colorBox);
    label.appendChild(document.createTextNode(period.period));
    toggleContainer.appendChild(label);
});

// Animation controls
let animationInterval = null;
let animationIndex = 0;
const animateBtn = document.getElementById('animateBtn');
const animationYearSpan = document.getElementById('animationYear');

function showOnlyYear(index) {
    timePeriods.forEach((period, i) => {
        const layer = coastlineLayers[period.layer];
        const checkbox = document.getElementById(`toggle-${period.layer}`);
        if (i === index) {
            layerEnabled[period.layer] = true;
            if (checkbox) checkbox.checked = true;
            if (layer && !map.hasLayer(layer)) layer.addTo(map);
            animationYearSpan.textContent = period.period;
        } else {
            layerEnabled[period.layer] = false;
            if (checkbox) checkbox.checked = false;
            if (layer && map.hasLayer(layer)) map.removeLayer(layer);
        }
    });
}

function startAnimation() {
    animateBtn.textContent = 'Stop';
    animateBtn.classList.add('playing');
    animationIndex = 0;
    showOnlyYear(animationIndex);

    animationInterval = setInterval(() => {
        animationIndex = (animationIndex + 1) % timePeriods.length;
        showOnlyYear(animationIndex);
    }, 1000);
}

function stopAnimation() {
    clearInterval(animationInterval);
    animationInterval = null;
    animateBtn.textContent = 'Play Animation';
    animateBtn.classList.remove('playing');
    animationYearSpan.textContent = '';

    // Re-enable all layers
    timePeriods.forEach(period => {
        const layer = coastlineLayers[period.layer];
        const checkbox = document.getElementById(`toggle-${period.layer}`);
        layerEnabled[period.layer] = true;
        if (checkbox) checkbox.checked = true;
        if (layer && !map.hasLayer(layer)) layer.addTo(map);
    });
}

animateBtn.addEventListener('click', () => {
    if (animationInterval) {
        stopAnimation();
    } else {
        startAnimation();
    }
});

// Reload on pan/zoom
let loadTimeout;
map.on('moveend', () => {
    clearTimeout(loadTimeout);
    loadTimeout = setTimeout(loadAllLayers, 500);
});

L.control.scale({ metric: true, imperial: false }).addTo(map);
loadAllLayers();
