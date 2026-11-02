import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy, ExternalLink, Loader2, LogOut, RefreshCw, Search, Youtube } from 'lucide-react';
import { AreaChart, BarList, ChartCard, DivergingBars, StatTile, compact, duration, money, shortDate } from './charts';

interface Props {
  showToast: (message: string, type?: 'success' | 'info' | 'error') => void;
  onCopy: (text: string, key: string, label?: string) => void;
}

interface Status { oauthReady: boolean; connected: boolean; redirectUri: string; youtubeKeyConfigured: boolean }

interface ChannelInfo {
  id: string; title: string; handle?: string; thumbnail?: string;
  subscribers: number; totalViews: number; videoCount: number; hiddenSubscriberCount: boolean; publishedAt?: string;
}

interface OwnerData {
  channel: ChannelInfo;
  range: { days: number; currentStart: string; endDate: string; previousStart: string };
  daily: Array<{ date: string; views: number; watchMinutes: number; avgViewDuration: number; subscribersGained: number; subscribersLost: number; revenue: number | null }>;
  revenueAvailable: boolean;
  revenueNote: string | null;
  topVideos: Array<{ videoId: string; title: string; thumbnail: string; publishedAt?: string; views: number; watchMinutes: number; avgViewPercentage: number; subscribersGained: number }>;
  trafficSources: Array<{ source: string; views: number }>;
  fetchedAt: string;
  cached: boolean;
}

interface PublicData {
  channel: ChannelInfo;
  recentVideos: Array<{ videoId: string; title: string; thumbnail: string; publishedAt: string; views: number; likes: number; comments: number; duration: string }>;
  fetchedAt: string;
}

const TRAFFIC_LABELS: Record<string, string> = {
  YT_SEARCH: 'YouTube search', SUGGESTED: 'Suggested videos', BROWSE: 'Browse features', SHORTS: 'Shorts feed',
  EXT_URL: 'External sites', NO_LINK_OTHER: 'Direct or unknown', PLAYLIST: 'Playlists', NOTIFICATION: 'Notifications',
  SUBSCRIBER: 'Subscriptions feed', YT_CHANNEL: 'Channel pages', END_SCREEN: 'End screens', ANNOTATION: 'Cards',
  RELATED_VIDEO: 'Related videos', HASHTAGS: 'Hashtags', YT_OTHER_PAGE: 'Other YouTube pages', ADVERTISING: 'Ads',
  CAMPAIGN_CARD: 'Campaign cards', LIVE_REDIRECT: 'Live redirects', PRODUCT_PAGE: 'Product pages', SOUND_PAGE: 'Sound pages',
  VIDEO_REMIXES: 'Remixes'
};
const trafficLabel = (s: string) => TRAFFIC_LABELS[s] || s.toLowerCase().replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());

const pctChange = (cur: number, prev: number) => (prev > 0 ? ((cur - prev) / prev) * 100 : null);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function ChannelHeader({ channel, badge, right }: { channel: ChannelInfo; badge: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="flex items-center gap-4 min-w-0">
        {channel.thumbnail
          ? <img src={channel.thumbnail} alt="" className="w-14 h-14 rounded-full shrink-0" />
          : <div className="w-14 h-14 rounded-full bg-brand-600 text-white text-xl font-semibold flex items-center justify-center shrink-0">{channel.title.charAt(0)}</div>}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold text-ink-900 dark:text-white truncate">{channel.title}</h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300">{badge}</span>
          </div>
          <div className="text-sm text-ink-500 dark:text-ink-400 mt-0.5">
            {channel.handle && <>{channel.handle} · </>}
            {channel.hiddenSubscriberCount ? 'Subscribers hidden' : `${channel.subscribers.toLocaleString()} subscribers`} · {channel.videoCount.toLocaleString()} videos
          </div>
        </div>
      </div>
      {right}
    </div>
  );
}

// ── Sample data: a made-up but realistic channel, shown until a real one is connected ──

