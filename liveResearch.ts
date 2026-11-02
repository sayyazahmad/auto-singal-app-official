// Live research: find recent outlier videos via the YouTube Data API, measure each against its
// channel's real recent-upload baseline, then have Gemini analyse them into one production brief.
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const YT = 'https://www.googleapis.com/youtube/v3';
const SMALL_CHANNEL_SUBS = 100_000;
const MIN_VIEWS = 5_000;
const MIN_LONGFORM_SECONDS = 180; // Shorts can run up to 3 minutes; briefs here are long-form
const MAX_CHANNELS_FOR_BASELINE = 15;
const TOP_N_FOR_ANALYSIS = 12;
const NICHE_WINDOW_DAYS = 30;
const CACHE_TTL_MS = 24 * 3_600_000;

// Gemini 3 models think before answering and bill those tokens as output; minimal skips that.
// Older models use a different setting, so leave them on their defaults.
export function cheapThinkingConfig(model: string) {
  return model.startsWith('gemini-3') ? { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } } : {};
}

// YouTube quota units per call (https://developers.google.com/youtube/v3/determine_quota_cost)
const UNIT_COST: Record<string, number> = { search: 100 };
// search + videos + channels + one playlistItems per channel + recent-upload videos
const WORST_CASE_RUN_UNITS = 100 + 1 + 1 + MAX_CHANNELS_FOR_BASELINE + 7;

export interface LiveVideo {
  video_id: string;
  title: string;
  channel_id: string;
  channel_title: string;
  channel_subscriber_count: number;
  channel_avg_views: number;
  baseline_source: 'recent_uploads_median' | 'lifetime_average';
  view_count: number;
  like_count: number;
  comment_count: number;
  views_per_hour: number;
  outperformance_ratio: number;
  analysis_score_10: number;
  hours_since_publish: number;
  duration_seconds: number;
  published_at: string;
  repair_similarity: number;
  subniche: string;
  intent_label: string;
  winner_tag: string;
  thumbnail_url: string;
}

export interface ResearchInput {
  niche: string;
  nicheLabel: string;
  nicheTopics: string[];
  topic?: string;
  // YouTube videoCategoryId that keeps the search on-niche (e.g. "2" Autos & Vehicles); omitted when no category fits
  categoryId?: string;
  creatorSubs?: number;
  creatorAvgViews?: number;
  youtubeKey: string;
  geminiKey: string;
  geminiModel: string;
  cacheDir: string;
  dailyUnitBudget: number;
}

class YouTubeError extends Error {}

// Units this app has spent today. YouTube's quota day resets at midnight Pacific time.
interface QuotaUsage { day: string; units: number }
const pacificDay = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
let usage: QuotaUsage | null = null;

async function loadUsage(cacheDir: string): Promise<QuotaUsage> {
  const today = pacificDay();
  if (!usage) {
    try {
      usage = JSON.parse(await fs.readFile(path.join(cacheDir, 'youtube_quota.json'), 'utf-8'));
    } catch {
      usage = { day: today, units: 0 };
    }
  }
  if (usage!.day !== today) usage = { day: today, units: 0 };
  return usage!;
}

async function saveUsage(cacheDir: string) {
  if (!usage) return;
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(path.join(cacheDir, 'youtube_quota.json'), JSON.stringify(usage));
}

export async function quotaStatus(cacheDir: string, dailyUnitBudget: number) {
  const u = await loadUsage(cacheDir);
  return { day: u.day, unitsUsed: u.units, dailyBudget: dailyUnitBudget };
}

