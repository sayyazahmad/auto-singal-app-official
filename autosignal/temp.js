
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
//  AUTOSIGNAL WORKSPACE LOGIC Ã¢â‚¬â€ PREMIUM REDESIGN
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â

// Initialize Lucide Icons
lucide.createIcons();

if(!window.supabase||typeof window.supabase.createClient!=='function'){
  document.getElementById('auth-err').textContent='Supabase failed to load. Check network/extensions.';
  document.getElementById('auth-err').style.display='block';
}
const SUPABASE_URL='https://mnglppciyllpcybbqmce.supabase.co';
const SUPABASE_KEY='sb_publishable_atE3jfeJnd1X87IlwLuLBQ_kh0dhyLO';
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

const S={
  user:null, profile:null, channel:null,
  nicheList:[], trackedNicheIds:[],
  nicheSlug:'automotive', nicheName:'Automotive',
  opps:[], briefs:[], processing:new Set(),
  chartInstance:null
};

const NICHE_META={
  automotive:{name:'Automotive'},
  finance:{name:'Finance'},
  technology:{name:'Technology'},
  productivity:{name:'Productivity'}
};

/* Ã¢â€â‚¬Ã¢â€â‚¬ Helpers Ã¢â€â‚¬Ã¢â€â‚¬ */
function esc(s){const d=document.createElement('div');d.textContent=s??'';return d.innerHTML}
function fmt(n){if(!n&&n!==0)return'Ã¢â‚¬â€';n=Number(n);if(n>=1e6)return(n/1e6).toFixed(1).replace(/\.0$/,'')+'M';if(n>=1000)return(n/1000).toFixed(1).replace(/\.0$/,'')+'K';return String(n)}
function scoreClass(s){return s>=85?'score-hi':s>=68?'score-me':'score-lo'}
function toast(msg,type='ok'){
  const el=document.createElement('div');
  el.className=`toast toast-${type}`;
  el.innerHTML=`<span class="toast-dot"></span><span>${esc(msg)}</span>`;
  document.getElementById('toast-rack').appendChild(el);
  requestAnimationFrame(()=>el.classList.add('show'));
  setTimeout(()=>{el.classList.remove('show');setTimeout(()=>el.remove(),300)},3500);
}

/* Ã¢â€â‚¬Ã¢â€â‚¬ UI Tabs Ã¢â€â‚¬Ã¢â€â‚¬ */
window.switchTab = (tabId) => {
  document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.sb-nav-item').forEach(el => el.classList.remove('active'));
  
  document.getElementById(`tab-${tabId}`).classList.add('active');
  document.getElementById(`nav-${tabId}`).classList.add('active');
  
  if(tabId === 'overview') {
    renderOverview();
    initChart();
  } else if (tabId === 'audit') {
    renderAudit();
  } else if (tabId === 'integrations') {
    renderIntegrations();
  } else if (tabId === 'briefs') {
    renderBriefsTab();
  }
};

/* Ã¢â€â‚¬Ã¢â€â‚¬ Auth Ã¢â€â‚¬Ã¢â€â‚¬ */
let authMode='si';
window.setAuthTab=(m)=>{
  authMode=m;
  document.getElementById('auth-tab-si').classList.toggle('on',m==='si');
  document.getElementById('auth-tab-su').classList.toggle('on',m==='su');
  document.getElementById('auth-name-wrap').classList.toggle('hidden',m==='si');
  document.getElementById('auth-submit').textContent=m==='su'?'Create Workspace':'Enter Workspace';
  document.getElementById('auth-err').style.display='none';
};
window.doAuth=async()=>{
  const email=document.getElementById('auth-email').value.trim();
  const pass=document.getElementById('auth-pass').value;
  const name=document.getElementById('auth-name').value.trim();
  const errEl=document.getElementById('auth-err');
  if(!email){errEl.textContent='Email required';errEl.style.display='block';return}
  if(!pass||pass.length<6){errEl.textContent='Password (min 6 chars) required';errEl.style.display='block';return}
  
  const btn=document.getElementById('auth-submit');
  btn.innerHTML='<div class="spin" style="margin:auto"></div>';btn.disabled=true;
  errEl.style.display='none';
  
  try{
    if(authMode==='su'){
      const{error}=await sb.auth.signUp({email,password:pass,options:{data:{full_name:name}}});
      if(error)throw error;
    }else{
      const{error}=await sb.auth.signInWithPassword({email,password:pass});
      if(error)throw error;
    }
  }catch(e){
    errEl.textContent=e.message||'Authentication failed';
    errEl.style.display='block';
    btn.textContent=authMode==='su'?'Create Workspace':'Enter Workspace';
    btn.disabled=false;
  }
};
window.doSignOut=async()=>{await sb.auth.signOut();location.reload();};

window.handleGoogleAuth=async()=>{
  const currentPath=window.location.pathname;
  const redirectTo=window.location.origin+(currentPath.endsWith('.html')?currentPath:'/app.html');
  const{error}=await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo}});
  if(error) {
    const errEl=document.getElementById('auth-err');
    errEl.textContent=error.message||'Google sign-in failed.';
    errEl.style.display='block';
  }
};

window.doDemoLogin=async()=>{
  S.user = { id: 'demo-123', email: 'demo@autosignal.com' };
  S.profile = { full_name: 'Demo User' };
  document.getElementById('auth-overlay').classList.add('gone');
  
  S.nicheSlug = 'automotive';
  S.nicheName = 'Automotive';
  S.channel = { channel_name: 'AutoSignal Demo', subscriber_count: 125000, view_count: 8500000, video_count: 240 };
  
  window.isDemoMode = true;
  await loadData();
  
  updateNav();
  document.getElementById('workspace').classList.remove('gone');
  switchTab('overview');
  toast('Entered Demo Mode', 'ok');
};

