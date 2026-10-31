// ════════════════════════════════════════════════════════════════════════
// AutoSignal — Frontend
// Wired to real Supabase auth + data. No simulated/fake responses below —
// every number on screen is either a real query result or an honest
// "nothing here yet" state.
// ════════════════════════════════════════════════════════════════════════

// ─── SUPABASE GUARD ─────────────────────────────────────────────────────────
// The Supabase CDN exposes window.supabase on the UMD build. If it didn't
// load (network block, wrong build URL, etc.) we fail loudly now rather than
// silently breaking every button click.
if (!window.supabase || typeof window.supabase.createClient !== 'function') {
  document.body.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#08080A;color:#fff;text-align:center;padding:40px;">
      <h2 style="color:#FF0033;margin-bottom:16px;">AutoSignal couldn't load</h2>
      <p style="color:#aaa;max-width:400px;">The Supabase client library failed to load — this is usually a network issue or a browser extension blocking CDN scripts (ad blockers, uBlock, etc.).</p>
      <p style="color:#555;margin-top:16px;font-size:0.85rem;">Open DevTools → Console to see the exact error.</p>
    </div>`;
  throw new Error('window.supabase.createClient is not available. Supabase CDN did not load.');
}

// ─── CONFIG ────────────────────────────────────────────────────────────
// These are the PUBLIC anon/publishable key + project URL — safe to ship
// in client-side code. Every table they can touch is protected by Row
// Level Security on the database side.
const SUPABASE_URL = 'https://mnglppciyllpcybbqmce.supabase.co';
// Use legacy JWT anon key — the sb_publishable_ format causes supabase.functions.invoke()
// to omit the Authorization header, making every edge function call return 401.
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uZ2xwcGNpeWxscGN5YmJxbWNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MjA5ODUsImV4cCI6MjA5NzE5Njk4NX0.-_Hmjjh7zVR3O6zsPQlhIEdhehDBdYBXYyOjuUg501g';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    storageKey: 'autosignal_auth',
    storage: window.localStorage,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  }
});

// ─── STATE ───────────────────────────────────────────────────────────
const state = {
  user: null,            // Supabase auth user object
  profile: null,         // row from public.profiles
  channel: null,         // row from public.creator_profiles (most recent), or null
  niche: '',              // currently-selected niche slug during onboarding
  currentStep: 0,
  totalSteps: 4,
  authMode: 'signup',
  currentPage: 'dashboard',
  videoTab: 'new',
  settingsTab: 'profile',
  nicheList: [],          // cached rows from public.niches
  trackedNicheIds: new Set(), // niche_id values the user is tracking
};

// ─── FORMAT HELPERS ──────────────────────────────────────────────────
function formatCompact(n) {
  if (n === null || n === undefined) return '0';
  n = Number(n);
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

function initials(name) {
  if (!name) return 'BU';
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'BU';
}

// ─── SCREEN NAVIGATION ────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + id);
  if (el) el.classList.add('active');
}

function showToast(msg, isError) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.borderColor = isError ? 'rgba(255,82,82,0.4)' : 'var(--border)';
  t.style.opacity = '1'; t.style.transform = 'translateY(0)';
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(20px)'; }, 3800);
}

// ─── AUTH ─────────────────────────────────────────────────────────────
function setAuthMode(mode) {
  state.authMode = mode;
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + mode).classList.add('active');
  document.getElementById('auth-extra-fields').style.display = mode === 'signup' ? 'block' : 'none';
  document.getElementById('auth-submit-btn').textContent = mode === 'signup' ? 'Create Account' : 'Sign In';
  document.getElementById('auth-switch-text').innerHTML =
    mode === 'signup'
      ? 'Already have an account? <a onclick="setAuthMode(\'signin\')">Sign In</a>'
      : 'New here? <a onclick="setAuthMode(\'signup\')">Create Account</a>';
}

async function handleAuth(e) {
  e.preventDefault();
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-pass').value;
  const nameInput = document.getElementById('auth-name');
  const fullName = nameInput ? nameInput.value.trim() : '';
  if (!email || !password) return;

  const btn = document.getElementById('auth-submit-btn');
  const original = btn.textContent;
  btn.textContent = state.authMode === 'signup' ? 'Creating account…' : 'Signing in…';
  btn.disabled = true;

  try {
    if (state.authMode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: fullName || null } },
      });
      if (error) throw error;
      showToast('Account created — you\'re in.');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
    // onAuthStateChange picks up the resulting session and routes the screen.
  } catch (err) {
    showToast(err.message || 'Something went wrong.', true);
  } finally {
    btn.textContent = original;
    btn.disabled = false;
  }
}

async function handleGoogleAuth() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
  if (error) showToast(error.message || 'Google sign-in isn\'t set up yet.', true);
}

async function handleLogout() {
  await supabase.auth.signOut();
}

// Fires on page load (with whatever session already exists), on sign-in,
// sign-out, and after an OAuth redirect comes back. This is the single
// place that decides which screen to show — handleAuth() above does not
// route on its own, to avoid double-handling the OAuth callback case.
supabase.auth.onAuthStateChange(async (event, session) => {
  if (event === 'SIGNED_OUT' || !session) {
    state.user = null; state.profile = null; state.channel = null;
    showScreen('landing');
    return;
  }
  state.user = session.user;
  await loadProfileAndRoute();
});

async function loadProfileAndRoute() {
  const { data: profile, error } = await supabase
    .from('profiles').select('*').eq('id', state.user.id).maybeSingle();

  if (error) {
    showToast('Could not load your profile: ' + error.message, true);
    return;
  }
  state.profile = profile;

  document.getElementById('sidebar-user-name').textContent = profile?.full_name || state.user.email;
  document.getElementById('sidebar-initials').textContent = initials(profile?.full_name);
  document.getElementById('topbar-greeting').textContent =
    'Welcome back, ' + (profile?.full_name?.split(' ')[0] || state.user.email.split('@')[0]);
  document.getElementById('sidebar-user-plan').textContent =
    (profile?.plan_tier || 'beta').replace(/^\w/, c => c.toUpperCase()) + ' Plan';

  await loadChannel();

  if (profile && !profile.onboarding_completed) {
    showScreen('onboard');
    goToStep(0);
  } else {
    showScreen('app');
    navigateTo('dashboard');
  }
}

async function loadChannel() {
  const { data } = await supabase
    .from('creator_profiles').select('*').eq('user_id', state.user.id)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  state.channel = data || null;
}

// ─── ONBOARDING STEPS ─────────────────────────────────────────────────
function goToStep(n) {
  state.currentStep = n;
  document.querySelectorAll('.step').forEach((s, i) => s.classList.toggle('active', i === n));
  updateStepDots();
}

function updateStepDots() {
  document.querySelectorAll('.step-dot').forEach((d, i) => {
    d.classList.remove('active', 'done');
    if (i === state.currentStep) d.classList.add('active');
    else if (i < state.currentStep) d.classList.add('done');
  });
}

async function nextStep() {
  // Leaving the niche-selection step: persist it and look up real opportunities.
  if (state.currentStep === 2) {
    if (!state.niche) { showToast('Pick a niche to continue.', true); return; }
    await persistNicheSelection(state.niche);
    await populateReadyStep(state.niche);
  }

  if (state.currentStep < state.totalSteps - 1) goToStep(state.currentStep + 1);
  else finishOnboarding();
}

function prevStep() {
  if (state.currentStep > 0) goToStep(state.currentStep - 1);
}

function skipOnboarding() { finishOnboarding(); }

async function finishOnboarding() {
  if (state.profile) {
    await supabase.from('profiles').update({ onboarding_completed: true }).eq('id', state.user.id);
    state.profile.onboarding_completed = true;
  }
  showScreen('app');
  navigateTo('dashboard');
}

async function persistNicheSelection(slug) {
  const niche = await getNicheBySlug(slug);
  if (!niche) return;
  state.trackedNicheIds.add(niche.id);
  await supabase.from('user_tracked_niches')
    .upsert({ user_id: state.user.id, niche_id: niche.id }, { onConflict: 'user_id,niche_id' });
  if (state.channel) {
    await supabase.from('creator_profiles').update({ detected_niche: slug }).eq('id', state.channel.id);
    state.channel.detected_niche = slug;
  }
}

async function populateReadyStep(slug) {
  const headline = document.getElementById('ob-ready-headline');
  const detail = document.getElementById('ob-ready-detail');
  const icon = document.getElementById('ob-ready-icon');
  headline.textContent = 'Checking for opportunities…';
  detail.textContent = 'One moment.';

  const niche = await getNicheBySlug(slug);
  if (!niche) return;
  const { count } = await supabase
    .from('opportunities').select('id', { count: 'exact', head: true }).eq('niche_id', niche.id);

  if (count && count > 0) {
    icon.textContent = '🔥';
    headline.textContent = `${count} Opportunit${count === 1 ? 'y' : 'ies'} Found`;
    detail.textContent = `Head to Video Studio once you're in to generate a brief from your top opportunity.`;
  } else {
    icon.textContent = '🛰️';
    headline.textContent = 'Your pipeline is warming up';
    detail.textContent = `No opportunities have been generated for ${niche.name} yet — they'll show up here once your research pipeline runs.`;
  }
}