// Small seeded PRNG so the sample looks the same on every render
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SAMPLE_VIDEOS = [
  'I Fixed My Car for $38 (Mechanics Hate This)',
  'Stop Doing This to Your Engine',
  '5 Tools Every Beginner Needs',
  'Why Your Check Engine Light Is On',
  'Deep Scratch Repair Without Paint',
  'The Truth About Synthetic Oil',
  'Brake Job in 30 Minutes',
  'Battery Keeps Dying? Watch This',
  'Cheap vs Expensive Car Wax Test',
  'How to Read Live OBD2 Data'
];

function makeSampleData(days: number): OwnerData {
  const rand = mulberry32(42 + days);
  const total = days * 2;
  const end = new Date(Date.now() - 86_400_000);
  const viralAt = Math.floor(total * 0.72);
  const daily: OwnerData['daily'] = [];
  for (let i = 0; i < total; i++) {
    const date = new Date(end.getTime() - (total - 1 - i) * 86_400_000);
    const weekend = [0, 6].includes(date.getUTCDay()) ? 1.15 : 1;
    const growth = 1 + i * 0.004;
    // One video takes off and decays over about a week
    const viral = i >= viralAt ? 1 + 3.2 * Math.exp(-(i - viralAt) / 2.5) : 1;
    const views = Math.round(3400 * growth * weekend * viral * (0.88 + rand() * 0.24));
    const avgViewDuration = Math.round(250 + rand() * 45);
    const gained = Math.round(views * (0.0085 + rand() * 0.003));
    daily.push({
      date: date.toISOString().slice(0, 10),
      views,
      watchMinutes: Math.round((views * avgViewDuration) / 60),
      avgViewDuration,
      subscribersGained: gained,
      subscribersLost: Math.round(gained * (0.14 + rand() * 0.08)),
      revenue: Number(((views / 1000) * (3.6 + rand() * 1.2)).toFixed(2))
    });
  }
  const current = daily.slice(-days);
  const currentViews = current.reduce((acc, d) => acc + d.views, 0);
  const shares = [0.24, 0.15, 0.1, 0.08, 0.06, 0.05, 0.04, 0.035, 0.03, 0.025];
  return {
    channel: {
      id: 'sample', title: 'Your Channel', handle: '@yourchannel', thumbnail: '',
      subscribers: 48_200, totalViews: 6_840_000, videoCount: 186, hiddenSubscriberCount: false
    },
    range: {
      days,
      currentStart: current[0].date,
      endDate: current[current.length - 1].date,
      previousStart: daily[0].date
    },
    daily,
    revenueAvailable: true,
    revenueNote: null,
    topVideos: SAMPLE_VIDEOS.map((title, i) => {
      const views = Math.round(currentViews * shares[i]);
      return {
        videoId: `sample-${i}`,
        title,
        thumbnail: '',
        views,
        watchMinutes: Math.round(views * (3.2 + rand() * 2.4)),
        avgViewPercentage: 36 + rand() * 26,
        subscribersGained: Math.round(views * (0.006 + rand() * 0.008))
      };
    }),
    trafficSources: [
      ['BROWSE', 0.34], ['SUGGESTED', 0.27], ['YT_SEARCH', 0.19], ['SHORTS', 0.09],
      ['EXT_URL', 0.04], ['SUBSCRIBER', 0.04], ['PLAYLIST', 0.02], ['NO_LINK_OTHER', 0.01]
    ].map(([source, share]) => ({ source: source as string, views: Math.round(currentViews * (share as number)) })),
    fetchedAt: new Date().toISOString(),
    cached: false
  };
}

