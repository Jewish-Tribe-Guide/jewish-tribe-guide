// ── Grocery Stores ────────────────────────────────────────────────────────────
export const groceries = [
  // Penn / HUP
  { id: "g1", name: "Kosher Mart", hospitalId: "penn", distance: 1.8, address: "7706 Castor Ave, Philadelphia, PA 19152", phone: "(215) 722-5600", isKosher: true },
  { id: "g2", name: "Whole Foods Market – City Avenue", hospitalId: "penn", distance: 2.1, address: "339 E City Ave, Bala Cynwyd, PA 19004", phone: "(610) 668-9696", isKosher: false },
  { id: "g3", name: "ShopRite of Bala Cynwyd", hospitalId: "penn", distance: 2.6, address: "32 E City Ave, Bala Cynwyd, PA 19004", phone: "(610) 664-0600", isKosher: false },
  { id: "g4", name: "Halpern's Glatt Kosher", hospitalId: "penn", distance: 3.4, address: "7618 Castor Ave, Philadelphia, PA 19152", phone: "(215) 725-4242", isKosher: true },
  { id: "g5", name: "Trader Joe's – Wynnewood", hospitalId: "penn", distance: 3.8, address: "2121 Wynnewood Rd, Wynnewood, PA 19096", phone: "(610) 896-3737", isKosher: false },

  // CHOP
  { id: "g6", name: "Reading Terminal Market", hospitalId: "chop", distance: 1.0, address: "51 N 12th St, Philadelphia, PA 19107", phone: "(215) 922-2317", isKosher: false },
  { id: "g7", name: "The Fresh Grocer – South St", hospitalId: "chop", distance: 1.4, address: "1501 South St, Philadelphia, PA 19146", phone: "(215) 985-0015", isKosher: false },
  { id: "g8", name: "Trader Joe's – Rittenhouse", hospitalId: "chop", distance: 1.7, address: "2121 Market St, Philadelphia, PA 19103", phone: "(215) 569-9282", isKosher: false },
  { id: "g9", name: "Di Bruno Bros.", hospitalId: "chop", distance: 2.0, address: "930 S 9th St, Philadelphia, PA 19147", phone: "(215) 922-2876", isKosher: false },

  // Jefferson
  { id: "g10", name: "Reading Terminal Market", hospitalId: "jefferson", distance: 0.5, address: "51 N 12th St, Philadelphia, PA 19107", phone: "(215) 922-2317", isKosher: false },
  { id: "g11", name: "ShopRite of Cherry Hill", hospitalId: "jefferson", distance: 2.2, address: "2120 NJ-38, Cherry Hill, NJ 08002", phone: "(856) 661-1700", isKosher: false },
  { id: "g12", name: "Kosher West – Cherry Hill", hospitalId: "jefferson", distance: 3.1, address: "1680 NJ-70, Cherry Hill, NJ 08003", phone: "(856) 424-1100", isKosher: true },

  // Temple
  { id: "g13", name: "Cousin's Supermarket", hospitalId: "temple", distance: 0.7, address: "1730 W Erie Ave, Philadelphia, PA 19140", phone: "(215) 228-5900", isKosher: false },
  { id: "g14", name: "Acme Markets – Cheltenham", hospitalId: "temple", distance: 2.3, address: "2350 Cheltenham Ave, Philadelphia, PA 19150", phone: "(215) 924-7001", isKosher: false },
  { id: "g15", name: "Kosher Spot – Cheltenham", hospitalId: "temple", distance: 2.8, address: "1 Cheltenham Ave, Elkins Park, PA 19027", phone: "(215) 885-4100", isKosher: true },
]