let nicheCache = null;
async function getAllNiches() {
  if (nicheCache) return nicheCache;
  const { data } = await supabase.from('niches').select('*').order('name');
  nicheCache = data || [];
  state.nicheList = nicheCache;
  return nicheCache;
}
async function getNicheBySlug(slug) {
  const all = await getAllNiches();
  return all.find(n => n.slug === slug) || null;
}

// ─── CHANNEL CONNECT (calls the resolve-channel Edge Function) ────────
async function callResolveChannel(rawInput, btnEl) {
  const original = btnEl.textContent;
  btnEl.textContent = 'Connecting…';
  btnEl.disabled = true;
  try {
    // Always get the session token explicitly and pass it.
    // supabase.functions.invoke() should auto-attach it, but with some
    // key formats it doesn't — this guarantees the Authorization header is sent.
    const { data: { session } } = await supabase.auth.getSession();
    const headers = {};
    if (session?.access_token) {
      headers['Authorization'] = 'Bearer ' + session.access_token;
    }

    const { data, error } = await supabase.functions.invoke('resolve-channel', {
      body: { channelInput: rawInput, nicheSlug: state.niche || state.channel?.detected_niche || 'automotive' },
      headers,
    });
    if (error) {
      const msg = (data && data.error) || error.message || 'Could not connect that channel.';
      showToast(msg, true);
      return null;
    }
    if (data?.error) { showToast(data.error, true); return null; }
    showToast('Channel connected: ' + (data.channel_name || ''));
    await loadChannel();
    return data;
  } catch (err) {
    showToast(err.message || 'Channel lookup failed.', true);
    return null;
  } finally {
    btnEl.textContent = original;
    btnEl.disabled = false;
  }
}

