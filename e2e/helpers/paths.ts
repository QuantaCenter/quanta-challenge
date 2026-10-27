import path from 'node:path';

export const SCREENSHOT_DIR = path.resolve(import.meta.dirname, '../screenshots');

export const AUTH_DIR = path.resolve(import.meta.dirname, '../.auth');
export const AUTH_FILE = path.join(AUTH_DIR, 'admin.json');
