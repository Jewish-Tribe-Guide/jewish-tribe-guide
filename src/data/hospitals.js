// Starter hospital data, loaded into the `hospital` DB table by
// scripts/seed-hospitals.mjs (run by `npm run setup`). After seeding, the app
// reads hospitals from the database (via /api/hospitals), not this file — so
// edit here for a new community's initial set, or leave the array empty for a
// non-hospital community. The per-hospital "Jewish life" details live in
// src/data/hospitalInfo.js, keyed by the ids below.
export const hospitals = [
    { id: "penn", name: "Hospital of the University of Pennsylvania", latitude: 39.9496, longitude: -75.1936, timezone: "America/New_York" },
    { id: "chop", name: "Children's Hospital of Philadelphia (CHOP)", latitude: 39.9489, longitude: -75.1938, timezone: "America/New_York" },
    { id: "jefferson", name: "Jefferson University Hospital", latitude: 39.9489, longitude: -75.1583, timezone: "America/New_York" },
    { id: "temple", name: "Temple University Hospital", latitude: 40.0079, longitude: -75.1503, timezone: "America/New_York" }
];