document.addEventListener('keydown',e=>{if(e.key==='Enter'&&!document.getElementById('auth-overlay').classList.contains('gone'))window.doAuth()});

sb.auth.onAuthStateChange(async(event,session)=>{
  if(event==='SIGNED_OUT'||!session){
    document.getElementById('auth-overlay').classList.remove('gone');
    document.getElementById('workspace').classList.add('gone');
    S.user=null;return;
  }
  if(event==='TOKEN_REFRESHED'&&S.user)return;
  
  if(event==='SIGNED_IN'){
    window.history.replaceState({}, document.title, window.location.pathname);
  }
  
  S.user=session.user;
  document.getElementById('auth-overlay').classList.add('gone');
  await initWorkspace();
});

/* Ã¢â€â‚¬Ã¢â€â‚¬ Init Ã¢â€â‚¬Ã¢â€â‚¬ */
async function initWorkspace(){
  try{
    const[{data:prof},{data:ch},{data:niches},{data:tracked}]=await Promise.all([
      sb.from('profiles').select('*').eq('id',S.user.id).maybeSingle(),
      sb.from('creator_profiles').select('*').eq('user_id',S.user.id).order('created_at',{ascending:false}).limit(1).maybeSingle(),
      sb.from('niches').select('*').order('name'),
      sb.from('user_tracked_niches').select('niche_id').eq('user_id',S.user.id)
    ]);
    S.profile=prof;S.channel=ch;S.nicheList=niches||[];S.trackedNicheIds=(tracked||[]).map(t=>t.niche_id);
    
    if(S.trackedNicheIds.length>0&&S.nicheList.length>0){
      const tn=S.nicheList.find(n=>S.trackedNicheIds.includes(n.id));
      if(tn){S.nicheSlug=tn.slug;S.nicheName=tn.name;}
    }
    
    updateNav();
    await loadData();
    
    document.getElementById('workspace').classList.remove('gone');
    switchTab('overview');
  }catch(e){
    console.error(e);
    toast('Error initializing workspace','err');
  }
}