async function yt(endpoint: string, params: Record<string, string>, key: string): Promise<any> {
  // Count the cost before the call: YouTube charges for failed requests too
  if (usage) usage.units += UNIT_COST[endpoint] ?? 1;
  const qs = new URLSearchParams({ ...params, key });
  const res = await fetch(`${YT}/${endpoint}?${qs}`);
  const json: any = await res.json();
  if (json.error) {
    const reason = json.error.errors?.[0]?.reason;
    if (reason === 'quotaExceeded') throw new YouTubeError('YouTube API daily quota is used up. It resets at midnight Pacific time.');
    throw new YouTubeError(`YouTube API: ${json.error.message || reason || 'request failed'}`);
  }
  return json;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ISO 8601 duration (PT1H2M3S) -> seconds
function parseDuration(iso: string): number {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '');
  if (!m) return 0;
  return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

async function fetchVideoDetails(ids: string[], key: string): Promise<any[]> {
  const items: any[] = [];
  for (const batch of chunk(ids, 50)) {
    const json = await yt('videos', { part: 'snippet,statistics,contentDetails', id: batch.join(',') }, key);
    items.push(...(json.items || []));
  }
  return items;
}

async function searchRecentPopular(query: string, days: number, categoryId: string | undefined, key: string): Promise<string[]> {
  const publishedAfter = new Date(Date.now() - days * 86_400_000).toISOString();
  const json = await yt('search', {
    part: 'id',
    type: 'video',
    order: 'viewCount',
    maxResults: '50',
    publishedAfter,
    q: query,
    // 4-20 min only: otherwise most of the 50 most-viewed results are Shorts and get filtered out after paying for them
    videoDuration: 'medium',
    ...(categoryId ? { videoCategoryId: categoryId } : {}),
  }, key);
  return (json.items || []).map((it: any) => it.id?.videoId).filter(Boolean);
}

// Median views of a channel's recent uploads, excluding the candidate videos themselves
async function channelBaselines(channelIds: string[], excludeIds: Set<string>, key: string) {
  const channels: Record<string, { subs: number; lifetimeAvg: number; uploads?: string }> = {};
  for (const batch of chunk(channelIds, 50)) {
    const json = await yt('channels', { part: 'statistics,contentDetails', id: batch.join(',') }, key);
    for (const c of json.items || []) {
      const views = Number(c.statistics?.viewCount || 0);
      const count = Number(c.statistics?.videoCount || 0);
      channels[c.id] = {
        subs: Number(c.statistics?.subscriberCount || 0),
        lifetimeAvg: count > 0 ? views / count : 0,
        uploads: c.contentDetails?.relatedPlaylists?.uploads,
      };
    }
  }

  const recentIdsByChannel: Record<string, string[]> = {};
  await Promise.all(channelIds.slice(0, MAX_CHANNELS_FOR_BASELINE).map(async (cid) => {
    const uploads = channels[cid]?.uploads;
    if (!uploads) return;
    try {
      const json = await yt('playlistItems', { part: 'contentDetails', playlistId: uploads, maxResults: '20' }, key);
      recentIdsByChannel[cid] = (json.items || [])
        .map((it: any) => it.contentDetails?.videoId)
        .filter((id: string) => id && !excludeIds.has(id));
    } catch {
      // Some channels hide their uploads playlist; they fall back to the lifetime average
    }
  }));

  const allRecent = Object.values(recentIdsByChannel).flat();
  const recentDetails = allRecent.length ? await fetchVideoDetails(allRecent, key) : [];
  const viewsById = new Map<string, { views: number; ageHours: number }>();
  for (const v of recentDetails) {
    viewsById.set(v.id, {
      views: Number(v.statistics?.viewCount || 0),
      ageHours: (Date.now() - new Date(v.snippet?.publishedAt).getTime()) / 3_600_000,
    });
  }

  const result: Record<string, { subs: number; baseline: number; source: LiveVideo['baseline_source'] }> = {};
  for (const cid of channelIds) {
    const ch = channels[cid];
    if (!ch) continue;
    // Skip uploads under 2 days old: their view counts haven't settled yet
    const settled = (recentIdsByChannel[cid] || [])
      .map(id => viewsById.get(id))
      .filter((x): x is { views: number; ageHours: number } => Boolean(x) && x!.ageHours >= 48)
      .map(x => x.views);
    if (settled.length >= 3) {
      result[cid] = { subs: ch.subs, baseline: median(settled), source: 'recent_uploads_median' };
    } else if (ch.lifetimeAvg > 0) {
      result[cid] = { subs: ch.subs, baseline: ch.lifetimeAvg, source: 'lifetime_average' };
    }
  }
  return result;
}

interface OutlierResult { videos: LiveVideo[]; query: string; windowDays: number; cached: boolean }

// One niche-wide search, cached for 24h, so repeat refreshes and topic briefs spend no YouTube quota.
// A requested topic only steers Gemini: searching YouTube for a full idea headline usually matches nothing.
export async function findOutlierVideos(input: ResearchInput): Promise<OutlierResult> {
  const query = input.nicheTopics.slice(0, 3).map(t => t.trim()).filter(Boolean).join(' | ') || input.nicheLabel;
  const windowDays = NICHE_WINDOW_DAYS;

  const cacheKey = createHash('sha1').update(`v2|${input.niche}|${query.toLowerCase()}|${windowDays}|${input.categoryId || ''}`).digest('hex').slice(0, 16);
  const cacheFile = path.join(input.cacheDir, `research_${cacheKey}.json`);
  try {
    const hit = JSON.parse(await fs.readFile(cacheFile, 'utf-8'));
    if (Date.now() - hit.savedAt < CACHE_TTL_MS) return { videos: hit.videos, query, windowDays, cached: true };
  } catch {
    // no cache yet
  }

  const today = await loadUsage(input.cacheDir);
  if (today.units + WORST_CASE_RUN_UNITS > input.dailyUnitBudget) {
    throw new YouTubeError(`Daily YouTube budget reached (${today.units}/${input.dailyUnitBudget} units used). It resets at midnight Pacific time, or raise YOUTUBE_DAILY_UNIT_BUDGET in .env.`);
  }

  let videos: LiveVideo[];
  try {
    videos = await fetchOutlierVideos(input, query, windowDays);
  } finally {
    await saveUsage(input.cacheDir);
  }
  if (videos.length > 0) {
    await fs.mkdir(input.cacheDir, { recursive: true });
    await fs.writeFile(cacheFile, JSON.stringify({ savedAt: Date.now(), niche: input.niche, query, windowDays, videos }));
  }
  return { videos, query, windowDays, cached: false };
}

async function fetchOutlierVideos(input: ResearchInput, query: string, windowDays: number): Promise<LiveVideo[]> {
  const ids = await searchRecentPopular(query, windowDays, input.categoryId, input.youtubeKey);
  if (ids.length === 0) return [];

  const details = (await fetchVideoDetails(ids, input.youtubeKey)).filter(v =>
    parseDuration(v.contentDetails?.duration) > MIN_LONGFORM_SECONDS &&
    Number(v.statistics?.viewCount || 0) >= MIN_VIEWS
  );

  // Most-viewed channels first so the baseline cap keeps the strongest candidates
  const channelIds = [...new Set(details
    .sort((a, b) => Number(b.statistics?.viewCount || 0) - Number(a.statistics?.viewCount || 0))
    .map(v => v.snippet?.channelId as string)
    .filter(Boolean))];
  const baselines = await channelBaselines(channelIds, new Set(ids), input.youtubeKey);

  const videos: LiveVideo[] = [];
  for (const v of details) {
    const base = baselines[v.snippet?.channelId];
    if (!base || base.baseline <= 0) continue;
    const views = Number(v.statistics?.viewCount || 0);
    const publishedAt = v.snippet?.publishedAt;
    const hours = Math.max(1, Math.round((Date.now() - new Date(publishedAt).getTime()) / 3_600_000));
    const ratio = Number((views / base.baseline).toFixed(1));
    videos.push({
      video_id: v.id,
      title: v.snippet?.title || '',
      channel_id: v.snippet?.channelId,
      channel_title: v.snippet?.channelTitle || '',
      channel_subscriber_count: base.subs,
      channel_avg_views: Math.round(base.baseline),
      baseline_source: base.source,
      view_count: views,
      like_count: Number(v.statistics?.likeCount || 0),
      comment_count: Number(v.statistics?.commentCount || 0),
      views_per_hour: Math.round(views / hours),
      outperformance_ratio: ratio,
      // Log-scaled so a 10x outlier scores ~8 and 30x+ approaches 10
      analysis_score_10: Number(Math.min(10, 2 + 6 * Math.log10(Math.max(1, ratio)) + 0.5).toFixed(1)),
      hours_since_publish: hours,
      duration_seconds: parseDuration(v.contentDetails?.duration),
      published_at: publishedAt,
      repair_similarity: 1,
      subniche: input.niche,
      intent_label: 'live_youtube_research',
      winner_tag: ratio >= 3 ? 'breakout_outlier' : 'velocity_winner',
      thumbnail_url: v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.medium?.url || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
    });
  }

  videos.sort((a, b) => b.outperformance_ratio - a.outperformance_ratio);
  return videos;
}

const BRIEF_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    topic: { type: Type.STRING, description: 'The specific video idea, 3-8 words' },
    target_angle: { type: Type.STRING, description: 'The angle that makes this version different from what already exists' },
    why_it_works: { type: Type.STRING, description: '2-3 sentences grounded in the supplied numbers: what the outliers share and why a small channel can win here' },
    pattern_insights: { type: Type.ARRAY, items: { type: Type.STRING }, description: '3-5 concrete patterns observed across the top outlier titles/topics' },
    opportunity_score: { type: Type.NUMBER, description: '1-10, how strong this opportunity is for a small creator given the data' },
    window: { type: Type.STRING, enum: ['IMMEDIATE', 'RISING', 'EVERGREEN'] },
    source_video_ids: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'video_ids from the data that most support this idea' },
    titles: {
      type: Type.OBJECT,
      properties: {
        title_1_search_match: { type: Type.STRING },
        title_2_curiosity: { type: Type.STRING },
        title_3_value: { type: Type.STRING },
        recommended_title: { type: Type.STRING, enum: ['title_1_search_match', 'title_2_curiosity', 'title_3_value'] },
        reason: { type: Type.STRING },
      },
      required: ['title_1_search_match', 'title_2_curiosity', 'title_3_value', 'recommended_title', 'reason'],
    },
    hook_script: { type: Type.STRING, description: 'Word-for-word spoken hook for the first 15-20 seconds' },
    thumbnail_direction: {
      type: Type.OBJECT,
      properties: {
        primary_image: { type: Type.STRING },
        text_overlay: { type: Type.STRING, description: '2-4 words' },
        color_signal: { type: Type.STRING },
        focal_point: { type: Type.STRING },
      },
      required: ['primary_image', 'text_overlay', 'color_signal', 'focal_point'],
    },
    pacing_outline: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { time: { type: Type.STRING }, beat: { type: Type.STRING }, action: { type: Type.STRING } },
        required: ['time', 'beat', 'action'],
      },
    },
    production_checklist: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['topic', 'target_angle', 'why_it_works', 'pattern_insights', 'opportunity_score', 'window', 'source_video_ids',
    'titles', 'hook_script', 'thumbnail_direction', 'pacing_outline', 'production_checklist'],
};