async function connectChannel() {
  const input = document.getElementById('channel-url-input').value.trim();
  if (!input) return;
  const btn = document.getElementById('connect-channel-btn');
  const result = await callResolveChannel(input, btn);
  if (!result) return;
  document.getElementById('channel-preview').style.display = 'flex';
  document.getElementById('ch-preview-avatar').textContent = (result.channel_name || 'Y')[0].toUpperCase();
  document.getElementById('ch-preview-name').textContent = result.channel_name;
  document.getElementById('ch-preview-handle').textContent = result.channel_id;
}

async function connectChannelFromPage() {
  const input = document.getElementById('app-channel-input').value.trim();
  if (!input) return;
  const btn = document.getElementById('app-connect-channel-btn');
  const result = await callResolveChannel(input, btn);
  if (!result) return;
  renderChannelPage();
}

async function unlinkChannel() {
  if (!state.channel) return;
  if (!confirm('Unlink this channel? Your past briefs for it will stop showing up until you reconnect it.')) return;
  await supabase.from('creator_profiles').update({ user_id: null }).eq('id', state.channel.id);
  state.channel = null;
  showToast('Channel unlinked.');
  renderChannelPage();
}

function renderChannelPage() {
  const form = document.getElementById('channel-setup-form');
  const view = document.getElementById('channel-connected-view');
  if (state.channel) {
    form.style.display = 'none';
    view.style.display = 'block';
    document.getElementById('ch-page-avatar').textContent = (state.channel.channel_name || 'Y')[0].toUpperCase();
    document.getElementById('ch-page-name').textContent = state.channel.channel_name || state.channel.channel_id;
    document.getElementById('ch-page-handle').textContent = state.channel.channel_id;
    document.getElementById('ch-page-status').textContent = state.channel.last_audited_at ? 'Audited' : 'Pending Audit';
    document.getElementById('ch-page-status').style.background = state.channel.last_audited_at ? '#00E676' : 'var(--text-3)';
    document.getElementById('ch-subs').textContent = formatCompact(state.channel.subscriber_count);
    document.getElementById('ch-views').textContent = formatCompact(state.channel.avg_views);
    document.getElementById('ch-videos').textContent = state.channel.creator_tier || '—';
  } else {
    form.style.display = 'block';
    view.style.display = 'none';
  }
}