// ── Restaurants ───────────────────────────────────────────────────────────────
export const restaurants = [
  // Penn / HUP
  { id: "r1", name: "Citrus – Kosher Mediterranean", hospitalId: "penn", distance: 2.2, address: "8031 Castor Ave, Philadelphia, PA 19152", phone: "(215) 745-7140", isKosher: true },
  { id: "r2", name: "Sang Kee Peking Duck – Wynnewood", hospitalId: "penn", distance: 2.5, address: "339 E City Ave, Wynnewood, PA 19096", phone: "(610) 642-3777", isKosher: false },
  { id: "r3", name: "White Dog Café – Wayne", hospitalId: "penn", distance: 3.0, address: "200 W Lancaster Ave, Wayne, PA 19087", phone: "(610) 225-3700", isKosher: false },
  { id: "r4", name: "New Samosa House", hospitalId: "penn", distance: 3.3, address: "7630 Castor Ave, Philadelphia, PA 19152", phone: "(215) 742-6400", isKosher: true },

  // CHOP
  { id: "r5", name: "Famous 4th Street Deli", hospitalId: "chop", distance: 0.8, address: "700 S 4th St, Philadelphia, PA 19147", phone: "(215) 922-3274", isKosher: false },
  { id: "r6", name: "Zahav", hospitalId: "chop", distance: 1.0, address: "237 St James Pl, Philadelphia, PA 19106", phone: "(215) 625-8800", isKosher: false },
  { id: "r7", name: "Dizengoff", hospitalId: "chop", distance: 1.3, address: "1625 Sansom St, Philadelphia, PA 19103", phone: "(215) 867-8181", isKosher: false },
  { id: "r8", name: "Abe Fisher", hospitalId: "chop", distance: 1.5, address: "1623 Sansom St, Philadelphia, PA 19103", phone: "(215) 867-0088", isKosher: false },

  // Jefferson
  { id: "r9", name: "Continental Mid-Town", hospitalId: "jefferson", distance: 0.4, address: "1801 Chestnut St, Philadelphia, PA 19103", phone: "(215) 567-1800", isKosher: false },
  { id: "r10", name: "Kosher Bite – Cherry Hill", hospitalId: "jefferson", distance: 2.9, address: "1606 Marlkress Rd, Cherry Hill, NJ 08003", phone: "(856) 874-0100", isKosher: true },
  { id: "r11", name: "Cherry Hill Diner", hospitalId: "jefferson", distance: 3.2, address: "1800 NJ-70, Cherry Hill, NJ 08003", phone: "(856) 428-0200", isKosher: false },

  // Temple
  { id: "r12", name: "Trolley Car Diner", hospitalId: "temple", distance: 1.4, address: "7619 Germantown Ave, Philadelphia, PA 19119", phone: "(215) 753-1500", isKosher: false },
  { id: "r13", name: "Hillel Café – Temple", hospitalId: "temple", distance: 0.3, address: "1507 Cecil B Moore Ave, Philadelphia, PA 19121", phone: "(215) 204-7521", isKosher: true },
  { id: "r14", name: "La Locanda del Ghiottone", hospitalId: "temple", distance: 2.1, address: "130 N 3rd St, Philadelphia, PA 19106", phone: "(215) 829-1465", isKosher: false },
]

