let activeLocation = DUBAI_LOCATIONS[0];
let deferredInstallPrompt = null;
let currentTelemetry = null;
let isLoading = false;

const SHORT_NAMES = {
  discovery_gardens: 'Discovery Gardens',
  jebel_ali_village: 'Jebel Ali Village',
  jebel_ali_port: 'Jebel Ali Port',
  szr_e11: 'Sheikh Zayed Rd (E11)',
  mbz_e311: 'MBZ Road (E311)',
  emirates_e611: 'Emirates Rd (E611)',
  dubai_marina: 'Dubai Marina / JBR',
  downtown: 'Downtown / Business Bay'
};
const shortName = (loc) => SHORT_NAMES[loc.id] || loc.name;
const setText = (id, value) => { document.getElementById(id).textContent = value; };
const reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

document.addEventListener('DOMContentLoaded', () => {
  initServiceWorker();
  initLocationSelect();
  initEventListeners();
  initPwaInstall();
  initPullToRefresh();

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
    opt.textContent = shortName(loc);
    opt.title = `${loc.name} (${loc.type})`;
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

/**
 * Number ticker: counts from the value on screen to the new value (~400ms, ease-out).
 * The first value after load is set directly so a reading never counts up from zero.
 */
function animateNumber(id, to, { decimals = 0, suffix = '', duration = 400 } = {}) {
  const el = document.getElementById(id);
  const fmt = (v) => v.toFixed(decimals) + suffix;
  if (el._raf) { cancelAnimationFrame(el._raf); el._raf = null; }
  const from = el._current;
  el._current = to;
  if (typeof from !== 'number' || from === to || reducedMotion()) {
    el.textContent = fmt(to);
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const value = from + (to - from) * (1 - Math.pow(1 - t, 3));
    el._current = value;
    el.textContent = fmt(value);
    if (t < 1) {
      el._raf = requestAnimationFrame(step);
    } else {
      el._current = to;
      el.textContent = fmt(to);
      el._raf = null;
    }
  };
  el._raf = requestAnimationFrame(step);
}

function clearNumber(id) {
  const el = document.getElementById(id);
  if (el._raf) { cancelAnimationFrame(el._raf); el._raf = null; }
  el._current = undefined;
  el.textContent = '--';
}

function setGauge(id, fraction) {
  const f = Math.max(0, Math.min(1, fraction));
  document.getElementById(id).style.strokeDasharray = `${(f * 75).toFixed(2)} 100`;
}

function heatClass(roundedTemp) {
  if (roundedTemp > 38) return 'heat-high';
  if (roundedTemp >= 30) return 'heat-mid';
  return 'heat-low';
}

function makeEl(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderHourly(data) {
  const box = document.getElementById('hourlyScroll');
  const slots = WeatherEngine.nextHours(data, 12);
  box.textContent = '';
  if (!slots.length) {
    box.appendChild(makeEl('p', 'hourly-empty', 'Hourly forecast unavailable.'));
    return;
  }
  slots.forEach((s) => {
    const temp = Math.round(s.temp);
    const rh = Math.round(s.humidity);
    const icon = typeof s.code === 'number' ? WeatherEngine.describeWeather(s.code, s.isDay).icon : (s.isDay ? '☀️' : '🌙');
    const label = WeatherEngine.formatHour(s.hour);

    const pill = makeEl('div', 'hour-pill');
    pill.setAttribute('role', 'listitem');
    pill.setAttribute('aria-label', `${label}: ${temp} degrees, ${rh} percent humidity`);
    pill.appendChild(makeEl('span', 'hour-time', label));
    const ic = makeEl('span', 'hour-icon', icon);
    ic.setAttribute('aria-hidden', 'true');
    pill.appendChild(ic);
    pill.appendChild(makeEl('span', `hour-temp ${heatClass(temp)}`, `${temp}°`));
    pill.appendChild(makeEl('span', 'hour-rh', `💧 ${rh}%`));
    box.appendChild(pill);
  });
  box.scrollLeft = 0;
}

async function loadWeather(loc, spin = false) {
  const refreshIcon = document.getElementById('refreshIcon');
  if (spin) refreshIcon.classList.add('rotating');
  isLoading = true;

  try {
    const data = await WeatherEngine.fetchAll(loc.lat, loc.lon);
    const raw = data.current;

    const temp = Math.round(raw.temperature_2m);
    const humidity = Math.round(raw.relative_humidity_2m);
    const feelsLike = Math.round(WeatherEngine.computeHeatIndex(temp, humidity));
    const dewPoint = parseFloat(WeatherEngine.computeDewPoint(temp, humidity));
    const stress = WeatherEngine.evaluateHeatStress(feelsLike);
    const wind = Math.round(raw.wind_speed_10m ?? 0);
    const uv = typeof raw.uv_index === 'number' ? raw.uv_index : null;
    const cond = WeatherEngine.describeWeather(raw.weather_code, raw.is_day === 1);

    currentTelemetry = { temp, humidity, feelsLike, dewPoint, stress, wind, uv, cond };

    setText('capsuleLocation', shortName(loc));
    document.getElementById('capsuleLocation').title = loc.name;

    // Rolling numbers
    animateNumber('valTemp', temp);
    animateNumber('valFeelsLike', feelsLike, { suffix: '°C' });
    animateNumber('valHumidity', humidity);
    animateNumber('valDewPoint', dewPoint, { decimals: 1, suffix: '°C' });
    animateNumber('valWind', wind);
    document.getElementById('barHumidity').style.width = `${humidity}%`;

    // Radial gauges: temperature 0-50°C, humidity 0-100%
    setGauge('gaugeTemp', temp / 50);
    setGauge('gaugeHumid', humidity / 100);

    setText('condIcon', cond.icon);
    setText('condLabel', cond.label);
    setText('valDispersion', WeatherEngine.describeWind(wind));

    const uvInfo = WeatherEngine.describeUv(uv);
    if (uv === null) clearNumber('valUv'); else animateNumber('valUv', uv, { decimals: 1 });
    const uvBadge = document.getElementById('badgeUv');
    uvBadge.textContent = uvInfo.label;
    uvBadge.style.color = uvInfo.color;
    setText('valUvGuidance', uvInfo.advice);

    // Status capsule + stress card
    const capBadge = document.getElementById('capsuleBadge');
    capBadge.textContent = stress.level;
    capBadge.className = `capsule-badge ${stress.badgeClass}`;

    const stressCard = document.getElementById('cardStress');
    stressCard.style.borderLeftColor = stress.borderClass;
    setText('stressLevel', stress.level);
    document.getElementById('stressLevel').style.color = stress.borderClass;
    setText('stressDesc', stress.desc);
    setText('stressIcon', stress.icon);

    // Pulsing glow and animated icon for DANGER / EXTREME DANGER
    const hazard = stress.level.includes('DANGER');
    stressCard.classList.toggle('alert-active', hazard);
    document.getElementById('stressIcon').classList.toggle('icon-alert', hazard);

    renderHourly(data);

    const synced = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai' });
    setText('lastSynced', `Last synced: ${synced}`);

    // One summary for screen readers (the animated numbers are not live regions)
    setText('srStatus', `${shortName(loc)}: ${temp} degrees Celsius, feels like ${feelsLike}, humidity ${humidity} percent. Heat stress: ${stress.level}.`);

    localStorage.setItem('dubai_last_weather', JSON.stringify({ locationName: loc.name, temp, humidity, timestamp: Date.now() }));

    updateAmbientMesh(temp, humidity);
  } catch (err) {
    console.error('Weather update failed:', err);
    ShareManager.showToast('Could not refresh. Showing the last reading.');
  } finally {
    isLoading = false;
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

/**
 * Pull-to-refresh: pull down from the top of the page, release past the threshold to refresh.
 * Horizontal swipes (the hourly slider) and touches on the bottom bar are ignored.
 */
function initPullToRefresh() {
  const indicator = document.getElementById('pullIndicator');
  const icon = indicator.querySelector('svg');
  const THRESHOLD = 70;
  const MAX_PULL = 110;
  let startX = 0;
  let startY = 0;
  let tracking = false;
  let pulling = false;
  let dist = 0;

  const scrollTop = () => (document.scrollingElement || document.documentElement).scrollTop;

  const reset = () => {
    indicator.classList.remove('dragging', 'ready', 'loading');
    indicator.style.transform = '';
    indicator.style.opacity = '';
    icon.style.transform = '';
  };

  document.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || isLoading || scrollTop() > 0 || e.target.closest('.bottom-nav-bar, select')) {
      tracking = false;
      return;
    }
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    tracking = true;
    pulling = false;
    dist = 0;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!tracking) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;

    if (!pulling) {
      if (Math.abs(dx) > Math.abs(dy) || dy < -6) { tracking = false; return; }
      if (dy < 8) return;
      pulling = true;
      indicator.classList.add('dragging');
    }
    if (scrollTop() > 0) { tracking = false; pulling = false; reset(); return; }

    dist = Math.min(MAX_PULL, dy * 0.5);
    if (e.cancelable) e.preventDefault();
    indicator.style.transform = `translate(-50%, ${dist - 50}px)`;
    indicator.style.opacity = String(Math.min(1, dist / THRESHOLD));
    icon.style.transform = `rotate(${dist * 3}deg)`;
    indicator.classList.toggle('ready', dist >= THRESHOLD);
  }, { passive: false });

  const end = async () => {
    if (!tracking) return;
    const fire = pulling && dist >= THRESHOLD;
    tracking = false;
    pulling = false;
    if (!fire) { reset(); return; }

    indicator.classList.remove('dragging', 'ready');
    indicator.style.transform = '';
    indicator.style.opacity = '';
    icon.style.transform = '';
    indicator.classList.add('loading');
    triggerHaptic([15]);
    await loadWeather(activeLocation, true);
    reset();
  };
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', end, { passive: true });
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