async function loadData(){
  try {
    if (window.isDemoMode) {
      S.opps = [
        {id:'d1',title:'Why Diesel Engines Are Failing Faster',score:94,diff:'Easy',views:'182K'},
        {id:'d2',title:'6.7 Powerstroke DPF Delete Breakdown',score:91,diff:'Medium',views:'210K'}
      ];
      S.briefs = [
        {
          id: 'b1', title: 'Why Diesel Engines Are Failing Faster', niche: 'Automotive', created_at: new Date().toISOString(),
          brief_json: {
            score: 9.2, title_concepts: ["The Hidden Reason Diesel Engines Are Dying"],
            thumbnail_template: "Split screen: Left side shows a brand new glowing engine part.",
            seo_tags: ["diesel engine"], description: "Modern diesel engines are failing faster than ever before.",
            hook: "If you own a diesel truck built after 2018...", cta: "Subscribe"
          }
        }
      ];
      return;
    }
    
    // Real Supabase data logic
    const nObj = S.nicheList.find(n => n.slug === S.nicheSlug || n.name?.toLowerCase() === S.nicheName?.toLowerCase());
    
    // Load Opportunities
    if (nObj) {
      const { data: opps } = await sb.from('opportunities')
        .select('*, clusters(cluster_key,topic_summary,video_count)')
        .eq('niche_id', nObj.id)
        .order('composite_score', { ascending: false })
        .limit(20);
        
      if (opps && opps.length > 0) {
        S.opps = opps.map(o => ({
          id: o.id, title: o.clusters?.topic_summary || 'Unknown Topic',
          score: Math.min(99, Math.round((o.composite_score || 0) * 10)),
          diff: o.competition_score < 4 ? 'Easy' : o.competition_score < 7 ? 'Medium' : 'Hard',
          views: 'Ã¢â‚¬â€'
        }));
      } else {
        S.opps = [];
      }
    } else {
      S.opps = [];
    }
    
    // Load Briefs
    let query = sb.from('briefs').select('*').order('generated_at', { ascending: false }).limit(50);
    if (S.channel) {
      query = query.eq('channel_id', S.channel.channel_id);
    } else {
      const { data: channels } = await sb.from('creator_profiles').select('channel_id').eq('user_id', S.user.id);
      if (channels && channels.length > 0) {
        query = query.in('channel_id', channels.map(c => c.channel_id));
      }
    }
    
    const { data: briefs } = await query;
    if (briefs && briefs.length > 0) {
      S.briefs = briefs.map(b => ({
        id: b.id,
        oppId: b.opportunity_id || b.id,
        title: b.cluster_label || b.brief_json?.title || b.brief_json?.title_idea || 'Generated Brief',
        niche: b.niche || S.nicheName,
        score: Math.min(99, Math.round((b.opportunity_score || 0) * 10)) || 75,
        status: b.status === 'approved' ? 'Ready' : b.status === 'failed' ? 'Failed' : b.status === 'processing' ? 'Processing' : 'Draft',
        date: new Date(b.generated_at || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        dbRow: b,
        created_at: b.generated_at,
        brief_json: b.brief_json
      }));
    } else {
      S.briefs = [];
    }
    
  } catch (e) {
    console.warn(e);
  }
}

function updateNav(){
  const lbl=document.getElementById('nav-niche-lbl');
  if(lbl)lbl.textContent=`${S.nicheName}`;
}

window.cycleNiche=async()=>{
  const keys=Object.keys(NICHE_META);
  const idx=keys.indexOf(S.nicheSlug);
  const next=keys[(idx+1)%keys.length];
  S.nicheSlug=next;
  S.nicheName=NICHE_META[next].name;
  updateNav();
  
  if(S.user&&S.nicheList.length>0){
    const n=S.nicheList.find(n=>n.slug===next);
    if(n)await sb.from('user_tracked_niches').upsert({user_id:S.user.id,niche_id:n.id},{onConflict:'user_id,niche_id'}).catch(()=>{});
  }
  
  await loadData();
  if(document.getElementById('tab-overview').classList.contains('active')) renderOverview();
};

/* Ã¢â€â‚¬Ã¢â€â‚¬ Briefs Tab Ã¢â€â‚¬Ã¢â€â‚¬ */
window.renderBriefsTab = () => {
  const list = document.getElementById('brief-history-list');

  if ((!S.briefs || S.briefs.length === 0) && window.isDemoMode) {
    S.briefs = [
      { id: 'b1', title: 'Why I Stopped Using Apple Products', niche: 'Tech', created_at: new Date(Date.now() - 86400000*2).toISOString(), brief_json: { score: 9.2, title_concepts: ["The Apple Ecosystem is a Trap", "I Quit Apple. Here's Why."], thumbnail_template: "Minimalist desk. Glowing red broken iPhone.", thumb_text_1: "DON'T", thumb_text_2: "BUY APPLE", seo_tags: ["apple", "tech", "iphone"], description: "A deep dive into why the Apple ecosystem is no longer worth it.", hook: "I've been an Apple fanboy for 10 years, but yesterday, I threw my iPhone away.", cta: "What do you think? Let me know below." } },
      { id: 'b2', title: 'Testing Viral TikTok Life Hacks', niche: 'Entertainment', created_at: new Date(Date.now() - 86400000*5).toISOString(), brief_json: { score: 8.7, title_concepts: ["I Tried Banned TikTok Life Hacks", "TikTok Hacks That Actually Work"], thumbnail_template: "You looking shocked holding a messy object.", thumb_text_1: "IT", thumb_text_2: "WORKS?", seo_tags: ["tiktok", "life hacks", "testing"], description: "We put the most viral TikTok hacks to the test to see if they are real or fake.", hook: "This life hack has 50 million views, but I'm 99% sure it's fake.", cta: "Subscribe if you want me to test more of these!" } }
    ];
  }

  if (!S.briefs || S.briefs.length === 0) {
    list.innerHTML = `
      <div class="empty-state" style="padding:40px 20px">
        <div style="font-size:14px;color:var(--text2);margin-bottom:16px">No briefs yet for this niche.</div>
        <button class="int-btn" style="width:100%;justify-content:center" onclick="submitNewBrief()" id="btn-create-brief">
          <i data-lucide="plus" style="margin-right:6px"></i> Create Your First Brief
        </button>
      </div>
    `;
    lucide.createIcons({root: list});
    return;
  }

  list.innerHTML = S.briefs.map(b => `
    <div class="bh-card" id="bh-${b.id}" onclick="selectBrief('${b.id}')">
      <div style="font-size:14px;font-weight:700;margin-bottom:8px;line-height:1.4">${esc(b.title)}</div>
      <div style="font-size:11px;color:var(--text3);display:flex;justify-content:space-between">
        <span>${esc(b.niche)}</span>
        <span>${new Date(b.created_at).toLocaleDateString()}</span>
      </div>
    </div>
  `).join('') + `
    <button class="int-btn" style="width:100%;margin-top:16px;justify-content:center" onclick="submitNewBrief()" id="btn-create-brief">
      <i data-lucide="plus" style="margin-right:6px"></i> Create New Brief
    </button>
  `;
  lucide.createIcons({root: list});
};

window.selectBrief = (id) => {
  document.querySelectorAll('.bh-card').forEach(c => c.classList.remove('active'));
  document.getElementById(`bh-${id}`)?.classList.add('active');
  
  const b = S.briefs.find(x => x.id === id);
  const detail = document.getElementById('brief-detail-view');
  
  if(!b || !b.brief_json) {
    detail.innerHTML = `<div class="empty-state">Data not available for this brief.</div>`;
    return;
  }
  
  const j = typeof b.brief_json === 'string' ? JSON.parse(b.brief_json) : b.brief_json;
  
  detail.innerHTML = `
    <div class="bp-header">
      <div class="bp-title">${esc(b.title)}</div>
      <div class="bp-score">
        <div style="text-align:right">
          <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase">AutoSignal Score</div>
          <div style="font-size:12px;color:var(--green)">Highly Optimized</div>
        </div>
        <div class="bp-score-circle">${j.score || '9.0'}</div>
      </div>
    </div>
    <div class="bp-body">
      <div class="bp-section">
        <div class="bp-label"><i data-lucide="type"></i> Recommended Titles</div>
        <ul style="padding-left:20px;color:var(--text2);font-size:14px;line-height:1.8">
          ${(j.title_concepts||[]).map(t => `<li style="margin-bottom:4px"><strong>${esc(t)}</strong></li>`).join('')}
        </ul>
      </div>
      
      <div class="bp-section">
        <div class="bp-label"><i data-lucide="image"></i> Thumbnail Visual Template</div>
        <div style="width:100%;max-width:500px;aspect-ratio:16/9;border-radius:12px;overflow:hidden;position:relative;background:linear-gradient(135deg, #111, #222);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;box-shadow:inset 0 0 50px rgba(0,0,0,0.5);margin-top:12px">
          <div style="position:absolute;top:0;left:0;width:40%;height:100%;background:linear-gradient(90deg, rgba(230,57,70,0.1), transparent)"></div>
          <div style="position:absolute;bottom:20px;left:20px;display:flex;flex-direction:column;gap:4px">
            <div style="background:var(--red);color:#fff;padding:8px 16px;font-family:'Impact',sans-serif;font-size:24px;text-transform:uppercase;transform:rotate(-2deg);box-shadow:2px 2px 0 #000;display:inline-block">${j.thumb_text_1 || 'VIRAL'}</div>
            <div style="background:#fff;color:#000;padding:8px 16px;font-family:'Impact',sans-serif;font-size:24px;text-transform:uppercase;transform:rotate(-2deg);box-shadow:2px 2px 0 #000;display:inline-block;margin-left:12px">${j.thumb_text_2 || 'HACK'}</div>
          </div>
          <div style="font-size:13px;color:var(--text2);text-align:center;max-width:250px;margin-left:auto;margin-right:20px;z-index:2;background:rgba(0,0,0,0.5);padding:12px;border-radius:8px">
            <strong style="color:#fff;display:block;margin-bottom:4px">Composition Idea:</strong>
            ${esc(j.thumbnail_template)}
          </div>
        </div>
      </div>
      
      <div class="bp-section" style="border-left:4px solid var(--red)">
        <div class="bp-label"><i data-lucide="play-circle"></i> The Hook (First 30s)</div>
        <div class="bp-text" style="font-size:15px;font-style:italic">"${esc(j.hook)}"</div>
      </div>
      
      <div class="bp-section">
        <div class="bp-label"><i data-lucide="hash"></i> SEO & Description</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px">
          ${(j.seo_tags||[]).map(t => `<span style="background:var(--bg2);border:1px solid var(--border);padding:4px 10px;border-radius:6px;font-size:11px;font-family:monospace;color:var(--text2)">#${esc(t)}</span>`).join('')}
        </div>
        <div class="bp-text" style="font-size:13px">${esc(j.description)}</div>
      </div>
      
      <div class="bp-section">
        <div class="bp-label"><i data-lucide="mouse-pointer-click"></i> Call To Action</div>
        <div class="bp-text">${esc(j.cta)}</div>
      </div>
    </div>
  `;
  lucide.createIcons({root: detail});
};

window.openNewBriefModal = () => {};
window.closeNewBriefModal = () => {};
window.submitNewBrief = async () => {
  const btn = document.getElementById('btn-create-brief');
  if(btn) {
    btn.innerHTML = '<div class="spin" style="margin:auto"></div>';
    btn.disabled = true;
  }
  
  const detail = document.getElementById('brief-detail-view');
  detail.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;padding:40px">
      <div class="spin" style="width:48px;height:48px;border-width:4px;margin-bottom:32px;border-top-color:var(--red)"></div>
      <div style="font-size:20px;font-weight:700;margin-bottom:12px">Running AI Pipeline...</div>
      <div style="color:var(--text2);font-size:15px;max-width:350px;line-height:1.6">Analyzing your channel data and current niche trends to generate a highly optimized production blueprint. <br><br><strong style="color:var(--text)">This usually takes 2-3 minutes.</strong></div>
    </div>
  `;
  
  // Real DB insert and polling
  const channelId = S.channel?.channel_id || null;
  const oppId = S.opps && S.opps.length > 0 ? S.opps[0].id : null;
  
  const { data: brief, error } = await sb.from('briefs').insert({
    channel_id: channelId,
    user_id: S.user.id,
    niche: S.nicheSlug,
    brief_type: 'new_content',
    opportunity_id: oppId,
    status: 'draft',
    generated_at: new Date().toISOString()
  }).select().single();
  
  if (error) {
    toast('Could not queue brief: ' + error.message, 'err');
    renderBriefsTab();
    return;
  }
  
  pollBrief(brief.id);
};

window.pollBrief = (briefId, tries = 0) => {
  const MAX = 30; // 30 tries * 10s = 5 mins max
  setTimeout(async () => {
    const { data: brief } = await sb.from('briefs').select('*').eq('id', briefId).maybeSingle();
    if (brief && (brief.status === 'approved' || brief.brief_json)) {
      const mapped = {
        id: brief.id,
        oppId: brief.opportunity_id || brief.id,
        title: brief.cluster_label || brief.brief_json?.title || 'Generated Brief',
        niche: brief.niche || S.nicheName,
        score: Math.min(99, Math.round((brief.opportunity_score || 0) * 10)) || 75,
        status: 'Ready',
        date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        dbRow: brief,
        brief_json: brief.brief_json,
        created_at: brief.generated_at
      };
      
      S.briefs.unshift(mapped);
      renderBriefsTab();
      selectBrief(mapped.id);
      toast('Pipeline complete! Brief generated successfully.', 'ok');
    } else if (brief && brief.status === 'failed') {
      toast('Pipeline failed to generate brief.', 'err');
      renderBriefsTab();
    } else if (tries < MAX) {
      pollBrief(briefId, tries + 1);
    } else {
      toast('Pipeline timed out.', 'err');
      renderBriefsTab();
    }
  }, 10000); // Check every 10 seconds
};

/* Ã¢â€â‚¬Ã¢â€â‚¬ Render Overview Ã¢â€â‚¬Ã¢â€â‚¬ */
window.renderOverview=()=>{
  const c = S.channel;
  
  // Banner insights
  const banner = document.getElementById('insight-banner');
  if(c) {
    banner.innerHTML = `<div class="insight-icon"><i data-lucide="trending-up"></i></div>
      <div class="insight-text">Actionable Insight: <strong>${esc(c.channel_name)}</strong> is growing! Based on recent trends, posting on Thursday at 4 PM EST yields 18% higher CTR.</div>`;
  } else {
    banner.innerHTML = `<div class="insight-icon"><i data-lucide="sparkles"></i></div>
      <div class="insight-text">Welcome to AutoSignal! Connect your channel in <strong>Integrations</strong> to unlock personalized insights and audits.</div>`;
  }
  lucide.createIcons({root: banner});

  // Stats
  document.getElementById('stat-subs').textContent = c ? fmt(c.subscriber_count) : 'Ã¢â‚¬â€';
  document.getElementById('stat-views').textContent = c ? fmt(c.view_count) : 'Ã¢â‚¬â€';
  document.getElementById('stat-videos').textContent = c ? fmt(c.video_count) : 'Ã¢â‚¬â€';
  document.getElementById('stat-opps').textContent = S.opps.length;

  // Signals
  const sigList = document.getElementById('sig-list');
  sigList.innerHTML = S.opps.length===0
    ?`<div class="empty-state">No signals found for this niche.</div>`
    :S.opps.map(o=>`
      <div class="sig-row" onclick="window.openPanel('${esc(o.id)}')">
        <div class="sig-score ${scoreClass(o.score)}">${o.score}</div>
        <div class="sig-info">
          <div class="sig-title">${esc(o.title)}</div>
          <div class="sig-meta">
            <span>${esc(o.views||'Ã¢â‚¬â€ ')} projected views</span>
            <span class="sig-tag ${o.diff==='Easy'?'tag-easy':o.diff==='Medium'?'tag-med':'tag-hard'}">${esc(o.diff||'Med')}</span>
          </div>
        </div>
        ${o.brief?'<span style="color:var(--green);font-size:12px;font-weight:700">Ã¢Å“â€œ Ready</span>':
          S.processing.has(o.id)?'<div class="spin" style="width:14px;height:14px"></div>':
          '<button class="sig-action">Open Ã¢â€ â€™</button>'}
      </div>
    `).join('');

  // Pipeline
  const activeBriefs=S.briefs.slice(0,5);
  const pipeList = document.getElementById('pipe-list');
  pipeList.innerHTML = activeBriefs.length===0
    ?`<div class="empty-state">Your pipeline is empty.<br>Generate a brief to start.</div>`
    :activeBriefs.map(b=>{
       const ready=!!b.brief_json;
       return`
       <div class="pipe-card" onclick="window.openBriefOnly('${esc(b.id)}')">
         <div class="pipe-header">
           <div class="pipe-status ${ready?'status-ready':'status-gen'}">
             <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:currentColor;margin-right:6px"></span>
             ${ready?'Ready to Shoot':'Generating...'}
           </div>
         </div>
         <div class="pipe-title">${esc(b.title||b.signal_title||'Untitled')}</div>
         <div class="pipe-foot">
           <span>${esc(b.niche||S.nicheName)}</span>
           <span>${new Date(b.created_at).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</span>
         </div>
       </div>`
    }).join('');
};

/* Ã¢â€â‚¬Ã¢â€â‚¬ Chart Setup Ã¢â€â‚¬Ã¢â€â‚¬ */
function initChart(){
  if(S.chartInstance) return; // already init
  const ctx = document.getElementById('growthChart').getContext('2d');
  
  // Mock data for chart
  const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
  const data = [12000, 19000, 30000, 50000, 85000, 120000, 180000];

  Chart.defaults.color = '#A0A0A0';
  Chart.defaults.font.family = "'Inter', sans-serif";

  S.chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Total Views',
        data: data,
        borderColor: '#E63946',
        backgroundColor: 'rgba(230,57,70,0.1)',
        borderWidth: 3,
        pointBackgroundColor: ['#0A0A0A', '#0A0A0A', '#0A0A0A', '#E63946', '#0A0A0A', '#0A0A0A', '#0A0A0A'],
        pointBorderColor: '#E63946',
        pointBorderWidth: [2, 2, 2, 4, 2, 2, 2],
        pointRadius: [4, 4, 4, 7, 4, 4, 4],
        pointHoverRadius: 6,
        fill: true,
        tension: 0.4,
        segment: {
          borderDash: ctx => ctx.p0DataIndex >= 3 ? [6, 6] : undefined,
          borderColor: ctx => ctx.p0DataIndex >= 3 ? 'rgba(230,57,70,0.5)' : '#E63946'
        }
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#161616',
          titleColor: '#fff',
          bodyColor: '#A0A0A0',
          borderColor: '#333333',
          borderWidth: 1,
          padding: 12,
          displayColors: false
        }
      },
      scales: {
        y: {
          grid: { color: '#222222' },
          border: { display: false }
        },
        x: {
          grid: { display: false },
          border: { display: false }
        }
      }
    }
  });
}

