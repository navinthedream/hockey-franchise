import fs from 'fs';
import path from 'path';
import { League } from './types';

const DATA_DIR = path.join(process.cwd(), 'data');
const SAVE_PATH = path.join(DATA_DIR, 'save.json');

export function loadLeague(): League | null {
  try {
    if (!fs.existsSync(SAVE_PATH)) return null;
    const raw = fs.readFileSync(SAVE_PATH, 'utf-8');
    return JSON.parse(raw) as League;
  } catch {
    return null;
  }
}

export function saveLeague(league: League) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SAVE_PATH, JSON.stringify(league));
}

export function deleteSave() {
  if (fs.existsSync(SAVE_PATH)) fs.unlinkSync(SAVE_PATH);
}
