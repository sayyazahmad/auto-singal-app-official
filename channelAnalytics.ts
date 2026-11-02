// YouTube channel analytics: Google OAuth (owner's private analytics + revenue) and
// public lookup by handle (API key, public stats only).
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
  // Revenue metrics; Google only returns them for monetized channels
  'https://www.googleapis.com/auth/yt-analytics-monetary.readonly',
];
const ANALYTICS_CACHE_MS = 60 * 60_000;

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  cacheDir: string;
}

interface StoredTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope: string;
}

const tokenFile = (cfg: OAuthConfig) => path.join(cfg.cacheDir, 'youtube_oauth.json');

async function readTokens(cfg: OAuthConfig): Promise<StoredTokens | null> {
  try {
    return JSON.parse(await fs.readFile(tokenFile(cfg), 'utf-8'));
  } catch {
    return null;
  }
}

async function writeTokens(cfg: OAuthConfig, tokens: StoredTokens) {
  await fs.mkdir(cfg.cacheDir, { recursive: true });
  await fs.writeFile(tokenFile(cfg), JSON.stringify(tokens));
}

// CSRF protection for the OAuth round trip; single process, so memory is enough
const pendingStates = new Map<string, number>();

export function buildAuthUrl(cfg: OAuthConfig): string {
  const state = randomBytes(16).toString('hex');
  pendingStates.set(state, Date.now());
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    // Always ask, so Google returns a refresh token even on reconnect
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export function consumeState(state: string): boolean {
  const created = pendingStates.get(state);
  pendingStates.delete(state);
  return Boolean(created && Date.now() - created < 10 * 60_000);
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const json: any = await res.json();
  if (!res.ok) throw new Error(json.error_description || json.error || 'Google token request failed');
  return json;
}

export async function exchangeCode(cfg: OAuthConfig, code: string) {
  const json = await tokenRequest({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    grant_type: 'authorization_code',
  });
  if (!json.refresh_token) throw new Error('Google did not return a refresh token. Remove the app at myaccount.google.com/permissions and connect again.');
  await writeTokens(cfg, {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: Date.now() + (json.expires_in - 60) * 1000,
    scope: json.scope || '',
  });
  analyticsCache.clear();
}

async function accessToken(cfg: OAuthConfig): Promise<{ token: string; scope: string }> {
  const stored = await readTokens(cfg);
  if (!stored) throw new NotConnectedError();
  if (Date.now() < stored.expires_at) return { token: stored.access_token, scope: stored.scope };
  try {
    const json = await tokenRequest({
      refresh_token: stored.refresh_token,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: 'refresh_token',
    });
    const updated = { ...stored, access_token: json.access_token, expires_at: Date.now() + (json.expires_in - 60) * 1000 };
    await writeTokens(cfg, updated);
    return { token: updated.access_token, scope: updated.scope };
  } catch (err: any) {
    // Refresh tokens from an OAuth app in "Testing" mode expire after 7 days
    await fs.rm(tokenFile(cfg), { force: true });
    throw new NotConnectedError(`Your Google connection expired (${err.message}). Connect again.`);
  }
}

export class NotConnectedError extends Error {
  constructor(message = 'YouTube channel is not connected') {
    super(message);
  }
}

export async function isConnected(cfg: OAuthConfig) {
  return Boolean(await readTokens(cfg));
}

export async function disconnect(cfg: OAuthConfig) {
  const stored = await readTokens(cfg);
  if (stored) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(stored.refresh_token)}`, { method: 'POST' }).catch(() => {});
  }
  await fs.rm(tokenFile(cfg), { force: true });
  analyticsCache.clear();
}

async function googleGet(url: string, token: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json: any = await res.json();
  if (!res.ok) {
    const err: any = new Error(json.error?.message || `Google API error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

// Analytics reports come back as columnHeaders + rows; turn them into objects
async function report(token: string, params: Record<string, string>): Promise<Record<string, any>[]> {
  const qs = new URLSearchParams({ ids: 'channel==MINE', ...params });
  const json = await googleGet(`https://youtubeanalytics.googleapis.com/v2/reports?${qs}`, token);
  const headers: string[] = (json.columnHeaders || []).map((h: any) => h.name);
  return (json.rows || []).map((row: any[]) => Object.fromEntries(headers.map((h, i) => [h, row[i]])));
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export interface DailyPoint {
  date: string;
  views: number;
  watchMinutes: number;
  avgViewDuration: number;
  subscribersGained: number;
  subscribersLost: number;
  revenue: number | null;
}

const analyticsCache = new Map<number, { at: number; data: any }>();

export async function channelAnalytics(cfg: OAuthConfig, days: number) {
  const hit = analyticsCache.get(days);
  if (hit && Date.now() - hit.at < ANALYTICS_CACHE_MS) return { ...hit.data, cached: true };

  const { token, scope } = await accessToken(cfg);

  const channelJson = await googleGet('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', token);
  const ch = channelJson.items?.[0];
  if (!ch) throw new Error('This Google account has no YouTube channel.');

  // Analytics lag ~2 days; end yesterday. Fetch two periods so tiles can show change vs the previous one.
  const end = new Date(Date.now() - 86_400_000);
  const start = new Date(end.getTime() - (2 * days - 1) * 86_400_000);
  const startDate = isoDay(start);
  const endDate = isoDay(end);
  const currentStart = isoDay(new Date(end.getTime() - (days - 1) * 86_400_000));

  const [dailyRows, topRows, trafficRows] = await Promise.all([
    report(token, {
      startDate, endDate, dimensions: 'day', sort: 'day',
      metrics: 'views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost',
    }),
    report(token, {
      startDate: currentStart, endDate, dimensions: 'video', sort: '-views', maxResults: '10',
      metrics: 'views,estimatedMinutesWatched,averageViewPercentage,subscribersGained',
    }),
    report(token, {
      startDate: currentStart, endDate, dimensions: 'insightTrafficSourceType', sort: '-views',
      metrics: 'views',
    }),
  ]);

  // Revenue is a separate request: it fails for non-monetized channels or without the monetary scope
  let revenueRows: Record<string, any>[] | null = null;
  let revenueNote: string | null = null;
  if (!scope.includes('yt-analytics-monetary.readonly')) {
    revenueNote = 'Revenue permission was not granted. Disconnect and connect again, allowing revenue access.';
  } else {
    try {
      revenueRows = await report(token, { startDate, endDate, dimensions: 'day', sort: 'day', metrics: 'estimatedRevenue' });
    } catch (err: any) {
      revenueNote = err.status === 403
        ? 'YouTube only shares revenue for channels in the YouTube Partner Program.'
        : `Revenue unavailable: ${err.message}`;
    }
  }

  const byDay = new Map(dailyRows.map(r => [r.day, r]));
  const revenueByDay = new Map((revenueRows || []).map(r => [r.day, r.estimatedRevenue]));
  const daily: DailyPoint[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) {
    const day = isoDay(new Date(t));
    const r = byDay.get(day);
    daily.push({
      date: day,
      views: r?.views ?? 0,
      watchMinutes: r?.estimatedMinutesWatched ?? 0,
      avgViewDuration: r?.averageViewDuration ?? 0,
      subscribersGained: r?.subscribersGained ?? 0,
      subscribersLost: r?.subscribersLost ?? 0,
      revenue: revenueRows ? (revenueByDay.get(day) ?? 0) : null,
    });
  }

  const videoIds = topRows.map(r => r.video).filter(Boolean);
  const videoMeta = new Map<string, any>();
  if (videoIds.length) {
    const vids = await googleGet(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoIds.join(',')}`, token);
    for (const v of vids.items || []) videoMeta.set(v.id, v.snippet);
  }

  const data = {
    connected: true,
    channel: {
      id: ch.id,
      title: ch.snippet?.title,
      handle: ch.snippet?.customUrl,
      thumbnail: ch.snippet?.thumbnails?.medium?.url || ch.snippet?.thumbnails?.default?.url,
      subscribers: Number(ch.statistics?.subscriberCount || 0),
      totalViews: Number(ch.statistics?.viewCount || 0),
      videoCount: Number(ch.statistics?.videoCount || 0),
      hiddenSubscriberCount: Boolean(ch.statistics?.hiddenSubscriberCount),
    },
    range: { days, currentStart, endDate, previousStart: startDate },
    daily,
    revenueAvailable: Boolean(revenueRows),
    revenueNote,
    topVideos: topRows.map(r => ({
      videoId: r.video,
      title: videoMeta.get(r.video)?.title || r.video,
      thumbnail: videoMeta.get(r.video)?.thumbnails?.medium?.url || `https://i.ytimg.com/vi/${r.video}/mqdefault.jpg`,
      publishedAt: videoMeta.get(r.video)?.publishedAt,
      views: r.views,
      watchMinutes: r.estimatedMinutesWatched,
      avgViewPercentage: r.averageViewPercentage,
      subscribersGained: r.subscribersGained,
    })),
    trafficSources: trafficRows.map(r => ({ source: r.insightTrafficSourceType, views: r.views })),
    fetchedAt: new Date().toISOString(),
  };
  analyticsCache.set(days, { at: Date.now(), data });
  return { ...data, cached: false };
}