/* Ã¢â€â‚¬Ã¢â€â‚¬ Render Audit Ã¢â€â‚¬Ã¢â€â‚¬ */
window.renderAudit=()=>{
  const c = S.channel;
  const container = document.getElementById('audit-content');
  
  if(!c) {
    container.innerHTML = `
      <div class="empty-state" style="padding:100px 20px">
        <div class="empty-icon"><i data-lucide="youtube" style="width:32px;height:32px"></i></div>
        <div style="font-size:18px;font-weight:700;margin-bottom:8px">No Channel Connected</div>
        <p style="color:var(--text2);margin-bottom:24px">Connect your YouTube channel to unlock deep audits and video analytics.</p>
        <button class="int-btn" onclick="switchTab('integrations')">Go to Integrations</button>
      </div>
    `;
    lucide.createIcons({root: container});
    return;
  }

  container.innerHTML = `
    <div class="empty-state" style="padding:100px 20px" id="audit-trigger-state">
      <div class="empty-icon" style="background:transparent"><i data-lucide="scan-line" style="width:48px;height:48px;color:var(--red)"></i></div>
      <div style="font-size:18px;font-weight:700;margin-bottom:8px">Ready to Audit <span style="color:var(--red)">${esc(c.channel_name)}</span></div>
      <p style="color:var(--text2);margin-bottom:24px">Scan your recent video performance to find critical optimization opportunities based on real data.</p>
      <button class="int-btn" id="btn-run-audit" onclick="runChannelAudit()">Run Full Channel Audit</button>
    </div>
    <div id="audit-results" style="display:none"></div>
  `;
  lucide.createIcons({root: container});
};

