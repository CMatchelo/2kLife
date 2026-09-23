import type { ImportContext, ImportImage } from '../src/types/career.ts';
import { normalizeSeason } from '../src/domain/career.ts';
import { ValidationError } from './careers.ts';

export function parseImportRequest(raw: unknown): { context: ImportContext; images: ImportImage[] } {
  const value = raw as { context?: ImportContext; images?: ImportImage[] };
  const c = value?.context;
  if (!c || typeof c.seasonYear !== 'string' || !normalizeSeason(c.seasonYear) || typeof c.era !== 'string' || !c.era.trim() || c.era.length > 80 || !Array.isArray(c.teams) || c.teams.length < 1 || c.teams.length > 100 || c.teams.some(t => !t || typeof t.id !== 'string' || !/^[\w-]{1,80}$/.test(t.id) || typeof t.name !== 'string' || !t.name.trim() || t.name.length > 100) || !c.teams.some(t => t.id === c.teamId)) throw new ValidationError('Confirm a valid era, season, current team, and team list before importing.');
  if (!Array.isArray(value.images) || !value.images.length || value.images.length > 6) throw new ValidationError('Choose one to six PNG, JPEG, or WebP images.');
  let total = 0;
  for (const image of value.images) {
    if (!image || !['image/png', 'image/jpeg', 'image/webp'].includes(image.mediaType) || typeof image.data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)) throw new ValidationError('Invalid image format. Use PNG, JPEG, or WebP.');
    const buffer = Buffer.from(image.data, 'base64'); total += buffer.length;
    if (buffer.length > 4 * 1024 * 1024 || !buffer.length || buffer.toString('base64') !== image.data) throw new ValidationError('Each image must be at most 4 MiB.');
    const valid = image.mediaType === 'image/png' ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : image.mediaType === 'image/jpeg' ? buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255 : buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
    if (!valid) throw new ValidationError('The image content does not match its file type.');
  }
  if (total > 12 * 1024 * 1024) throw new ValidationError('Images must total at most 12 MiB per import.');
  return { context: { seasonYear: normalizeSeason(c.seasonYear)!, era: c.era.trim(), teamId: c.teamId, teams: c.teams.map(t => ({ id: t.id, name: t.name, source: t.source === 'modern' ? 'modern' : 'custom' })) }, images: value.images.map(i => ({ mediaType: i.mediaType, data: i.data })) };
}
