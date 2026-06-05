export const synagogues = [
  // ── Penn / HUP ──────────────────────────────────────────────────────────────
  {
    id: "yibc",
    name: "Young Israel of Bala Cynwyd",
    denomination: "Orthodox",
    hospitalId: "penn",
    distance: 2.3,
    address: "Bala Cynwyd, PA 19004",
    location: "248 Haverford Rd, Bala Cynwyd, PA 19004",
    davening: [
      { label: "Shacharit (Sun)", time: "8:00am" },
      { label: "Shacharit (Mon–Fri)", time: "6:45am" },
      { label: "Mincha/Maariv", time: "Sunset +20 min" },
      { label: "Shabbat (Fri)", time: "7:30pm" },
      { label: "Shabbat (Sat)", time: "9:00am" },
    ],
    contacts: [
      { name: "Rabbi Moshe Stern", role: "Rabbi", phone: "(610) 664-1230" },
      { name: "Avi Goldstein", role: "Gabbai", phone: "(610) 555-0182" },
    ],
    whatsappGroups: [
      { name: "YIBC Main", link: "https://chat.whatsapp.com/example-yibc-main" },
      { name: "YIBC Bikur Cholim", link: "https://chat.whatsapp.com/example-yibc-bikur" },
    ],
    representative: { name: "Devorah Levine", phone: "(610) 555-0247" },
  },
  {
    id: "kms",
    name: "Keneseth Machzikei Shabbos",
    denomination: "Orthodox",
    hospitalId: "penn",
    distance: 1.8,
    address: "West Philadelphia, PA 19104",
    location: "4226 Spruce St, Philadelphia, PA 19104",
    davening: [
      { label: "Shacharit (daily)", time: "7:15am" },
      { label: "Mincha/Maariv", time: "15 min before sunset" },
      { label: "Shabbat (Fri)", time: "6:45pm" },
      { label: "Shabbat (Sat)", time: "8:45am" },
    ],
    contacts: [
      { name: "Rabbi Yehuda Kaplan", role: "Rabbi", phone: "(215) 555-0314" },
      { name: "Shmuel Rosen", role: "President", phone: "(215) 555-0428" },
    ],
    whatsappGroups: [
      { name: "KMS Community", link: "https://chat.whatsapp.com/example-kms-main" },
    ],
    representative: { name: "Rivka Friedman", phone: "(215) 555-0391" },
  },
  {
    id: "mlrt",
    name: "Main Line Reform Temple",
    denomination: "Reform",
    hospitalId: "penn",
    distance: 3.1,
    address: "Bryn Mawr, PA 19010",
    location: "410 Montgomery Ave, Bryn Mawr, PA 19010",
    davening: [
      { label: "Friday evening", time: "6:30pm" },
      { label: "Shabbat morning", time: "10:30am" },
    ],
    contacts: [
      { name: "Rabbi Sarah Cohen", role: "Senior Rabbi", phone: "(610) 527-2500" },
      { name: "Cantor David Marx", role: "Cantor", phone: "(610) 527-2501" },
    ],
    whatsappGroups: [
      { name: "MLRT Families", link: "https://chat.whatsapp.com/example-mlrt-families" },
    ],
    representative: { name: "Jonathan Weiss", phone: "(610) 555-0156" },
  },
  {
    id: "betp",
    name: "Beth Sholom Congregation",
    denomination: "Conservative",
    hospitalId: "penn",
    distance: 4.2,
    address: "Elkins Park, PA 19027",
    location: "8231 Old York Rd, Elkins Park, PA 19027",
    davening: [
      { label: "Shacharit (Mon–Fri)", time: "7:30am" },
      { label: "Shacharit (Sat)", time: "9:30am" },
      { label: "Friday evening", time: "6:00pm" },
    ],
    contacts: [
      { name: "Rabbi Jeremy Fine", role: "Rabbi", phone: "(215) 887-1342" },
      { name: "Naomi Berkowitz", role: "Executive Director", phone: "(215) 887-1343" },
    ],
    whatsappGroups: [
      { name: "Beth Sholom Community", link: "https://chat.whatsapp.com/example-bsholom-main" },
      { name: "Beth Sholom Minyan", link: "https://chat.whatsapp.com/example-bsholom-minyan" },
    ],
    representative: { name: "Daniel Horowitz", phone: "(215) 555-0203" },
  },

  // ── CHOP ────────────────────────────────────────────────────────────────────
  {
    id: "kia",
    name: "Kesher Israel Congregation",
    denomination: "Orthodox",
    hospitalId: "chop",
    distance: 1.2,
    address: "Philadelphia, PA 19103",
    location: "412 Lombard St, Philadelphia, PA 19147",
    davening: [
      { label: "Shacharit (Sun)", time: "8:30am" },
      { label: "Shacharit (Mon–Fri)", time: "7:00am" },
      { label: "Mincha/Maariv", time: "10 min before sunset" },
      { label: "Shabbat (Fri)", time: "6:30pm" },
      { label: "Shabbat (Sat)", time: "9:00am" },
    ],
    contacts: [
      { name: "Rabbi Albert Gabbai", role: "Rabbi", phone: "(215) 922-1776" },
      { name: "Isaac Azose", role: "Gabbai", phone: "(215) 555-0512" },
    ],
    whatsappGroups: [
      { name: "Kesher Israel", link: "https://chat.whatsapp.com/example-ki-main" },
      { name: "KI Bikur Cholim – CHOP", link: "https://chat.whatsapp.com/example-ki-chop" },
    ],
    representative: { name: "Miriam Sephardi", phone: "(215) 555-0571" },
  },
  {
    id: "mkor",
    name: "Congregation Mikveh Israel",
    denomination: "Orthodox (Sephardic)",
    hospitalId: "chop",
    distance: 2.0,
    address: "Philadelphia, PA 19106",
    location: "44 N 4th St, Philadelphia, PA 19106",
    davening: [
      { label: "Shacharit (Sun)", time: "8:00am" },
      { label: "Shacharit (weekdays)", time: "7:30am" },
      { label: "Shabbat (Fri)", time: "6:15pm" },
      { label: "Shabbat (Sat)", time: "9:00am" },
    ],
    contacts: [
      { name: "Rabbi Dov Shafner", role: "Rabbi", phone: "(215) 922-5446" },
      { name: "Aaron Benveniste", role: "President", phone: "(215) 555-0634" },
    ],
    whatsappGroups: [
      { name: "Mikveh Israel Community", link: "https://chat.whatsapp.com/example-mi-main" },
    ],
    representative: { name: "Esther Cattan", phone: "(215) 555-0688" },
  },
  {
    id: "rsst",
    name: "Rodeph Shalom",
    denomination: "Reform",
    hospitalId: "chop",
    distance: 2.7,
    address: "Philadelphia, PA 19103",
    location: "615 N Broad St, Philadelphia, PA 19123",
    davening: [
      { label: "Friday evening", time: "6:00pm" },
      { label: "Shabbat morning", time: "10:30am" },
      { label: "Tot Shabbat", time: "10:00am" },
    ],
    contacts: [
      { name: "Rabbi Jill Maderer", role: "Senior Rabbi", phone: "(215) 627-6747" },
      { name: "Cantor Liz Erman", role: "Cantor", phone: "(215) 627-6748" },
    ],
    whatsappGroups: [
      { name: "Rodeph Shalom Families", link: "https://chat.whatsapp.com/example-rs-families" },
    ],
    representative: { name: "Gary Blumenthal", phone: "(215) 555-0712" },
  },

  // ── Jefferson ────────────────────────────────────────────────────────────────
  {
    id: "msh",
    name: "Congregation M'kor Shalom",
    denomination: "Conservative",
    hospitalId: "jefferson",
    distance: 1.5,
    address: "Cherry Hill, NJ 08002",
    location: "10 Haverford Rd, Cherry Hill, NJ 08002",
    davening: [
      { label: "Shacharit (Mon–Fri)", time: "7:00am" },
      { label: "Shacharit (Sun)", time: "9:00am" },
      { label: "Shabbat (Fri)", time: "6:30pm" },
      { label: "Shabbat (Sat)", time: "9:00am" },
    ],
    contacts: [
      { name: "Rabbi Irwin Huberman", role: "Rabbi", phone: "(856) 667-0016" },
      { name: "Lisa Sherman", role: "Administrator", phone: "(856) 667-0017" },
    ],
    whatsappGroups: [
      { name: "M'kor Shalom Main", link: "https://chat.whatsapp.com/example-mkor-main" },
      { name: "M'kor Bikur Cholim", link: "https://chat.whatsapp.com/example-mkor-bikur" },
    ],
    representative: { name: "Paul Liebowitz", phone: "(856) 555-0834" },
  },
  {
    id: "bmt",
    name: "Congregation Beth El",
    denomination: "Conservative",
    hospitalId: "jefferson",
    distance: 2.4,
    address: "Voorhees, NJ 08043",
    location: "2 Edgewood Rd, Voorhees, NJ 08043",
    davening: [
      { label: "Shacharit (weekdays)", time: "7:15am" },
      { label: "Shabbat (Fri)", time: "7:00pm" },
      { label: "Shabbat (Sat)", time: "9:30am" },
    ],
    contacts: [
      { name: "Rabbi Eric Wisnia", role: "Rabbi", phone: "(856) 424-2900" },
      { name: "Howard Goldman", role: "Gabbai", phone: "(856) 555-0916" },
    ],
    whatsappGroups: [
      { name: "Beth El Community", link: "https://chat.whatsapp.com/example-bethel-main" },
    ],
    representative: { name: "Susan Kaminsky", phone: "(856) 555-0972" },
  },

  // ── Temple ───────────────────────────────────────────────────────────────────
  {
    id: "ohy",
    name: "Ohev Shalom — The National Synagogue",
    denomination: "Conservative",
    hospitalId: "temple",
    distance: 0.9,
    address: "Philadelphia, PA 19141",
    location: "5593 N 5th St, Philadelphia, PA 19120",
    davening: [
      { label: "Shacharit (Sun)", time: "8:30am" },
      { label: "Shacharit (Mon–Fri)", time: "7:00am" },
      { label: "Shabbat (Fri)", time: "6:00pm" },
      { label: "Shabbat (Sat)", time: "9:30am" },
    ],
    contacts: [
      { name: "Rabbi Michael Stein", role: "Rabbi", phone: "(215) 555-1042" },
      { name: "Barbara Cohen", role: "Office Manager", phone: "(215) 555-1043" },
    ],
    whatsappGroups: [
      { name: "Ohev Shalom Community", link: "https://chat.whatsapp.com/example-ohy-main" },
      { name: "Ohev Bikur Cholim", link: "https://chat.whatsapp.com/example-ohy-bikur" },
    ],
    representative: { name: "Rachel Goldberg", phone: "(215) 555-1098" },
  },
  {
    id: "bng",
    name: "B'nai Abraham",
    denomination: "Orthodox",
    hospitalId: "temple",
    distance: 2.1,
    address: "Philadelphia, PA 19130",
    location: "527 Lombard St, Philadelphia, PA 19147",
    davening: [
      { label: "Shacharit (daily)", time: "7:30am" },
      { label: "Mincha/Maariv", time: "At sunset" },
      { label: "Shabbat (Fri)", time: "7:00pm" },
      { label: "Shabbat (Sat)", time: "9:00am" },
    ],
    contacts: [
      { name: "Rabbi Yosef Greenberg", role: "Rabbi", phone: "(215) 555-1134" },
      { name: "Chaim Weissman", role: "Gabbai", phone: "(215) 555-1189" },
    ],
    whatsappGroups: [
      { name: "B'nai Abraham Shul", link: "https://chat.whatsapp.com/example-bna-main" },
    ],
    representative: { name: "Leah Perlstein", phone: "(215) 555-1201" },
  },
];