window.runChannelAudit = async () => {
  const btn = document.getElementById('btn-run-audit');
  if(btn) {
    btn.innerHTML = '<div class="spin" style="margin:auto"></div>';
    btn.disabled = true;
  }
  
  try {
    const niche = S.nicheSlug || 'automotive';
    const res = await fetch(`http://localhost:8787/api/data/channel_metadata.json?niche=${niche}`);
    if(!res.ok) throw new Error("Could not fetch channel metadata. Please ensure channel is connected.");
    const data = await res.json();
    
    const allVideos = data.videos || [];
    if(allVideos.length === 0) throw new Error("No videos found in channel data.");
    
    let totalViews = 0;
    allVideos.forEach(v => totalViews += parseInt(v.viewCount || 0, 10));
    const avgViews = totalViews / allVideos.length;
    
    const underperforming = allVideos.filter(v => parseInt(v.viewCount || 0, 10) < avgViews)
                                     .sort((a,b) => new Date(b.publishedAt) - new Date(a.publishedAt))
                                     .slice(0, 4);
    
    document.getElementById('audit-trigger-state').style.display = 'none';
    const resultsDiv = document.getElementById('audit-results');
    resultsDiv.style.display = 'block';
    
    if(underperforming.length === 0) {
      resultsDiv.innerHTML = `<div class="empty-state">No underperforming videos found! You're doing great.</div>`;
      return;
    }
    
    const formatNum = (num) => {
      if(!num) return '0';
      if(num >= 1000000) return (num/1000000).toFixed(1) + 'M';
      if(num >= 1000) return (num/1000).toFixed(1) + 'K';
      return num.toString();
    };
    
    resultsDiv.innerHTML = `
      <div style="margin-bottom:24px;font-size:16px;font-weight:600">${underperforming.length} Underperforming Videos Detected <span style="color:var(--text3);font-size:13px;font-weight:400;margin-left:12px">Based on your ${formatNum(avgViews)} average views</span></div>
      <div class="audit-grid">
        ${underperforming.map(v => `
          <div class="audit-card" onclick="openDeepAudit('${esc(v.videoId)}')">
            <div class="audit-card-head">
              <img src="${esc(v.thumbnailUrl || v.thumbnail_url || 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=500&q=80')}" class="audit-thumb">
              <div class="audit-metrics">
                <div class="ametric"><i data-lucide="eye"></i> ${formatNum(v.viewCount)}</div>
                <div class="ametric"><i data-lucide="thumbs-up"></i> ${formatNum(v.likeCount)}</div>
                <div class="ametric"><i data-lucide="message-square"></i> ${formatNum(v.commentCount)}</div>
              </div>
            </div>
            <div class="audit-info">
              <div class="audit-title">${esc(v.title)}</div>
              <div class="audit-tags">
                <span class="vtag"><i data-lucide="alert-triangle"></i> Needs Optimization</span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
      </div>
    `;
    lucide.createIcons({root: resultsDiv});
    window.auditUnderperforming = underperforming;
  } catch(err) {
    toast(err.message, 'err');
    if(btn) {
      btn.innerHTML = 'Run Full Channel Audit';
      btn.disabled = false;
    }
  }
};

window.openDeepAudit = (id) => {
  const v = window.auditUnderperforming.find(vid => (vid.id === id || vid.videoId === id));
  if(!v) return;
  
  let html = `
    <div class="modal-backdrop" onclick="this.remove()">
      <div class="modal-content" onclick="event.stopPropagation()" style="max-width:800px;padding:32px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;">
          <h2 style="font-size:24px;margin:0">${esc(v.title)}</h2>
          <i data-lucide="x" style="cursor:pointer" onclick="this.closest('.modal-backdrop').remove()"></i>
        </div>
        
        <div style="display:grid;grid-template-columns:300px 1fr;gap:32px;">
          <div>
            <img src="${esc(v.thumbnailUrl || v.thumbnail_url)}" style="width:100%;border-radius:12px;margin-bottom:16px;">
            <div style="display:flex;gap:12px;margin-bottom:16px">
              <div style="flex:1;background:var(--bg2);padding:12px;border-radius:8px;text-align:center;">
                <div style="font-size:12px;color:var(--text2);margin-bottom:4px">Views</div>
                <div style="font-size:16px;font-weight:700">${parseInt(v.viewCount||0).toLocaleString()}</div>
              </div>
              <div style="flex:1;background:var(--bg2);padding:12px;border-radius:8px;text-align:center;">
                <div style="font-size:12px;color:var(--text2);margin-bottom:4px">Likes</div>
                <div style="font-size:16px;font-weight:700">${parseInt(v.likeCount||0).toLocaleString()}</div>
              </div>
            </div>
            <button class="int-btn" style="width:100%;justify-content:center;background:var(--red);color:white;border:none;">Regenerate Brief</button>
          </div>
          
          <div>
            <h3 style="font-size:18px;margin:0 0 16px 0;display:flex;align-items:center;gap:8px;"><i data-lucide="target" style="color:var(--red)"></i> Automated Critiques</h3>
            <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:24px;">
              <div style="background:rgba(230,57,70,0.1);border:1px solid rgba(230,57,70,0.2);padding:12px 16px;border-radius:8px;display:flex;gap:12px;align-items:flex-start;">
                <i data-lucide="alert-circle" style="color:var(--red);margin-top:2px;width:20px;height:20px"></i>
                <div style="color:var(--text2);line-height:1.5;">Views are below channel average. Your niche may have shifted or the thumbnail didn't capture enough curiosity.</div>
              </div>
              ${parseInt(v.likeCount||0) < (parseInt(v.viewCount||0)*0.02) ? `<div style="background:rgba(230,57,70,0.1);border:1px solid rgba(230,57,70,0.2);padding:12px 16px;border-radius:8px;display:flex;gap:12px;align-items:flex-start;"><i data-lucide="thumbs-down" style="color:var(--red);margin-top:2px;width:20px;height:20px"></i><div style="color:var(--text2);line-height:1.5;">Engagement ratio is lower than optimal. Check your call-to-actions.</div></div>` : ''}
            </div>
            
            <h3 style="font-size:18px;margin:0 0 16px 0;display:flex;align-items:center;gap:8px;"><i data-lucide="check-circle" style="color:#2ecc71"></i> Raw Metadata</h3>
            <div style="background:var(--bg2);padding:16px;border-radius:8px;font-family:monospace;font-size:13px;color:var(--text2);white-space:pre-wrap;overflow:auto;max-height:200px;">${JSON.stringify(v, null, 2)}</div>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
  lucide.createIcons();
};

/* Ã¢â€â‚¬Ã¢â€â‚¬ Render Integrations Ã¢â€â‚¬Ã¢â€â‚¬ */
window.renderIntegrations=()=>{
  const c = S.channel;
  const container = document.getElementById('integration-content');
  
  if(c) {
    container.innerHTML = `
      <div class="int-card connected-card">
        <div class="int-icon connected-icon"><i data-lucide="check-circle"></i></div>
        <div class="int-title">Channel Connected</div>
        <div class="int-desc">You are successfully connected to <strong>${esc(c.channel_name || 'YouTube Channel')}</strong>. We are actively monitoring your stats to provide tailored insights.</div>
        <button class="disconnect-btn" onclick="disconnectChannel()">Disconnect Channel</button>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="int-card">
        <div class="int-icon"><i data-lucide="youtube"></i></div>
        <div class="int-title">Connect YouTube</div>
        <div class="int-desc">Link your channel securely via Google to unlock personalized signals, deep audits, and accurate growth projections.</div>
        <div class="int-input-group">
          <button class="int-btn" style="width:100%;justify-content:center" onclick="connectChannel()">Connect with YouTube</button>
        </div>
      </div>
    `;
  }
  lucide.createIcons({root: container});
};

window.connectChannel = async () => {
  const currentPath = window.location.pathname;
  const redirectTo = window.location.origin + (currentPath.endsWith('.html') ? currentPath : '/app.html') + '?action=connect_yt';
  
  toast('Redirecting to YouTube...', 'inf');
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      scopes: 'https://www.googleapis.com/auth/youtube.readonly'
    }
  });
  
  if (error) {
    toast('Could not initiate YouTube connection: ' + error.message, 'err');
  }
};

