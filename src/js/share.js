class ShareManager {
  static formatReport(locationName, temp, feelsLike, humidity, stressLevel) {
    return `🌡️ ${locationName} Live: ${temp}°C (Feels like ${feelsLike}°C) | ${humidity}% Humidity. UAE Heat Index: ${stressLevel}. Tracked on Dubai Climate PWA.`;
  }

  static async share(locationName, temp, feelsLike, humidity, stressLevel) {
    if ('vibrate' in navigator) navigator.vibrate([20]);
    const shareText = this.formatReport(locationName, temp, feelsLike, humidity, stressLevel);
    const shareData = { title: 'Dubai Heat & Humidity Live Tracker', text: shareText, url: window.location.origin };

    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        return { success: true, method: 'native' };
      } catch (err) {
        if (err.name !== 'AbortError') return this.copyToClipboard(shareText);
      }
    } else {
      return this.copyToClipboard(shareText);
    }
  }

  static async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      this.showToast('Copied telemetry to clipboard!');
      return { success: true, method: 'clipboard' };
    } catch (err) {
      this.showToast('Failed to copy to clipboard');
      return { success: false, method: 'error' };
    }
  }

  static showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => { toast.classList.add('hidden'); }, 2800);
  }
}
