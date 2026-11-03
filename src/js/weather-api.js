class WeatherEngine {
  static async fetchTelemetry(lat, lon) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,wind_speed_10m,uv_index&hourly=temperature_2m,relative_humidity_2m&timezone=Asia%2FDubai`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Open-Meteo API error: ${response.status}`);
    const data = await response.json();
    return data.current;
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
}
