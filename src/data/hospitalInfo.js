// Starter per-hospital "Jewish life" details, keyed by hospital id. Loaded into
// the `hospital` table's `info` column by scripts/seed-hospitals.mjs; after
// seeding the app reads it from the DB, not this file.
/** @type {Record<string, import('@/types').HospitalInfo>} */
export const hospitalInfo = {
  penn: {
    jewishMedicalProfessionals: [
      { name: "Dr. Rachel Silverman", specialty: "Oncology" },
      { name: "Dr. Daniel Katz", specialty: "Cardiology" },
      { name: "Dr. Miriam Feldman", specialty: "Nephrology" },
      { name: "Dr. Aaron Lebowitz", specialty: "Internal Medicine" },
    ],
    bikurCholim: {
      room: "Perelman Center, Room 1B-04 (ground floor, near main entrance)",
      contact: { name: "Chana Rosenblatt", phone: "(215) 555-2101" },
    },
    prayerSpace: "The Spiritual Care Suite is located on the 3rd floor of the Hospital of the University of Pennsylvania, Room 3W-201. Siddurim and Jewish prayer items are available. The room is accessible 24/7 with a patient ID badge.",
    jewishChaplain: { name: "Rabbi Yitzchak Bloom", phone: "(215) 555-2150" },
    shabbatAccommodations: "HUP offers Shabbat-compatible electric beds and nurse call systems on request. Key-card elevator override available for Shabbat. Kosher Shabbat meals available with 48-hour advance notice through the dietary department. Hospitality cots available for family members staying over Shabbat.",
  },

  chop: {
    jewishMedicalProfessionals: [
      { name: "Dr. Esther Goldberg", specialty: "Pediatric Hematology" },
      { name: "Dr. Noah Weiss", specialty: "Pediatric Cardiology" },
      { name: "Dr. Sarah Horowitz", specialty: "Pediatric Neurology" },
      { name: "Dr. Benjamin Stern", specialty: "Pediatric Surgery" },
      { name: "Dr. Leah Friedman", specialty: "Neonatology" },
    ],
    bikurCholim: {
      room: "Wood Building, Room WB-G12 (ground floor, South Tower)",
      contact: { name: "Moshe Adler", phone: "(215) 555-3201" },
    },
    prayerSpace: "CHOP's Interfaith Chapel is located on the 1st floor of the Main Building. A dedicated Jewish prayer area with siddurim, machzor, and Shabbat candles is available in the adjacent Family Resource Room (FR-104). Open 24/7.",
    jewishChaplain: { name: "Rabbi Devorah Stein", phone: "(215) 555-3250" },
    shabbatAccommodations: "CHOP provides Shabbos-compatible IV pumps and monitoring equipment. Dedicated Shabbos elevator on the East Wing runs automatically. Hot Shabbat meals available from the kosher kitchen with 72-hour advance notice. The Bikur Cholim room stocks food and supplies for families staying over Shabbat.",
  },

  jefferson: {
    jewishMedicalProfessionals: [
      { name: "Dr. Michael Bernstein", specialty: "Gastroenterology" },
      { name: "Dr. Judith Rosen", specialty: "Rheumatology" },
      { name: "Dr. Samuel Cohen", specialty: "Pulmonology" },
    ],
    bikurCholim: {
      room: "Gibbon Building, Room G-202 (2nd floor, near the cafeteria)",
      contact: { name: "Rivka Perlman", phone: "(215) 555-4101" },
    },
    prayerSpace: "Jefferson's Quiet Room and Chapel is on the 4th floor of the main Gibbon Building (Room 4-C). Jewish prayer books available at the front desk. Wudu station and separate seating area for Jewish prayer. Accessible around the clock.",
    jewishChaplain: { name: "Rabbi Aryeh Gross", phone: "(215) 555-4150" },
    shabbatAccommodations: "Jefferson Hospital can arrange Shabbat-mode settings on medical devices upon request via the nursing staff. A Shabbat hospitality package (pre-prepared meals, candles, grape juice) can be arranged through the chaplain. Families may request a dedicated cot in private rooms at no extra charge for Shabbat.",
  },

  temple: {
    jewishMedicalProfessionals: [
      { name: "Dr. Naomi Klein", specialty: "Infectious Disease" },
      { name: "Dr. David Shapiro", specialty: "Orthopedic Surgery" },
      { name: "Dr. Hannah Levi", specialty: "Geriatrics" },
    ],
    bikurCholim: {
      room: "Parkinson Pavilion, Room PP-115 (1st floor, near the Chapel)",
      contact: { name: "Yosef Greenwald", phone: "(215) 555-5101" },
    },
    prayerSpace: "Temple University Hospital's Chapel is located in the Parkinson Pavilion, 1st floor (PP-117), adjacent to the Bikur Cholim room. Siddurim and other Jewish prayer materials are stocked in the Bikur Cholim room. Open at all hours.",
    jewishChaplain: { name: "Rabbi Penina Marcus", phone: "(215) 555-5150" },
    shabbatAccommodations: "Temple Hospital nursing staff are trained to assist with Shabbat accommodations including elevator holds and light adjustments. Kosher Shabbat meals available by contacting the dietary department at least 48 hours in advance. The Bikur Cholim room provides challah, grape juice, and candles each Friday.",
  },
};
