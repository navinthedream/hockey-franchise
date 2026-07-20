// Pure client-safe data — no server imports.
// Imported by TeamPicker (client component) and re-exported by generator.ts.

export interface TeamSeed {
  city: string;
  name: string;
  abbr: string;
  conference: 'Eastern' | 'Western';
  division: string;
}

export const TEAM_SEEDS: TeamSeed[] = [
  // Eastern – Atlantic
  { city: 'Boston',       name: 'Bruins',         abbr: 'BOS', conference: 'Eastern', division: 'Atlantic' },
  { city: 'Buffalo',      name: 'Sabres',          abbr: 'BUF', conference: 'Eastern', division: 'Atlantic' },
  { city: 'Detroit',      name: 'Red Wings',       abbr: 'DET', conference: 'Eastern', division: 'Atlantic' },
  { city: 'Florida',      name: 'Panthers',        abbr: 'FLA', conference: 'Eastern', division: 'Atlantic' },
  { city: 'Montréal',    name: 'Canadiens',       abbr: 'MTL', conference: 'Eastern', division: 'Atlantic' },
  { city: 'Ottawa',       name: 'Senators',        abbr: 'OTT', conference: 'Eastern', division: 'Atlantic' },
  { city: 'Tampa Bay',    name: 'Lightning',       abbr: 'TBL', conference: 'Eastern', division: 'Atlantic' },
  { city: 'Toronto',      name: 'Maple Leafs',     abbr: 'TOR', conference: 'Eastern', division: 'Atlantic' },
  // Eastern – Metropolitan
  { city: 'Carolina',     name: 'Hurricanes',      abbr: 'CAR', conference: 'Eastern', division: 'Metropolitan' },
  { city: 'Columbus',     name: 'Blue Jackets',    abbr: 'CBJ', conference: 'Eastern', division: 'Metropolitan' },
  { city: 'New Jersey',   name: 'Devils',          abbr: 'NJD', conference: 'Eastern', division: 'Metropolitan' },
  { city: 'New York',     name: 'Islanders',       abbr: 'NYI', conference: 'Eastern', division: 'Metropolitan' },
  { city: 'New York',     name: 'Rangers',         abbr: 'NYR', conference: 'Eastern', division: 'Metropolitan' },
  { city: 'Philadelphia', name: 'Flyers',          abbr: 'PHI', conference: 'Eastern', division: 'Metropolitan' },
  { city: 'Pittsburgh',   name: 'Penguins',        abbr: 'PIT', conference: 'Eastern', division: 'Metropolitan' },
  { city: 'Washington',   name: 'Capitals',        abbr: 'WSH', conference: 'Eastern', division: 'Metropolitan' },
  // Western – Central
  { city: 'Chicago',      name: 'Blackhawks',      abbr: 'CHI', conference: 'Western', division: 'Central' },
  { city: 'Colorado',     name: 'Avalanche',       abbr: 'COL', conference: 'Western', division: 'Central' },
  { city: 'Dallas',       name: 'Stars',           abbr: 'DAL', conference: 'Western', division: 'Central' },
  { city: 'Minnesota',    name: 'Wild',            abbr: 'MIN', conference: 'Western', division: 'Central' },
  { city: 'Nashville',    name: 'Predators',       abbr: 'NSH', conference: 'Western', division: 'Central' },
  { city: 'St. Louis',    name: 'Blues',           abbr: 'STL', conference: 'Western', division: 'Central' },
  { city: 'Utah',         name: 'Mammoth',         abbr: 'UTA', conference: 'Western', division: 'Central' },
  { city: 'Winnipeg',     name: 'Jets',            abbr: 'WPG', conference: 'Western', division: 'Central' },
  // Western – Pacific
  { city: 'Anaheim',      name: 'Ducks',           abbr: 'ANA', conference: 'Western', division: 'Pacific' },
  { city: 'Calgary',      name: 'Flames',          abbr: 'CGY', conference: 'Western', division: 'Pacific' },
  { city: 'Edmonton',     name: 'Oilers',          abbr: 'EDM', conference: 'Western', division: 'Pacific' },
  { city: 'Los Angeles',  name: 'Kings',           abbr: 'LAK', conference: 'Western', division: 'Pacific' },
  { city: 'San Jose',     name: 'Sharks',          abbr: 'SJS', conference: 'Western', division: 'Pacific' },
  { city: 'Seattle',      name: 'Kraken',          abbr: 'SEA', conference: 'Western', division: 'Pacific' },
  { city: 'Vancouver',    name: 'Canucks',         abbr: 'VAN', conference: 'Western', division: 'Pacific' },
  { city: 'Vegas',        name: 'Golden Knights',  abbr: 'VGK', conference: 'Western', division: 'Pacific' },
];