window.processYouTubeConnection = async () => {
  toast('Processing YouTube Connection...', 'inf');
  
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session || !session.provider_token) {
      throw new Error("No YouTube provider token found. Please try connecting again.");
    }
    
    const ytRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', {
      headers: { Authorization: `Bearer ${session.provider_token}` }
    });
    const ytData = await ytRes.json();
    
    if (!ytData.items || ytData.items.length === 0) {
      throw new Error("No YouTube channel found for this Google account.");
    }
    
    const channel = ytData.items[0];
    const channelId = channel.id;
    const channelName = channel.snippet.title;
    const stats = channel.statistics || {};
    
    toast('Detecting channel niche...', 'inf');
    const nicheRes = await fetch('http://localhost:8787/api/detect-niche', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel_id: channelId })
    });
    const nicheData = await nicheRes.json();
    const detectedNiche = nicheData.niche || 'automotive';
    
    toast('Fetching channel data...', 'inf');
    await fetch('http://localhost:8787/api/start-script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scriptId: 'fetch_channel', niche: detectedNiche })
    });
    
    const { data: profile, error } = await sb.from('creator_profiles').upsert({
      user_id: S.user.id,
      channel_id: channelId,
      channel_name: channelName,
      detected_niche: detectedNiche,
      subscriber_count: parseInt(stats.subscriberCount || 0, 10),
      profile_json: stats,
      created_at: new Date().toISOString()
    }).select().single();
    
    if (error) throw error;
    
    S.channel = profile;
    S.nicheSlug = detectedNiche;
    S.nicheName = nicheData.display_name || detectedNiche;
    
    window.history.replaceState({}, document.title, window.location.pathname);
    
    toast('Channel Connected Successfully!', 'ok');
    renderIntegrations();
    
  } catch (err) {
    toast('Connection failed: ' + err.message, 'err');
    console.error("processYouTubeConnection error:", err);
  }
};

