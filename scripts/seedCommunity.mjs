// Which community the setup and import scripts write to (Nov 20, the
// health sweep). community_id had a default of 'philly' (migration 027),
// so a script that never said which community still landed somewhere; with
// several communities that's a silent misfile, and migration 104 drops it.
// So every row these scripts write names its community, and every read
// they make asks for that community's rows only.
//
//   COMMUNITY=ues npm run setup     seeds the 'ues' community
//
// Otherwise the config's community, src/lib/configCommunity.ts (a test
// keeps the two the same).
export const SEED_COMMUNITY = process.env.COMMUNITY || 'philly'
