let activeLocation = DUBAI_LOCATIONS[0];
let deferredInstallPrompt = null;
let currentTelemetry = null;

document.addEventListener('DOMContentLoaded', () => {
  initServiceWorker();
  initLocationSelect();
  initEventListeners();
  initPwaInstall();

  const params = new URLSearchParams(window.location.search);
  const locParam = params.get('loc');
  if (locParam) {
    const found = DUBAI_LOCATIONS.find(l => l.id === locParam);
    if (found) activeLocation = found;
  }

  document.getElementById('selectLocation').value = activeLocation.id;
  loadWeather(activeLocation);

  setInterval(() => { loadWeather(activeLocation, false); }, 5 * 60 * 1000);
});

function initServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('PWA SW registered on scope:', reg.scope))
        .catch(err => console.error('SW registration failed:', err));
    });
  }
}

function initLocationSelect() {
  const select = document.getElementById('selectLocation');
  select.innerHTML = '';
  DUBAI_LOCATIONS.forEach(loc => {
    const opt = document.createElement('option');
    opt.value = loc.id;
    opt.textContent = `${loc.name} (${loc.type})`;
    select.appendChild(opt);
  });
}

function initEventListeners() {
  const select = document.getElementById('selectLocation');
  select.addEventListener('change', (e) => {
    triggerHaptic();
    const loc = DUBAI_LOCATIONS.find(l => l.id === e.target.value);
    if (loc) { activeLocation = loc; loadWeather(activeLocation); }
  });

  document.getElementById('btnRefresh').addEventListener('click', () => {
    triggerHaptic();
    loadWeather(activeLocation, true);
  });

  document.getElementById('btnGeo').addEventListener('click', handleGeolocation);

  document.getElementById('btnShare').addEventListener('click', () => {
    if (!currentTelemetry) return;
    ShareManager.share(activeLocation.name, currentTelemetry.temp, currentTelemetry.feelsLike, currentTelemetry.humidity, currentTelemetry.stress.level);
  });
}

function triggerHaptic(pattern = [15]) {
  if ('vibrate' in navigator) navigator.vibrate(pattern);
}

function handleGeolocation() {
  triggerHaptic([20, 30, 20]);
  if (!('geolocation' in navigator)) {
    ShareManager.showToast('Geolocation is not supported by your browser');
    return;
  }
  ShareManager.showToast('Locating your street...');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      const nearest = findNearestDubaiLocation(latitude, longitude);
      activeLocation = nearest.location;
      document.getElementById('selectLocation').value = activeLocation.id;
      ShareManager.showToast(`Matched nearest: ${activeLocation.name} (${nearest.distanceKm}km)`);
      loadWeather(activeLocation);
    },
    (err) => {
      ShareManager.showToast('Location access denied or timed out.');
      console.warn('Geolocation error:', err);
    },
    { timeout: 10000, enableHighAccuracy: true }
  );
}

async function loadWeather(loc, spin = false) {
  const refreshIcon = document.getElementById('refreshIcon');
  if (spin) refreshIcon.classList.add('rotating');

  try {
    const raw = await WeatherEngine.fetchTelemetry(loc.lat, loc.lon);

    const temp = Math.round(raw.temperature_2m);
    const humidity = Math.round(raw.relative_humidity_2m);
    const feelsLike = Math.round(WeatherEngine.computeHeatIndex(temp, humidity));
    const dewPoint = WeatherEngine.computeDewPoint(temp, humidity);
    const stress = WeatherEngine.evaluateHeatStress(feelsLike);
    const wind = Math.round(raw.wind_speed_10m || 0);
    const uv = raw.uv_index !== undefined ? Math.round(raw.uv_index) : 8;

    currentTelemetry = { temp, humidity, feelsLike, dewPoint, stress, wind, uv };

    document.getElementById('capsuleLocation').textContent = loc.name;
    document.getElementById('valTemp').textContent = temp;
    document.getElementById('valFeelsLike').textContent = `${feelsLike}°C`;
    document.getElementById('valHumidity').textContent = humidity;
    document.getElementById('barHumidity').style.width = `${humidity}%`;
    document.getElementById('valDewPoint').textContent = `${dewPoint}°C`;
    document.getElementById('valWind').textContent = wind;
    document.getElementById('valUv').textContent = uv;

    const uvBadge = document.getElementById('badgeUv');
    if (uv >= 11) { uvBadge.textContent = 'EXTREME'; uvBadge.style.color = 'var(--accent-danger)'; }
    else if (uv >= 8) { uvBadge.textContent = 'VERY HIGH'; uvBadge.style.color = 'var(--accent-orange)'; }
    else if (uv >= 6) { uvBadge.textContent = 'HIGH'; uvBadge.style.color = 'var(--accent-amber)'; }
    else { uvBadge.textContent = 'MODERATE'; uvBadge.style.color = 'var(--accent-safe)'; }

    const capBadge = document.getElementById('capsuleBadge');
    capBadge.textContent = stress.level;
    capBadge.className = `capsule-badge ${stress.badgeClass}`;

    const stressCard = document.getElementById('cardStress');
    stressCard.style.borderLeftColor = stress.borderClass;
    document.getElementById('stressLevel').textContent = stress.level;
    document.getElementById('stressLevel').style.color = stress.borderClass;
    document.getElementById('stressDesc').textContent = stress.desc;
    document.getElementById('stressIcon').textContent = stress.icon;

    localStorage.setItem('dubai_last_weather', JSON.stringify({ locationName: loc.name, temp, humidity, timestamp: Date.now() }));

    updateAmbientMesh(temp, humidity);
  } catch (err) {
    console.error('Weather update failed:', err);
    ShareManager.showToast('Using cached weather telemetry');
  } finally {
    if (spin) setTimeout(() => refreshIcon.classList.remove('rotating'), 600);
  }
}

function updateAmbientMesh(temp, humidity) {
  const mesh = document.getElementById('meshBg');
  if (!mesh) return;
  if (temp >= 40) {
    mesh.style.background = `radial-gradient(at 0% 0%, rgba(255, 23, 68, 0.22) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(255, 112, 67, 0.18) 0px, transparent 50%)`;
  } else if (humidity >= 70) {
    mesh.style.background = `radial-gradient(at 0% 0%, rgba(0, 240, 255, 0.18) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(30, 136, 229, 0.22) 0px, transparent 50%)`;
  } else {
    mesh.style.background = `radial-gradient(at 0% 0%, rgba(255, 87, 34, 0.12) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(0, 240, 255, 0.10) 0px, transparent 50%)`;
  }
}

function initPwaInstall() {
  const banner = document.getElementById('installBanner');
  const btnConfirm = document.getElementById('installConfirm');
  const btnDismiss = document.getElementById('installDismiss');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    banner.classList.remove('hidden');
  });

  btnConfirm.addEventListener('click', async () => {
    triggerHaptic();
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') banner.classList.add('hidden');
    deferredInstallPrompt = null;
  });

  btnDismiss.addEventListener('click', () => { triggerHaptic(); banner.classList.add('hidden'); });
}