export async function analyseWithGemini(input: ResearchInput, videos: LiveVideo[], query: string, windowDays: number) {
  const top = videos.slice(0, TOP_N_FOR_ANALYSIS);
  const rows = top.map(v => [
    v.video_id,
    JSON.stringify(v.title),
    JSON.stringify(v.channel_title),
    v.channel_subscriber_count,
    v.view_count,
    v.channel_avg_views,
    `${v.outperformance_ratio}x`,
    v.views_per_hour,
    Math.round(v.hours_since_publish / 24),
    Math.round(v.duration_seconds / 60),
    v.view_count ? ((v.like_count + v.comment_count) / v.view_count * 100).toFixed(2) + '%' : 'n/a',
  ].join(' | ')).join('\n');

  const creator = input.creatorSubs
    ? `The creator has about ${input.creatorSubs.toLocaleString()} subscribers and ${input.creatorAvgViews?.toLocaleString() || 'unknown'} average views per video.`
    : 'The creator is a small channel (under 100K subscribers).';

  const prompt = `You are a YouTube content strategist. Analyse real YouTube data and recommend the single best video for a creator to make next.

Niche: ${input.nicheLabel}
${input.topic ? `Requested topic: ${input.topic}. Build the brief around this topic, using the outlier patterns below as evidence; give a fresh angle if it was briefed before.` : 'No specific topic requested: pick the strongest idea in the niche.'}
${creator}

Data: the most-viewed long-form videos from the last ${windowDays} days for the search "${query}", ranked by outperformance ratio (video views divided by the median views of that channel's recent uploads). A high ratio means the TOPIC or PACKAGING drove the views, not the channel's size.

video_id | title | channel | subscribers | views | channel baseline views | ratio | views/hour | age (days) | length (min) | engagement
${rows}

Instructions:
- Find what the top outliers have in common (topic, promise, framing, format) and base the idea on that pattern, weighting outliers from small channels most.
- Recommend ONE video idea the creator can realistically make. Do not copy an existing title; produce a distinct version of the winning pattern.
- Titles: under 65 characters, no clickbait the video cannot pay off, no ALL CAPS sentences.
- Write the hook as natural speech, not marketing copy.
- why_it_works and pattern_insights must refer to the actual numbers and titles above. Refer to videos by title or channel name, never by video_id.
- Only list video_ids that appear in the data.`;

  const ai = new GoogleGenAI({ apiKey: input.geminiKey });
  const res = await ai.models.generateContent({
    model: input.geminiModel,
    contents: prompt,
    config: { responseMimeType: 'application/json', responseSchema: BRIEF_SCHEMA, temperature: 0.7, ...cheapThinkingConfig(input.geminiModel) },
  });
  const parsed = JSON.parse(res.text || '{}');
  const knownIds = new Set(top.map(v => v.video_id));
  parsed.source_video_ids = (parsed.source_video_ids || []).filter((id: string) => knownIds.has(id));
  return parsed;
}