// ── Public lookup (API key) ─────────────────────────────────────────────────

// Accepts @handle, a channel URL (/@handle, /channel/UC...), or a bare UC... id
function parseChannelInput(input: string): { forHandle?: string; id?: string } {
  const s = input.trim();
  const idMatch = /(UC[0-9A-Za-z_-]{22})/.exec(s);
  if (idMatch) return { id: idMatch[1] };
  const handleMatch = /@([0-9A-Za-z._-]{3,30})/.exec(s);
  if (handleMatch) return { forHandle: `@${handleMatch[1]}` };
  return { forHandle: `@${s.replace(/^@/, '')}` };
}

const publicCache = new Map<string, { at: number; data: any }>();

export async function publicChannelLookup(apiKey: string, input: string) {
  const key = input.trim().toLowerCase();
  const hit = publicCache.get(key);
  if (hit && Date.now() - hit.at < ANALYTICS_CACHE_MS) return { ...hit.data, cached: true };

  const yt = async (endpoint: string, params: Record<string, string>) => {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/${endpoint}?${new URLSearchParams({ ...params, key: apiKey })}`);
    const json: any = await res.json();
    if (json.error) throw new Error(`YouTube API: ${json.error.message}`);
    return json;
  };

  const lookup = parseChannelInput(input);
  const chJson = await yt('channels', { part: 'snippet,statistics,contentDetails', ...(lookup.id ? { id: lookup.id } : { forHandle: lookup.forHandle! }) });
  const ch = chJson.items?.[0];
  if (!ch) throw new Error(`No channel found for "${input}". Try the exact @handle from the channel page.`);

  const uploads = ch.contentDetails?.relatedPlaylists?.uploads;
  let recentVideos: any[] = [];
  if (uploads) {
    const pl = await yt('playlistItems', { part: 'contentDetails', playlistId: uploads, maxResults: '20' });
    const ids = (pl.items || []).map((it: any) => it.contentDetails?.videoId).filter(Boolean);
    if (ids.length) {
      const vids = await yt('videos', { part: 'snippet,statistics,contentDetails', id: ids.join(',') });
      recentVideos = (vids.items || []).map((v: any) => ({
        videoId: v.id,
        title: v.snippet?.title,
        thumbnail: v.snippet?.thumbnails?.medium?.url || `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`,
        publishedAt: v.snippet?.publishedAt,
        views: Number(v.statistics?.viewCount || 0),
        likes: Number(v.statistics?.likeCount || 0),
        comments: Number(v.statistics?.commentCount || 0),
        duration: v.contentDetails?.duration,
      }));
    }
  }

  const data = {
    connected: false,
    channel: {
      id: ch.id,
      title: ch.snippet?.title,
      handle: ch.snippet?.customUrl,
      thumbnail: ch.snippet?.thumbnails?.medium?.url || ch.snippet?.thumbnails?.default?.url,
      subscribers: Number(ch.statistics?.subscriberCount || 0),
      totalViews: Number(ch.statistics?.viewCount || 0),
      videoCount: Number(ch.statistics?.videoCount || 0),
      hiddenSubscriberCount: Boolean(ch.statistics?.hiddenSubscriberCount),
      publishedAt: ch.snippet?.publishedAt,
    },
    recentVideos,
    fetchedAt: new Date().toISOString(),
  };
  publicCache.set(key, { at: Date.now(), data });
  return { ...data, cached: false };
}