export default function ChannelAnalytics({ showToast, onCopy }: Props) {
  const [status, setStatus] = useState<Status | null>(null);
  const [days, setDays] = useState(28);
  const [owner, setOwner] = useState<OwnerData | null>(null);
  const [publicData, setPublicData] = useState<PublicData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handle, setHandle] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [savingOAuth, setSavingOAuth] = useState(false);
  const [rpmLow, setRpmLow] = useState(1);
  const [rpmHigh, setRpmHigh] = useState(4);
  const [showSample, setShowSample] = useState(true);

  const loadStatus = async () => {
    const s: Status = await (await fetch('/api/channel/status')).json();
    setStatus(s);
    return s;
  };

  const loadOwner = async (d = days) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/channel/analytics?days=${d}`);
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          setOwner(null);
          await loadStatus();
        }
        throw new Error(json.error || 'Could not load analytics');
      }
      setOwner(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // On first load: pick up the OAuth redirect result, then show whatever is connected
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get('oauth_error');
    if (oauthError) showToast(`Google sign-in failed: ${oauthError}`, 'error');
    if (params.get('connected')) showToast('YouTube channel connected', 'success');
    if (params.has('view')) window.history.replaceState(null, '', window.location.pathname);

    loadStatus()
      .then(s => { if (s.connected) loadOwner(); })
      .catch(() => setError('Could not reach the server'));
  }, []);

  const lookupPublic = async () => {
    if (!handle.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/channel/public?q=${encodeURIComponent(handle.trim())}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Lookup failed');
      setPublicData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const saveOAuth = async () => {
    setSavingOAuth(true);
    try {
      const res = await fetch('/api/channel/oauth-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientSecret })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setClientSecret('');
      await loadStatus();
      showToast('Google OAuth client saved. Now connect your channel.', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSavingOAuth(false);
    }
  };

  const disconnect = async () => {
    await fetch('/api/channel/disconnect', { method: 'POST' });
    setOwner(null);
    await loadStatus();
    showToast('Channel disconnected', 'info');
  };

  // ── Owner metrics: split the fetched window into previous + current period ──
  const isSample = !owner && !publicData && showSample && Boolean(status && !status.connected);
  const view = useMemo(() => owner || (isSample ? makeSampleData(days) : null), [owner, isSample, days]);

  const metrics = useMemo(() => {
    const owner = view;
    if (!owner) return null;
    const d = owner.range.days;
    const prev = owner.daily.slice(0, owner.daily.length - d);
    const cur = owner.daily.slice(-d);
    const agg = (rows: typeof cur) => {
      const views = sum(rows.map(r => r.views));
      const revenue = sum(rows.map(r => r.revenue ?? 0));
      return {
        views,
        watchHours: sum(rows.map(r => r.watchMinutes)) / 60,
        netSubs: sum(rows.map(r => r.subscribersGained - r.subscribersLost)),
        avgDuration: views > 0 ? sum(rows.map(r => r.avgViewDuration * r.views)) / views : 0,
        revenue,
        rpm: views > 0 ? (revenue / views) * 1000 : 0
      };
    };
    return { cur, a: agg(cur), b: agg(prev) };
  }, [view]);

  const publicStats = useMemo(() => {
    if (!publicData) return null;
    const vids = publicData.recentVideos;
    const views = vids.map(v => v.views).sort((a, b) => a - b);
    const recentViews = sum(views);
    const monthAgo = Date.now() - 30 * 86_400_000;
    return {
      avg: vids.length ? recentViews / vids.length : 0,
      median: views.length ? views[Math.floor(views.length / 2)] : 0,
      last30: vids.filter(v => new Date(v.publishedAt).getTime() >= monthAgo).length,
      recentViews
    };
  }, [publicData]);

  if (!status) {
    return (
      <div className="max-w-6xl mx-auto px-4 md:px-8 pt-16 flex justify-center text-ink-500">
        {error ? <p className="text-sm">{error}</p> : <Loader2 className="w-5 h-5 animate-spin" />}
      </div>
    );
  }

  // ───────────────────────── Owner dashboard ─────────────────────────
  if (view && metrics) {
    const owner = view;
    const { cur, a, b } = metrics;
    return (
      <div className="max-w-6xl w-full mx-auto px-4 md:px-8 pt-8 pb-16 space-y-8 animate-fade-in">
        <ChannelHeader
          channel={owner.channel}
          badge={isSample ? 'Sample data' : 'Connected'}
          right={isSample ? (
            <button onClick={() => setShowSample(false)} className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold cursor-pointer">
              Connect your channel
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => loadOwner()} title="Refresh" className="p-2 rounded-lg hover:bg-ink-100 dark:hover:bg-ink-800 text-ink-500 cursor-pointer"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
              <button onClick={disconnect} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-ink-600 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-800 cursor-pointer"><LogOut className="w-4 h-4" />Disconnect</button>
            </div>
          )}
        />

        {isSample && (
          <div className="px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-sm text-amber-900 dark:text-amber-100">
            <strong>Sample data.</strong> These numbers are made up to show how the dashboard works. Connect your channel or look one up to see real stats.
          </div>
        )}

        {/* One filter row scopes everything below */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex p-1 rounded-full bg-ink-100 dark:bg-ink-850">
            {[7, 28, 90].map(d => (
              <button
                key={d}
                onClick={() => { setDays(d); if (!isSample) loadOwner(d); }}
                className={`px-4 py-1.5 rounded-full text-sm cursor-pointer ${days === d ? 'bg-white dark:bg-ink-700 text-ink-900 dark:text-white font-medium shadow-sm' : 'text-ink-500 dark:text-ink-400'}`}
              >
                Last {d} days
              </button>
            ))}
          </div>
          <span className="text-xs text-ink-500 dark:text-ink-400">
            {shortDate(owner.range.currentStart)} – {shortDate(owner.range.endDate)}.{isSample ? ' Sample period.' : ' YouTube reports with a ~2 day delay; refreshed hourly.'}
          </span>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className={`space-y-8 transition-opacity ${loading ? 'opacity-50' : ''}`}>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <StatTile label="Views" value={compact(a.views)} delta={pctChange(a.views, b.views)} spark={cur.map(r => r.views)} />
            <StatTile label="Watch time (hours)" value={compact(a.watchHours)} delta={pctChange(a.watchHours, b.watchHours)} spark={cur.map(r => r.watchMinutes)} />
            <StatTile label="Net subscribers" value={`${a.netSubs >= 0 ? '+' : ''}${compact(a.netSubs)}`} delta={pctChange(a.netSubs, b.netSubs)} spark={cur.map(r => r.subscribersGained - r.subscribersLost)} />
            <StatTile label="Avg view duration" value={duration(a.avgDuration)} delta={pctChange(a.avgDuration, b.avgDuration)} />
            {owner.revenueAvailable ? (
              <>
                <StatTile label="Estimated revenue" value={money(a.revenue)} delta={pctChange(a.revenue, b.revenue)} spark={cur.map(r => r.revenue ?? 0)} />
                <StatTile label="RPM (per 1,000 views)" value={money(a.rpm)} delta={pctChange(a.rpm, b.rpm)} />
              </>
            ) : (
              <div className="col-span-2 p-4 rounded-xl bg-ink-100 dark:bg-ink-850 text-xs text-ink-600 dark:text-ink-300 leading-relaxed">
                <div className="font-medium text-ink-900 dark:text-white mb-1">Revenue not available</div>
                {owner.revenueNote}
              </div>
            )}
          </div>

          <ChartCard
            title="Views per day"
            subtitle={`${a.views.toLocaleString()} views in the last ${days} days`}
            table={{ columns: ['Date', 'Views', 'Watch hours'], rows: cur.map(r => [shortDate(r.date), r.views.toLocaleString(), (r.watchMinutes / 60).toFixed(1)]) }}
          >
            <AreaChart points={cur.map(r => ({ date: r.date, value: r.views }))} format={n => `${n.toLocaleString()} views`} label="Views per day" />
          </ChartCard>

          <div className="grid lg:grid-cols-5 gap-6">
            <ChartCard
              className="lg:col-span-3"
              title="Subscribers"
              subtitle={`+${sum(cur.map(r => r.subscribersGained)).toLocaleString()} gained, −${sum(cur.map(r => r.subscribersLost)).toLocaleString()} lost`}
              table={{ columns: ['Date', 'Gained', 'Lost', 'Net'], rows: cur.map(r => [shortDate(r.date), r.subscribersGained, r.subscribersLost, r.subscribersGained - r.subscribersLost]) }}
            >
              <DivergingBars points={cur.map(r => ({ date: r.date, up: r.subscribersGained, down: r.subscribersLost }))} upLabel="Gained" downLabel="Lost" />
            </ChartCard>
            <ChartCard
              className="lg:col-span-2"
              title="Where views come from"
              subtitle="Traffic sources, current period"
              table={{ columns: ['Source', 'Views'], rows: owner.trafficSources.map(t => [trafficLabel(t.source), t.views.toLocaleString()]) }}
            >
              {owner.trafficSources.length
                ? <BarList items={owner.trafficSources.slice(0, 8).map(t => ({ label: trafficLabel(t.source), value: t.views }))} format={compact} />
                : <p className="text-sm text-ink-500">No traffic data for this period.</p>}
            </ChartCard>
          </div>

          {owner.revenueAvailable && (
            <ChartCard
              title="Estimated revenue per day"
              subtitle={`${money(a.revenue)} in the last ${days} days`}
              table={{ columns: ['Date', 'Revenue'], rows: cur.map(r => [shortDate(r.date), money(r.revenue ?? 0)]) }}
            >
              <AreaChart points={cur.map(r => ({ date: r.date, value: r.revenue ?? 0 }))} format={money} label="Estimated revenue per day" />
            </ChartCard>
          )}

          <section>
            <h3 className="text-sm font-semibold text-ink-900 dark:text-white mb-3">Top videos, last {days} days</h3>
            <div className="overflow-x-auto rounded-xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-850">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-ink-500 dark:text-ink-400">
                    <th className="text-left font-medium px-4 py-3">Video</th>
                    <th className="text-right font-medium px-4 py-3">Views</th>
                    <th className="text-right font-medium px-4 py-3">Watch hours</th>
                    <th className="text-right font-medium px-4 py-3">Avg % viewed</th>
                    <th className="text-right font-medium px-4 py-3">Subs gained</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {owner.topVideos.map(v => (
                    <tr key={v.videoId} className="border-t border-ink-100 dark:border-ink-800">
                      <td className="px-4 py-3">
                        <a
                          href={isSample ? undefined : `https://www.youtube.com/watch?v=${v.videoId}`}
                          target="_blank" rel="noreferrer"
                          className={`flex items-center gap-3 ${isSample ? '' : 'group'}`}
                        >
                          {v.thumbnail
                            ? <img src={v.thumbnail} alt="" loading="lazy" className="w-24 aspect-video rounded-md object-cover shrink-0 bg-ink-100 dark:bg-ink-800" />
                            : <div className="w-24 aspect-video rounded-md shrink-0 bg-gradient-to-br from-brand-700 to-ink-800" />}
                          <span className="text-ink-900 dark:text-white line-clamp-2 group-hover:underline">{v.title}</span>
                        </a>
                      </td>
                      <td className="px-4 py-3 text-right text-ink-900 dark:text-white">{v.views.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-ink-700 dark:text-ink-200">{(v.watchMinutes / 60).toFixed(1)}</td>
                      <td className="px-4 py-3 text-right text-ink-700 dark:text-ink-200">{v.avgViewPercentage?.toFixed(1)}%</td>
                      <td className="px-4 py-3 text-right text-ink-700 dark:text-ink-200">+{v.subscribersGained}</td>
                    </tr>
                  ))}
                  {owner.topVideos.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-ink-500">No views in this period.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    );
  }

  // ───────────────────────── Public dashboard ─────────────────────────
  if (publicData && publicStats) {
    const vids = publicData.recentVideos;
    const estLow = (publicStats.recentViews / 1000) * rpmLow;
    const estHigh = (publicStats.recentViews / 1000) * rpmHigh;
    return (
      <div className="max-w-6xl w-full mx-auto px-4 md:px-8 pt-8 pb-16 space-y-8 animate-fade-in">
        <ChannelHeader
          channel={publicData.channel}
          badge="Public data"
          right={
            <button onClick={() => { setPublicData(null); setShowSample(false); }} className="px-3 py-2 rounded-lg text-sm text-ink-600 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-800 cursor-pointer">
              Look up another channel
            </button>
          }
        />

        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <StatTile label="Subscribers" value={publicData.channel.hiddenSubscriberCount ? 'Hidden' : compact(publicData.channel.subscribers)} note="Rounded by YouTube" />
          <StatTile label="Total views" value={compact(publicData.channel.totalViews)} note="Lifetime" />
          <StatTile label="Videos" value={compact(publicData.channel.videoCount)} note={publicData.channel.publishedAt ? `Since ${new Date(publicData.channel.publishedAt).getFullYear()}` : undefined} />
          <StatTile label="Avg views" value={compact(publicStats.avg)} note={`Last ${vids.length} uploads`} />
          <StatTile label="Median views" value={compact(publicStats.median)} note={`Last ${vids.length} uploads`} />
          <StatTile label="Uploads, last 30 days" value={String(publicStats.last30)} note="Upload pace" />
        </div>

        <div className="grid lg:grid-cols-5 gap-6">
          <ChartCard
            className="lg:col-span-3"
            title="Views on recent uploads"
            subtitle="Newest first"
            table={{ columns: ['Published', 'Video', 'Views', 'Likes', 'Comments'], rows: vids.map(v => [shortDate(v.publishedAt.slice(0, 10)), v.title, v.views.toLocaleString(), v.likes.toLocaleString(), v.comments.toLocaleString()]) }}
          >
            <BarList items={vids.slice(0, 12).map(v => ({ label: v.title, value: v.views }))} format={compact} />
          </ChartCard>

          <section className="lg:col-span-2 p-5 rounded-xl bg-white dark:bg-ink-850 border border-ink-200 dark:border-ink-800">
            <h3 className="text-sm font-semibold text-ink-900 dark:text-white">Earnings estimate</h3>
            <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">YouTube doesn't publish other channels' revenue. This is views × an RPM range you set.</p>
            <div className="text-3xl font-semibold text-ink-900 dark:text-white mt-5">{money(estLow)} – {money(estHigh)}</div>
            <div className="text-xs text-ink-500 dark:text-ink-400 mt-1">Rough range for the last {vids.length} uploads ({compact(publicStats.recentViews)} views)</div>
            <div className="grid grid-cols-2 gap-3 mt-5">
              {[
                { label: 'RPM low ($)', value: rpmLow, set: setRpmLow },
                { label: 'RPM high ($)', value: rpmHigh, set: setRpmHigh }
              ].map(f => (
                <label key={f.label} className="text-xs text-ink-500 dark:text-ink-400">
                  {f.label}
                  <input
                    type="number" min={0} step={0.5} value={f.value}
                    onChange={e => f.set(Math.max(0, Number(e.target.value)))}
                    className="mt-1 w-full p-2 rounded-lg bg-ink-100 dark:bg-ink-900 text-sm text-ink-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-600/40"
                  />
                </label>
              ))}
            </div>
            <p className="text-xs text-ink-500 dark:text-ink-400 mt-4">Connect your own channel with Google to see real revenue.</p>
          </section>
        </div>
      </div>
    );
  }

  // ───────────────────────── Connect screen ─────────────────────────
  return (
    <div className="max-w-5xl w-full mx-auto px-4 md:px-8 pt-10 pb-16 animate-fade-in">
      <h1 className="text-3xl font-semibold text-ink-900 dark:text-white">Channel analytics</h1>
      <p className="text-sm text-ink-500 dark:text-ink-400 mt-2 max-w-xl">
        See how your channel is growing: views, watch time, subscribers, where viewers come from, and what you earn.
      </p>
      {!status.connected && (
        <button onClick={() => setShowSample(true)} className="text-sm text-brand-700 dark:text-brand-300 hover:underline mt-3 cursor-pointer">View the sample dashboard</button>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400 mt-4">{error}</p>}

      <div className="grid md:grid-cols-2 gap-10 mt-10">
        {/* Owner connection */}
        <section>
          <h2 className="text-lg font-semibold text-ink-900 dark:text-white flex items-center gap-2"><Youtube className="w-5 h-5 text-red-600" />Connect your channel</h2>
          <p className="text-sm text-ink-500 dark:text-ink-400 mt-1">Full analytics including real revenue. Sign in with the Google account that owns the channel.</p>

          {status.oauthReady ? (
            <a href="/api/channel/oauth/start" className="mt-6 inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition">
              Connect with Google
            </a>
          ) : (
            <div className="mt-6 space-y-5">
              <ol className="text-sm text-ink-600 dark:text-ink-300 space-y-3 list-decimal pl-5 leading-relaxed">
                <li>In <a className="text-brand-700 dark:text-brand-300 underline" href="https://console.cloud.google.com/apis/library" target="_blank" rel="noreferrer">Google Cloud</a>, open the same project as your YouTube key and enable <strong>YouTube Analytics API</strong>.</li>
                <li><strong>Google Auth Platform → Branding</strong>: set an app name and your email. Under <strong>Audience</strong>, keep it in Testing and add your Google account as a test user.</li>
                <li><strong>Clients → Create client → Web application</strong>. Under Authorized redirect URIs add:
                  <div className="mt-2 flex items-center gap-2 p-2 rounded-lg bg-ink-100 dark:bg-ink-850 font-mono text-xs text-ink-800 dark:text-ink-100">
                    <span className="truncate flex-1">{status.redirectUri}</span>
                    <button onClick={() => onCopy(status.redirectUri, 'redirect_uri', 'Redirect URI copied')} className="p-1 rounded hover:bg-ink-200 dark:hover:bg-ink-700 cursor-pointer" title="Copy"><Copy className="w-3.5 h-3.5" /></button>
                  </div>
                </li>
                <li>Paste the client's ID and secret here.</li>
              </ol>
              <div className="space-y-2">
                <input value={clientId} onChange={e => setClientId(e.target.value)} placeholder="Client ID (…apps.googleusercontent.com)" className="w-full p-2.5 rounded-lg bg-ink-100 dark:bg-ink-850 text-sm text-ink-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-brand-600/40" />
                <input value={clientSecret} onChange={e => setClientSecret(e.target.value)} type="password" autoComplete="off" placeholder="Client secret" className="w-full p-2.5 rounded-lg bg-ink-100 dark:bg-ink-850 text-sm text-ink-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-brand-600/40" />
                <button
                  onClick={saveOAuth}
                  disabled={savingOAuth || !clientId.trim() || !clientSecret.trim()}
                  className="px-4 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  {savingOAuth ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Save client
                </button>
              </div>
              <p className="text-xs text-ink-500 dark:text-ink-400">While the Google app stays in Testing, the sign-in lasts 7 days; you'll just reconnect after that.</p>
            </div>
          )}
        </section>

        {/* Public lookup */}
        <section className="md:border-l md:border-ink-200 md:dark:border-ink-800 md:pl-10">
          <h2 className="text-lg font-semibold text-ink-900 dark:text-white flex items-center gap-2"><Search className="w-5 h-5 text-ink-400" />Look up any channel</h2>
          <p className="text-sm text-ink-500 dark:text-ink-400 mt-1">Public stats and recent uploads for any channel, using your YouTube key. No sign-in, no revenue.</p>
          <div className="mt-6 flex gap-2">
            <input
              value={handle}
              onChange={e => setHandle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && lookupPublic()}
              placeholder="@handle or channel link"
              className="flex-1 p-2.5 rounded-lg bg-ink-100 dark:bg-ink-850 text-sm text-ink-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-600/40"
            />
            <button
              onClick={lookupPublic}
              disabled={loading || !handle.trim() || !status.youtubeKeyConfigured}
              className="px-4 py-2.5 rounded-lg bg-ink-900 dark:bg-white text-white dark:text-ink-900 text-sm font-semibold cursor-pointer disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Look up
            </button>
          </div>
          {!status.youtubeKeyConfigured && <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">Add your YouTube API key in Settings → API Keys first.</p>}
          <p className="text-xs text-ink-500 dark:text-ink-400 mt-3 flex items-center gap-1">
            Uses about 3 YouTube quota units per lookup.
            <a href="https://www.youtube.com/account_advanced" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline">Find your channel ID<ExternalLink className="w-3 h-3" /></a>
          </p>
        </section>
      </div>
    </div>
  );
}