window.disconnectChannel=async()=>{
  if(confirm("Are you sure you want to disconnect your channel?")) {
    try {
      await sb.from('creator_profiles').delete().eq('user_id',S.user.id);
      S.channel=null;
      toast('Channel disconnected','inf');
      renderIntegrations();
    } catch(e) {
      toast('Error disconnecting','err');
    }
  }
};

/* Ã¢â€â‚¬Ã¢â€â‚¬ Slide Over Panel (Signal Details) Ã¢â€â‚¬Ã¢â€â‚¬ */
window.closeSlidePanel=()=>{
  document.getElementById('slide-panel').classList.remove('open');
  document.getElementById('slide-overlay').classList.remove('open');
};

window.openPanel=(oppId)=>{
  const o=S.opps.find(x=>String(x.id)===String(oppId));
  if(!o)return;
  
  const p=document.getElementById('slide-panel');
  const ov=document.getElementById('slide-overlay');
  
  document.getElementById('sp-title').textContent=o.title;
  document.getElementById('sp-meta').innerHTML=`
    <span style="color:var(--green);font-weight:700;font-family:monospace">Score: ${o.score}</span>
    <span>Ã¢â‚¬Â¢</span>
    <span>${esc(o.views||'Ã¢â‚¬â€')} views</span>
  `;
  
  const body=document.getElementById('sp-body');
  const foot=document.getElementById('sp-foot');
  
  if(o.brief){
    let bj; try{bj=typeof o.brief.brief_json==='string'?JSON.parse(o.brief.brief_json):o.brief.brief_json;}catch(e){}
    
    if(!bj){
      body.innerHTML=`<div class="empty-state">Brief is generating or failed to parse.</div>`;
      foot.innerHTML=`<button class="sp-btn btn-secondary" onclick="window.closeSlidePanel()">Close</button>`;
    }else{
      body.innerHTML=`
        <div class="sp-section">
          <div class="sp-label"><i data-lucide="file-text" style="width:14px;height:14px"></i> Hook Script</div>
          <div class="sp-box">${esc(bj.hook||bj.hook_script||'Ã¢â‚¬â€')}</div>
        </div>
        ${bj.thumbnail_concept?`
        <div class="sp-section">
          <div class="sp-label"><i data-lucide="image" style="width:14px;height:14px"></i> Thumbnail Concept</div>
          <div class="sp-box">${esc(bj.thumbnail_concept)}</div>
        </div>`:''}
        ${bj.seo_tags||bj.tags?`
        <div class="sp-section">
          <div class="sp-label"><i data-lucide="hash" style="width:14px;height:14px"></i> SEO Tags</div>
          <div class="sp-tags">${(bj.seo_tags||bj.tags||[]).map(t=>`<div class="sp-tag-item">${esc(t)}</div>`).join('')}</div>
        </div>`:''}
        ${bj.upload_time||bj.best_upload_time?`
        <div class="sp-section">
          <div class="sp-label"><i data-lucide="clock" style="width:14px;height:14px"></i> Upload Timing</div>
          <div class="sp-box" style="color:var(--green);font-family:monospace;font-weight:700">${esc(bj.upload_time||bj.best_upload_time)}</div>
        </div>`:''}
      `;
      foot.innerHTML=`
        <button class="sp-btn btn-secondary" onclick="window.closeSlidePanel()">Close</button>
        <button class="sp-btn btn-primary" onclick="window.copyBrief('${esc(o.brief.id)}')">Copy to Clipboard</button>
      `;
      setTimeout(()=>lucide.createIcons({root:body}), 0);
    }
  }else{
    body.innerHTML=`
      <div style="font-size:18px;font-weight:600;margin-bottom:16px">This signal is highly actionable.</div>
      <p style="color:var(--text2);line-height:1.6;margin-bottom:24px">Generating a brief will use AutoSignal's AI to analyze the topic against current trends and your channel's past performance to produce a complete production blueprint.</p>
      
      <div style="display:flex;gap:16px">
        <div style="flex:1;background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:16px">
          <div style="font-size:11px;color:var(--text3);text-transform:uppercase;margin-bottom:4px">Est. Views</div>
          <div style="font-size:20px;font-weight:800;font-family:monospace;color:var(--green)">${esc(o.views||'Ã¢â‚¬â€')}</div>
        </div>
        <div style="flex:1;background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:16px">
          <div style="font-size:11px;color:var(--text3);text-transform:uppercase;margin-bottom:4px">Difficulty</div>
          <div style="font-size:20px;font-weight:800;font-family:monospace;color:var(--text)">${esc(o.diff||'Ã¢â‚¬â€')}</div>
        </div>
      </div>
    `;
    foot.innerHTML=`
      <button class="sp-btn btn-secondary" onclick="window.closeSlidePanel()">Cancel</button>
      <button class="sp-btn btn-primary" onclick="window.genBrief('${esc(o.id)}')">Generate Brief Blueprint</button>
    `;
  }
  
  ov.classList.add('open');
  p.classList.add('open');
};