// ── Hotels ────────────────────────────────────────────────────────────────────
export const hotels = [
  // Penn / HUP
  { id: "h1", name: "Hilton Philadelphia City Avenue", hospitalId: "penn", distance: 1.2, address: "4200 City Ave, Philadelphia, PA 19131", phone: "(215) 879-4000", shuttleAvailable: true, shabbatFriendly: true, notes: "Walking distance to shul; Shabbat-friendly elevator" },
  { id: "h2", name: "Marriott Philadelphia West", hospitalId: "penn", distance: 1.9, address: "111 Crawford Ave, West Conshohocken, PA 19428", phone: "(610) 941-5600", shuttleAvailable: false, shabbatFriendly: false, notes: "Free parking; 10 min drive" },
  { id: "h3", name: "DoubleTree by Hilton – Bala Cynwyd", hospitalId: "penn", distance: 2.0, address: "550 E Swedesford Rd, Berwyn, PA 19312", phone: "(610) 644-2000", shuttleAvailable: true, shabbatFriendly: true },
  { id: "h4", name: "Sheraton Bucks County", hospitalId: "penn", distance: 3.1, address: "400 Oxford Valley Rd, Langhorne, PA 19047", phone: "(215) 547-4100", shuttleAvailable: false, shabbatFriendly: false },

  // CHOP
  { id: "h5", name: "Loews Philadelphia Hotel", hospitalId: "chop", distance: 0.9, address: "1200 Market St, Philadelphia, PA 19107", phone: "(215) 627-1200", shuttleAvailable: false, shabbatFriendly: true, notes: "Within walking distance; concierge familiar with hospital families" },
  { id: "h6", name: "DoubleTree by Hilton – Center City", hospitalId: "chop", distance: 1.1, address: "237 S Broad St, Philadelphia, PA 19107", phone: "(215) 893-1600", shuttleAvailable: false, shabbatFriendly: false },
  { id: "h7", name: "Philadelphia Marriott Downtown", hospitalId: "chop", distance: 1.3, address: "1201 Market St, Philadelphia, PA 19107", phone: "(215) 625-2900", shuttleAvailable: false, shabbatFriendly: false, notes: "Family discount available; mention CHOP" },
  { id: "h8", name: "Hampton Inn Philadelphia Center City", hospitalId: "chop", distance: 1.5, address: "1301 Race St, Philadelphia, PA 19107", phone: "(215) 665-9100", shuttleAvailable: false, shabbatFriendly: false },

  // Jefferson
  { id: "h9", name: "Le Méridien Philadelphia", hospitalId: "jefferson", distance: 0.3, address: "1421 Arch St, Philadelphia, PA 19102", phone: "(215) 422-8200", shuttleAvailable: false, shabbatFriendly: true, notes: "Closest hotel to Jefferson; walking distance" },
  { id: "h10", name: "Hyatt at The Bellevue", hospitalId: "jefferson", distance: 0.5, address: "200 S Broad St, Philadelphia, PA 19102", phone: "(215) 893-1234", shuttleAvailable: false, shabbatFriendly: false },
  { id: "h11", name: "Sheraton Philadelphia Downtown", hospitalId: "jefferson", distance: 0.7, address: "201 N 17th St, Philadelphia, PA 19103", phone: "(215) 448-2000", shuttleAvailable: false, shabbatFriendly: false },

  // Temple
  { id: "h12", name: "Hampton Inn Philadelphia – Convention Center", hospitalId: "temple", distance: 2.1, address: "1301 Race St, Philadelphia, PA 19107", phone: "(215) 665-9100", shuttleAvailable: false, shabbatFriendly: false },
  { id: "h13", name: "Courtyard by Marriott – North Philadelphia", hospitalId: "temple", distance: 2.4, address: "3990 Ford Rd, Philadelphia, PA 19131", phone: "(215) 877-9999", shuttleAvailable: true, shabbatFriendly: true, notes: "Complimentary shuttle to Temple campus" },
  { id: "h14", name: "Holiday Inn Philadelphia Stadium", hospitalId: "temple", distance: 3.0, address: "900 Packer Ave, Philadelphia, PA 19148", phone: "(215) 755-9500", shuttleAvailable: false, shabbatFriendly: false },
]

// ── Mikvahs ───────────────────────────────────────────────────────────────────
export const mikvahs = [
  { id: "m1", name: "Mikvah Israel of Philadelphia", hospitalId: "penn", distance: 2.1, address: "44 N 4th St, Philadelphia, PA 19106", phone: "(215) 922-5446", hours: "Sun–Thu 8:00–10:00pm; Fri as posted; Sat night after Shabbat" },
  { id: "m2", name: "Bala Cynwyd Community Mikvah", hospitalId: "penn", distance: 2.5, address: "401 Levering Mill Rd, Bala Cynwyd, PA 19004", phone: "(610) 664-4880", hours: "By appointment; call ahead" },

  { id: "m3", name: "Mikvah Israel of Philadelphia", hospitalId: "chop", distance: 1.8, address: "44 N 4th St, Philadelphia, PA 19106", phone: "(215) 922-5446", hours: "Sun–Thu 8:00–10:00pm; Fri as posted; Sat night after Shabbat" },
  { id: "m4", name: "Society Hill Mikvah", hospitalId: "chop", distance: 2.2, address: "320 Spruce St, Philadelphia, PA 19106", phone: "(215) 625-0000", hours: "Evenings by appointment; call 24 hours in advance" },

  { id: "m5", name: "Mikvah of Cherry Hill", hospitalId: "jefferson", distance: 2.8, address: "1050 E Evesham Rd, Cherry Hill, NJ 08003", phone: "(856) 424-5222", hours: "Sun–Thu evenings by appointment; call ahead" },
  { id: "m6", name: "Mikvah Israel of Philadelphia", hospitalId: "jefferson", distance: 3.5, address: "44 N 4th St, Philadelphia, PA 19106", phone: "(215) 922-5446", hours: "Sun–Thu 8:00–10:00pm; Fri as posted; Sat night after Shabbat" },

  { id: "m7", name: "Mikvah of Cheltenham", hospitalId: "temple", distance: 2.3, address: "7630 Old York Rd, Elkins Park, PA 19027", phone: "(215) 635-8940", hours: "Sun–Thu evenings by appointment; Motzei Shabbat available" },
  { id: "m8", name: "Mikvah Israel of Philadelphia", hospitalId: "temple", distance: 4.1, address: "44 N 4th St, Philadelphia, PA 19106", phone: "(215) 922-5446", hours: "Sun–Thu 8:00–10:00pm; Fri as posted; Sat night after Shabbat" },
]

