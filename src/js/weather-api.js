class WeatherEngine {
  static async fetchAll(lat, lon) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,wind_speed_10m,uv_index,weather_code&hourly=temperature_2m,relative_humidity_2m,weather_code,is_day&timezone=Asia%2FDubai`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Open-Meteo API error: ${response.status}`);
    const data = await response.json();
    if (!data.current) throw new Error('Open-Meteo returned no current data');
    return data;
  }

  static async fetchTelemetry(lat, lon) {
    return (await WeatherEngine.fetchAll(lat, lon)).current;
  }

  /** Next `count` hourly slots after the current hour (Dubai local time strings from the API). */
  static nextHours(data, count = 12) {
    const h = data.hourly;
    if (!h || !h.time || !data.current) return [];
    const nowKey = data.current.time.slice(0, 13);
    const start = h.time.findIndex((t) => t.slice(0, 13) > nowKey);
    if (start < 0) return [];
    const out = [];
    for (let k = start; k < h.time.length && out.length < count; k++) {
      const hour = parseInt(h.time[k].slice(11, 13), 10);
      const isDay = h.is_day ? h.is_day[k] === 1 : hour >= 6 && hour < 18;
      out.push({ hour, isDay, temp: h.temperature_2m[k], humidity: h.relative_humidity_2m[k], code: h.weather_code ? h.weather_code[k] : null });
    }
    return out;
  }

  static formatHour(hour) {
    return `${hour % 12 || 12} ${hour >= 12 ? 'PM' : 'AM'}`;
  }

  static computeDewPoint(tempC, humidity) {
    const a = 17.27;
    const b = 237.7;
    const alpha = ((a * tempC) / (b + tempC)) + Math.log(humidity / 100.0);
    return ((b * alpha) / (a - alpha)).toFixed(1);
  }

  static computeHeatIndex(tempC, humidity) {
    if (tempC < 27) return tempC.toFixed(1);
    const T = (tempC * 9 / 5) + 32;
    const R = humidity;
    let hi = -42.379 + 2.04901523 * T + 10.14333127 * R - 0.22475541 * T * R - 0.00683783 * T * T - 0.05481717 * R * R + 0.00122874 * T * T * R + 0.00085282 * T * R * R - 0.00000199 * T * T * R * R;
    const hiC = (hi - 32) * 5 / 9;
    return hiC.toFixed(1);
  }

  static evaluateHeatStress(feelsLikeC) {
    const fl = parseFloat(feelsLikeC);
    if (fl >= 54) {
      return { level: "EXTREME DANGER", badgeClass: "badge-danger", borderClass: "var(--accent-danger)", icon: "🚨", desc: "Heat stroke imminent with prolonged exposure. Mandatory hydration and immediate shade required." };
    } else if (fl >= 41) {
      return { level: "DANGER", badgeClass: "badge-danger", borderClass: "var(--accent-danger)", icon: "⚠️", desc: "Heat cramps or heat exhaustion likely. Outdoor physical labor restricted without cooling cycles." };
    } else if (fl >= 32) {
      return { level: "EXTREME CAUTION", badgeClass: "badge-caution", borderClass: "var(--accent-amber)", icon: "☀️", desc: "High fatigue possible with prolonged exposure. Increase fluid intake." };
    } else {
      return { level: "SAFE / LOW", badgeClass: "badge-safe", borderClass: "var(--accent-safe)", icon: "✅", desc: "Thermal conditions within normal baseline for urban activities." };
    }
  }

  /**
   * Maps a WMO weather_code to a label and icon.
   * Open-Meteo has no dust code: dust and haze usually show up as fog (45/48).
   */
  static describeWeather(code, isDay = true) {
    const c = Number(code);
    if (c === 0) return { label: 'Clear Sky', icon: isDay ? '☀️' : '🌙' };
    if (c === 1) return { label: 'Mainly Clear', icon: isDay ? '🌤️' : '🌙' };
    if (c === 2) return { label: 'Partly Cloudy', icon: isDay ? '⛅' : '☁️' };
    if (c === 3) return { label: 'Overcast', icon: '☁️' };
    if (c === 45 || c === 48) return { label: 'Fog / Dust / Haze', icon: '🌫️' };
    if (c >= 51 && c <= 55) return { label: 'Drizzle', icon: '🌦️' };
    if (c === 56 || c === 57) return { label: 'Freezing Drizzle', icon: '🌧️' };
    if (c >= 61 && c <= 65) return { label: 'Rain', icon: '🌧️' };
    if (c === 66 || c === 67) return { label: 'Freezing Rain', icon: '🌧️' };
    if (c >= 71 && c <= 77) return { label: 'Snow', icon: '❄️' };
    if (c >= 80 && c <= 82) return { label: 'Rain Showers', icon: '🌦️' };
    if (c === 85 || c === 86) return { label: 'Snow Showers', icon: '🌨️' };
    if (c === 95) return { label: 'Thunderstorm', icon: '⛈️' };
    if (c === 96 || c === 99) return { label: 'Thunderstorm, Hail', icon: '⛈️' };
    return { label: 'Conditions unavailable', icon: '🌡️' };
  }

  static describeWind(kmh) {
    if (kmh < 8) return 'Low (air stagnant)';
    if (kmh < 25) return 'Moderate';
    if (kmh < 40) return 'Good (breezy)';
    return 'Strong (dust risk)';
  }

  static describeUv(uv) {
    if (uv === null || uv === undefined) return { label: 'N/A', color: 'var(--text-secondary)', advice: 'No UV data' };
    if (uv >= 11) return { label: 'EXTREME', color: 'var(--accent-danger)', advice: 'Avoid direct sun' };
    if (uv >= 8) return { label: 'VERY HIGH', color: 'var(--accent-orange)', advice: 'SPF 50+, seek shade' };
    if (uv >= 6) return { label: 'HIGH', color: 'var(--accent-amber)', advice: 'SPF 30+, hat, shade' };
    if (uv >= 3) return { label: 'MODERATE', color: 'var(--accent-amber)', advice: 'Sunscreen advised' };
    return { label: 'LOW', color: 'var(--accent-safe)', advice: 'No protection needed' };
  }
}