window.openBriefOnly=(briefId)=>{
  const b=S.briefs.find(x=>String(x.id)===String(briefId));
  if(!b)return;
  const o=S.opps.find(x=>x.brief&&String(x.brief.id)===String(briefId)) || {
    id: b.signal_id||'tmp', title: b.title||b.signal_title, score: 'Ã¢â‚¬â€', brief: b
  };
  if(!S.opps.find(x=>x.id===o.id)) S.opps.push(o);
  window.openPanel(o.id);
};

window.genBrief=async(oppId)=>{
  const btn=document.querySelector('.sp-btn.btn-primary');
  if(btn) btn.innerHTML=`<div class="spin"></div> Generating...`;
  
  S.processing.add(oppId);
  if(document.getElementById('tab-overview').classList.contains('active')) renderOverview();
  
  try{
    const{data,error}=await sb.functions.invoke('generate-brief',{body:{signal_id:oppId,niche_slug:S.nicheSlug,user_id:S.user.id,channel_id:S.channel?.id}});
    if(error||(data&&data.error))throw new Error(data?.error||error?.message||'Generation failed');
    await loadData();
    toast('Blueprint generated successfully!','ok');
    window.openPanel(oppId); 
  }catch(e){
    toast(e.message,'err');
    if(btn) btn.innerHTML=`Generate Brief Blueprint`;
  }
  S.processing.delete(oppId);
  if(document.getElementById('tab-overview').classList.contains('active')) renderOverview();
};

window.copyBrief=async(id)=>{
  const b=S.briefs.find(x=>String(x.id)===String(id));
  if(!b||!b.brief_json)return;
  try{
    await navigator.clipboard.writeText(typeof b.brief_json==='string'?b.brief_json:JSON.stringify(b.brief_json,null,2));
    toast('Copied to clipboard','ok');
  }catch(e){toast('Copy failed','err')}
};
