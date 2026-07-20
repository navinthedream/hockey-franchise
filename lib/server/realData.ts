import 'server-only';
import fs from 'fs';
import path from 'path';
import type { RealLeagueJson } from '../generator';

let _cache: RealLeagueJson | null = null;

export function loadRealData(): RealLeagueJson {
  if (_cache) return _cache;
  const filePath = path.join(process.cwd(), 'data', 'real-league-2025-26.json');
  _cache = JSON.parse(fs.readFileSync(filePath, 'utf8')) as RealLeagueJson;
  return _cache;
}