// ─── NICHE SELECTION (onboarding, single-pick) ─────────────────────────
function toggleNiche(el, niche) {
  document.querySelectorAll('.niche-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  state.niche = niche;
}

// ─── GOAL SELECTION (UI-only — not persisted, no backend behavior hangs on it) ─
function toggleGoal(el) {
  document.querySelectorAll('.goal-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
}

// ─── APP NAVIGATION ───────────────────────────────────────────────────
function navigateTo(page) {
  state.currentPage = page;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navBtn = document.querySelector(`[data-nav="${page}"]`);
  if (navBtn) navBtn.classList.add('active');
  document.querySelectorAll('.page-view').forEach(v => v.classList.remove('active'));
  const view = document.getElementById('page-' + page);
  if (view) { view.classList.add('active'); view.classList.add('fade-up'); }

  const titles = {
    dashboard: 'Dashboard', niches: 'Niche Manager', videos: 'Video Studio',
    channel: 'Channel Setup', analytics: 'Analytics', settings: 'Settings',
  };
  document.getElementById('topbar-page-title').textContent = titles[page] || page;

  if (page === 'dashboard') loadDashboard();
  if (page === 'channel') renderChannelPage();
  if (page === 'niches') loadNicheManager();
  if (page === 'videos') loadVideoStudio();
  if (page === 'settings') loadSettings();
}

// ─── DASHBOARD ──────────────────────────────────────────────────────
async function loadDashboard() {
  const detailEl = document.getElementById('dashboard-banner-detail');
  detailEl.textContent = 'Loading your pipeline status…';

  let briefCount = 0, oppCount = 0, videoCount = 0;

  if (state.channel) {
    const { count } = await supabase
      .from('briefs').select('id', { count: 'exact', head: true }).eq('channel_id', state.channel.channel_id);
    briefCount = count || 0;
  }

  const trackedIds = await getTrackedNicheIds();
  if (trackedIds.length > 0) {
    const { count: oc } = await supabase
      .from('opportunities').select('id', { count: 'exact', head: true }).in('niche_id', trackedIds);
    oppCount = oc || 0;
    const { count: vc } = await supabase
      .from('videos').select('id', { count: 'exact', head: true }).in('niche_id', trackedIds);
    videoCount = vc || 0;
  }

  document.getElementById('stat-briefs-count').textContent = briefCount;
  document.getElementById('stat-opportunities-count').textContent = oppCount;
  document.getElementById('stat-videos-count').textContent = videoCount;

  if (!state.channel) {
    detailEl.textContent = 'Connect your channel to start generating personalized briefs.';
  } else if (trackedIds.length === 0) {
    detailEl.textContent = 'Pick a niche in Niche Manager so we know what to track for you.';
  } else if (oppCount === 0) {
    detailEl.textContent = 'Your research pipeline hasn\'t surfaced opportunities yet — check back soon.';
  } else {
    detailEl.textContent = `We're tracking ${oppCount} opportunit${oppCount === 1 ? 'y' : 'ies'} across your niche${trackedIds.length > 1 ? 's' : ''}.`;
  }
}

async function getTrackedNicheIds() {
  const { data } = await supabase.from('user_tracked_niches').select('niche_id').eq('user_id', state.user.id);
  const ids = (data || []).map(r => r.niche_id);
  state.trackedNicheIds = new Set(ids);
  return ids;
}

// ─── NICHE MANAGER ──────────────────────────────────────────────────
async function loadNicheManager() {
  const grid = document.getElementById('niche-page-grid');
  grid.innerHTML = '<p style="color:var(--text-3);">Loading niches…</p>';

  const [niches] = await Promise.all([getAllNiches(), getTrackedNicheIds()]);

  const icons = { automotive: 'fa-car-side', finance: 'fa-chart-line', technology: 'fa-laptop-code', productivity: 'fa-stopwatch' };

  const counts = {};
  for (const n of niches) {
    const { count } = await supabase.from('videos').select('id', { count: 'exact', head: true }).eq('niche_id', n.id);
    counts[n.id] = count || 0;
  }

  grid.innerHTML = niches.map(n => `
    <div class="niche-page-card ${state.trackedNicheIds.has(n.id) ? 'active-niche' : ''}" data-niche-id="${n.id}" onclick="toggleNichePage(this, '${n.id}')">
      <div class="npc-check"><i class="fas fa-check"></i></div>
      <div class="npc-icon"><i class="fas ${icons[n.slug] || 'fa-layer-group'}"></i></div>
      <div class="npc-title">${n.name}</div>
      <div class="npc-desc">${n.is_active ? 'Active pipeline — opportunities update regularly.' : 'Not yet active for automated research.'}</div>
      <div class="npc-tags">
        <span class="npc-tag">${counts[n.id]} videos tracked</span>
        ${n.is_active ? '' : '<span class="npc-tag">Coming soon</span>'}
      </div>
    </div>
  `).join('') + `
    <div class="niche-page-card" style="border:1px dashed var(--border); background:transparent; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center;">
      <div class="npc-icon" style="color:var(--text-3);"><i class="fas fa-plus"></i></div>
      <div class="npc-title" style="color:var(--text-2);">Custom Niche</div>
      <div class="npc-desc">Reach out if you want a new niche added to the pipeline.</div>
    </div>
  `;

  updateNicheCount();
}

async function toggleNichePage(el, nicheId) {
  const isActive = el.classList.contains('active-niche');
  if (isActive) {
    await supabase.from('user_tracked_niches').delete().eq('user_id', state.user.id).eq('niche_id', nicheId);
    state.trackedNicheIds.delete(nicheId);
    el.classList.remove('active-niche');
  } else {
    await supabase.from('user_tracked_niches').upsert({ user_id: state.user.id, niche_id: nicheId }, { onConflict: 'user_id,niche_id' });
    state.trackedNicheIds.add(nicheId);
    el.classList.add('active-niche');
  }
  updateNicheCount();
}

function updateNicheCount() {
  const el = document.getElementById('active-niche-count');
  const n = state.trackedNicheIds.size;
  if (el) el.textContent = `${n} active niche${n === 1 ? '' : 's'}`;
}

// ─── VIDEO STUDIO ───────────────────────────────────────────────────
function switchVideoTab(tab) {
  state.videoTab = tab;
  document.querySelectorAll('.video-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-vtab="${tab}"]`).classList.add('active');
  document.querySelectorAll('.video-tab-content').forEach(v => v.classList.remove('active'));
  document.getElementById('vtab-' + tab).classList.add('active');
  if (tab === 'edit') loadOwnVideos();
}

async function loadVideoStudio() {
  if (state.videoTab === 'edit') loadOwnVideos();
}

async function loadOwnVideos() {
  const grid = document.getElementById('underperforming-videos');
  if (!state.channel) {
    grid.innerHTML = '<p style="color:var(--text-3); grid-column:1/-1;">Connect your channel in Channel Setup first — we\'ll list its videos here once it\'s audited.</p>';
    return;
  }
  const { data, error } = await supabase
    .from('videos').select('*').eq('channel_id', state.channel.channel_id)
    .order('fetched_at', { ascending: false }).limit(6);

  if (error || !data || data.length === 0) {
    grid.innerHTML = '<p style="color:var(--text-3); grid-column:1/-1;">We haven\'t audited this channel\'s videos yet. Once the pipeline runs an audit, they\'ll show up here for re-optimization.</p>';
    return;
  }

  grid.innerHTML = data.map(v => `
    <div class="video-option-card" onclick="auditVideo(this, '${v.id}')">
      <div style="width:100%; height:120px; background:var(--bg-2); border-radius:8px; margin-bottom:16px; display:flex; align-items:center; justify-content:center; color:var(--text-3);">
        <i class="fas fa-play-circle" style="font-size:2.5rem;"></i>
      </div>
      <div class="vo-title" style="font-size:0.95rem;">${escapeHtml(v.title || 'Untitled')}</div>
      <div class="vo-desc" style="font-size:0.75rem; margin-bottom:12px;">${formatCompact(v.view_count)} views</div>
      <div class="vo-tag" style="background:rgba(255,255,255,0.05); color:var(--text-2); margin-top:0;">Audit Needed</div>
    </div>
  `).join('');
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

async function generateBrief(type) {
  if (!state.channel) { showToast('Connect your channel first.', true); return; }
  const btn = document.getElementById('generate-brief-btn');
  const original = btn.textContent;
  btn.textContent = 'Queuing…';
  btn.disabled = true;

  const trackedIds = await getTrackedNicheIds();
  await getAllNiches();
  let opportunityId = null;
  let nicheSlug = null;
  if (trackedIds.length > 0) {
    const { data: opp } = await supabase
      .from('opportunities').select('id, niche_id').in('niche_id', trackedIds)
      .order('composite_score', { ascending: false }).limit(1).maybeSingle();
    if (opp) {
      opportunityId = opp.id;
      const niche = state.nicheList.find(n => n.id === opp.niche_id);
      nicheSlug = niche?.slug || null;
    }
  }

  const { data: brief, error } = await supabase.from('briefs').insert({
    channel_id: state.channel.channel_id,
    niche: nicheSlug || state.channel.detected_niche,
    brief_type: 'new_content',
    opportunity_id: opportunityId,
    status: 'draft',
  }).select().single();

  btn.textContent = original;
  btn.disabled = false;

  if (error) { showToast('Could not queue a brief: ' + error.message, true); return; }

  const resultsEl = document.getElementById('results-new');
  resultsEl.style.display = 'block';
  resultsEl.innerHTML = `<h4 style="margin-bottom:12px; font-weight:600; font-size:1.05rem;">Brief queued</h4>
    <p style="color:var(--text-2); font-size:0.9rem; line-height:1.6;">Your pipeline will fill this in. Checking for updates…</p>`;

  pollBriefUntilReady(brief.id, resultsEl);
}

async function auditVideo(el, videoId) {
  document.querySelectorAll('#underperforming-videos .video-option-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  const tag = el.querySelector('.vo-tag');
  tag.textContent = 'Queuing…';

  const { data: brief, error } = await supabase.from('briefs').insert({
    channel_id: state.channel.channel_id,
    niche: state.channel.detected_niche,
    brief_type: 'video_reoptimization',
    target_video_id: videoId,
    status: 'draft',
  }).select().single();

  if (error) { showToast('Could not queue an audit: ' + error.message, true); return; }
  tag.textContent = 'Queued ✓';

  const resultsDiv = document.getElementById('results-edit');
  resultsDiv.style.display = 'block';
  resultsDiv.innerHTML = `<h4 style="font-weight:600; font-size:1.05rem; margin-bottom:12px;">Audit queued</h4>
    <p style="color:var(--text-2); font-size:0.9rem;">Checking for updates…</p>`;
  pollBriefUntilReady(brief.id, resultsDiv);
}

function pollBriefUntilReady(briefId, container, tries = 0) {
  const maxTries = 15; // ~1 minute at 4s intervals
  setTimeout(async () => {
    const { data: brief } = await supabase.from('briefs').select('*').eq('id', briefId).maybeSingle();
    if (brief && brief.brief_json) {
      container.innerHTML = renderBriefContent(brief);
      return;
    }
    if (tries + 1 >= maxTries) {
      container.innerHTML = `<p style="color:var(--text-2); font-size:0.9rem;">Still processing — this is taking longer than usual. Check back in a few minutes, or look it up later under this channel's brief history.</p>`;
      return;
    }
    pollBriefUntilReady(briefId, container, tries + 1);
  }, 4000);
}

function renderBriefContent(brief) {
  const b = brief.brief_json || {};
  const title = b.title || b.title_idea || 'Untitled brief';
  const hook = b.hook || b.hook_strategy || '';
  const thumb = b.thumbnail_concept || b.thumbnail || '';
  const tags = (brief.seo_tags && brief.seo_tags.length) ? brief.seo_tags.join(', ') : '';
  const timing = brief.upload_timing ? JSON.stringify(brief.upload_timing) : '';

  let html = `<h4 style="margin-bottom:12px; font-weight:600; font-size:1.05rem;">Generated Brief</h4>
    <p style="color:var(--text-2); font-size:0.9rem; line-height:1.6;"><strong>Title:</strong> ${escapeHtml(title)}</p>`;
  if (hook) html += `<p style="color:var(--text-2); font-size:0.9rem; line-height:1.6; margin-top:10px;"><strong>Hook:</strong> ${escapeHtml(hook)}</p>`;
  if (thumb) html += `<p style="color:var(--text-2); font-size:0.9rem; line-height:1.6; margin-top:10px;"><strong>Thumbnail Concept:</strong> ${escapeHtml(thumb)}</p>`;
  if (tags) html += `<p style="color:var(--text-2); font-size:0.9rem; line-height:1.6; margin-top:10px;"><strong>SEO Tags:</strong> ${escapeHtml(tags)}</p>`;
  if (timing) html += `<p style="color:var(--text-2); font-size:0.9rem; line-height:1.6; margin-top:10px;"><strong>Suggested Upload Timing:</strong> ${escapeHtml(timing)}</p>`;
  if (!hook && !thumb && Object.keys(b).length) {
    html += `<pre style="color:var(--text-2); font-size:0.8rem; margin-top:10px; white-space:pre-wrap;">${escapeHtml(JSON.stringify(b, null, 2))}</pre>`;
  }
  return html;
}

// ─── SETTINGS ─────────────────────────────────────────────────────────
function switchSettings(tab) {
  state.settingsTab = tab;
  document.querySelectorAll('.settings-nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-stab="${tab}"]`).classList.add('active');
  document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
  document.getElementById('stab-' + tab).classList.add('active');
}

function loadSettings() {
  if (!state.profile) return;
  document.getElementById('settings-name-input').value = state.profile.full_name || '';
  document.getElementById('settings-email-display').value = state.user.email || '';
  document.getElementById('billing-plan-name').textContent =
    (state.profile.plan_tier || 'beta') === 'beta' ? 'Beta Tester Pro' : state.profile.plan_tier;

  document.getElementById('toggle-scan-freq').classList.toggle('on', state.profile.scan_frequency_hours === 4);
  document.getElementById('toggle-auto-hooks').classList.toggle('on', !!state.profile.auto_generate_hooks);
  document.getElementById('toggle-competitor-tags').classList.toggle('on', !!state.profile.include_competitor_tags);
}

async function saveSettings() {
  const btn = document.getElementById('save-settings-btn');
  const fullName = document.getElementById('settings-name-input').value.trim();
  const { error } = await supabase.from('profiles').update({ full_name: fullName || null }).eq('id', state.user.id);
  if (error) { showToast('Could not save: ' + error.message, true); return; }
  state.profile.full_name = fullName;
  document.getElementById('sidebar-user-name').textContent = fullName || state.user.email;
  document.getElementById('sidebar-initials').textContent = initials(fullName);

  btn.textContent = 'Saved ✓';
  btn.style.background = '#00E676';
  btn.style.color = '#000';
  setTimeout(() => { btn.textContent = 'Save Changes'; btn.style.background = ''; btn.style.color = ''; }, 2500);
}

async function toggleScanFrequency(el) {
  const newVal = el.classList.contains('on') ? 24 : 4;
  el.classList.toggle('on');
  const { error } = await supabase.from('profiles').update({ scan_frequency_hours: newVal }).eq('id', state.user.id);
  if (error) { showToast('Could not update: ' + error.message, true); el.classList.toggle('on'); return; }
  state.profile.scan_frequency_hours = newVal;
}

async function togglePreference(el, column) {
  const newVal = !el.classList.contains('on');
  el.classList.toggle('on');
  const { error } = await supabase.from('profiles').update({ [column]: newVal }).eq('id', state.user.id);
  if (error) { showToast('Could not update: ' + error.message, true); el.classList.toggle('on'); return; }
  state.profile[column] = newVal;
}