export async function runLiveResearch(input: ResearchInput) {
  const { videos, query, windowDays, cached } = await findOutlierVideos(input);
  if (videos.length === 0) {
    throw new YouTubeError(`No long-form videos with ${MIN_VIEWS.toLocaleString()}+ views found for "${query}" in the last ${windowDays} days.`);
  }

  const analysis = await analyseWithGemini(input, videos, query, windowDays);
  const top = videos.slice(0, TOP_N_FOR_ANALYSIS);
  const supporting = top.filter(v => analysis.source_video_ids.includes(v.video_id));
  const basis = supporting.length > 0 ? supporting : top.slice(0, 5);
  const avgRatio = basis.reduce((s, v) => s + v.outperformance_ratio, 0) / basis.length;
  const avgVph = Math.round(basis.reduce((s, v) => s + v.views_per_hour, 0) / basis.length);
  const smallShare = Math.round(top.filter(v => v.channel_subscriber_count < SMALL_CHANNEL_SUBS).length / top.length * 100);
  const score = Number(Math.max(1, Math.min(10, analysis.opportunity_score || 0)).toFixed(1));

  const brief = {
    brief_id: `brief_live_${input.niche.slice(0, 4)}_${Date.now().toString(36)}`,
    niche: input.niche,
    generated_at: new Date().toISOString(),
    ai_powered: true,
    live_research: true,
    model: input.geminiModel,
    research: { query, window_days: windowDays, videos_analysed: top.length, small_channel_share: smallShare, cached },
    topic: analysis.topic,
    target_angle: analysis.target_angle,
    why_it_works: analysis.why_it_works,
    pattern_insights: analysis.pattern_insights,
    source_video_ids: analysis.source_video_ids,
    titles: analysis.titles,
    hook_script: analysis.hook_script,
    thumbnail_direction: analysis.thumbnail_direction,
    pacing_outline: analysis.pacing_outline,
    production_checklist: analysis.production_checklist,
  };

  const opportunity = {
    rank: 1,
    cluster_label: analysis.topic,
    topic: analysis.topic,
    final_score: score,
    window: analysis.window || 'IMMEDIATE',
    trending_score: score,
    search_gap_score: Number((smallShare / 10).toFixed(1)),
    seasonal_score: score,
    outlier_score: Number(Math.min(10, avgRatio).toFixed(1)),
    video_count: top.length,
    avg_vph: avgVph,
    outperformance_multiplier: `${avgRatio.toFixed(1)}x`,
    search_gap_percent: `${smallShare}%`,
    recommended_angle: analysis.target_angle,
    sample_titles: basis.map(v => v.title),
    live: true,
  };
  // Stored with the brief so a page reload can show the latest live idea, not the pipeline's default
  const savedBrief = { ...brief, opportunity };

  return { brief: savedBrief, opportunity, videos: top, cached, quota: await quotaStatus(input.cacheDir, input.dailyUnitBudget) };
}

export { YouTubeError };
