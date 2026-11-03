const DUBAI_LOCATIONS = [
  { id: "discovery_gardens", name: "Discovery Gardens & The Gardens", lat: 25.0416, lon: 55.1384, type: "Residential Pocket" },
  { id: "jebel_ali_village", name: "Jebel Ali Village", lat: 25.0289, lon: 55.1147, type: "Suburban" },
  { id: "jebel_ali_port", name: "Jebel Ali Port & Industrial Zone", lat: 24.9857, lon: 55.0272, type: "Coastal Industrial" },
  { id: "szr_e11", name: "Sheikh Zayed Road (SZR - E11)", lat: 25.1052, lon: 55.1887, type: "Highway Heat Island" },
  { id: "mbz_e311", name: "Sheikh Mohammed Bin Zayed Rd (E311)", lat: 25.0489, lon: 55.2285, type: "Transit Corridor" },
  { id: "emirates_e611", name: "Emirates Road (E611 - Desert Belt)", lat: 25.0125, lon: 55.3341, type: "Inland Desert Edge" },
  { id: "dubai_marina", name: "Dubai Marina / JBR Coastal", lat: 25.0805, lon: 55.1403, type: "Marine Waterfront" },
  { id: "downtown", name: "Downtown Dubai / Business Bay", lat: 25.1972, lon: 55.2744, type: "Dense Urban Core" }
];

function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function findNearestDubaiLocation(userLat, userLon) {
  let closest = DUBAI_LOCATIONS[0];
  let minDistance = calculateHaversineDistance(userLat, userLon, closest.lat, closest.lon);
  for (let i = 1; i < DUBAI_LOCATIONS.length; i++) {
    const d = calculateHaversineDistance(userLat, userLon, DUBAI_LOCATIONS[i].lat, DUBAI_LOCATIONS[i].lon);
    if (d < minDistance) { minDistance = d; closest = DUBAI_LOCATIONS[i]; }
  }
  return { location: closest, distanceKm: minDistance.toFixed(1) };
}