// ── Eruv Information ──────────────────────────────────────────────────────────
export const eruvInfo = {
  penn: {
    hospitalId: "penn",
    statusLink: "https://www.phillyeruv.org/status",
    mapLink: "https://www.phillyeruv.org/map",
    contact: { name: "Rabbi Moshe Klein", phone: "(215) 555-9001" },
    notes: "The Main Line Eruv covers the area surrounding HUP including Bala Cynwyd, Wynnewood, and parts of West Philadelphia. Check status every Friday before Shabbat.",
  },
  chop: {
    hospitalId: "chop",
    statusLink: "https://www.phillyeruv.org/status",
    mapLink: "https://www.phillyeruv.org/map",
    contact: { name: "Rabbi Avi Hirsch", phone: "(215) 555-9012" },
    notes: "The Center City Eruv covers Society Hill, Queen Village, and Old City. CHOP is within the eruv boundary. Verify status weekly before Shabbat.",
  },
  jefferson: {
    hospitalId: "jefferson",
    statusLink: "https://www.phillyeruv.org/status",
    mapLink: "https://www.phillyeruv.org/map",
    contact: { name: "Rabbi Yosef Mandel", phone: "(215) 555-9023" },
    notes: "Jefferson Hospital is within the Center City Eruv. Cherry Hill has its own separate eruv — consult the Cherry Hill Eruv Association for NJ status.",
  },
  temple: {
    hospitalId: "temple",
    statusLink: "https://www.cheltenhameruv.org/status",
    mapLink: "https://www.cheltenhameruv.org/map",
    contact: { name: "Rabbi Nachman Goldstein", phone: "(215) 555-9034" },
    notes: "Temple University Hospital is not currently within an established eruv boundary. The Cheltenham eruv is 2 miles north. Consult your rabbi for specific guidance.",
  },
}

// ── Community WhatsApp Groups ─────────────────────────────────────────────────
export const whatsappGroups = [
  {
    id: "wa1",
    name: "Philadelphia Jewish Hospital Support",
    description: "General support, questions, and chizuk for Jewish families with loved ones in Philadelphia-area hospitals.",
    link: "https://chat.whatsapp.com/example-philly-hospital-support",
  },
  {
    id: "wa2",
    name: "Housing & Hospitality Network",
    description: "Find and offer free or low-cost housing for out-of-town families. Shabbos hospitality requests welcome.",
    link: "https://chat.whatsapp.com/example-housing-hospitality",
  },
  {
    id: "wa3",
    name: "Shabbat Info & Coordination",
    description: "Shabbat times, eruv status, meal coordination, and last-minute arrangements near Philadelphia hospitals.",
    link: "https://chat.whatsapp.com/example-shabbat-info",
  },
  {
    id: "wa4",
    name: "Kosher Food & Deliveries",
    description: "Coordinate kosher meal pickups, grocery runs, and restaurant recommendations near the hospitals.",
    link: "https://chat.whatsapp.com/example-kosher-food",
  },
  {
    id: "wa5",
    name: "Medical & Halacha Questions",
    description: "Connect with rabbinic guidance for medical halacha questions. Rabbis available to respond.",
    link: "https://chat.whatsapp.com/example-medical-halacha",
  },
]
