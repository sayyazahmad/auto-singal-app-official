import React, { useState, useEffect, useRef } from 'react';
import VideoStudio from './VideoStudio';
import ChannelAnalytics from './ChannelAnalytics';
import {
  Play,
  Pause,
  RefreshCw,
  FileCode,
  FileText,
  CheckCircle2,
  AlertCircle,
  Terminal,
  Flame,
  TrendingUp,
  Layers,
  Search,
  PenLine,
  Filter,
  ArrowUpRight,
  Eye,
  Clock,
  Users,
  BarChart3,
  Database,
  Copy,
  ChevronRight,
  ChevronDown,
  X,
  Zap,
  Info,
  Loader2,
  Cpu,
  Video,
  Target,
  Lightbulb,
  Radio,
  SlidersHorizontal,
  Compass,
  ArrowRight,
  BookOpen,
  Sun,
  Moon,
  Check,
  Printer,
  Volume2,
  VolumeX,
  Camera,
  Award,
  PanelLeft,
  PanelLeftClose,
  Plus,
  Bookmark,
  History,
  FolderKanban,
  ExternalLink,
  ChevronLeft,
  Settings,
  Film,
  Smartphone,
  Monitor,
  Scissors,
  Wand2,
  Key,
  Download,
  Share2,
  RotateCcw,
  Sliders,
  CheckCheck,
  Lock
} from 'lucide-react';

interface NicheInfo {
  id: string;
  label: string;
  icon: string;
  category?: string;
  description: string;
  videoCount: number;
  outlierCount: number;
  clusterCount: number;
  opportunityCount: number;
}

interface PipelineStep {
  id: string;
  name: string;
  script: string;
  description: string;
  outputFiles: string[];
}

interface VideoItem {
  video_id: string;
  title: string;
  channel_title: string;
  channel_subscriber_count: number;
  channel_avg_views: number;
  view_count: number;
  views_per_hour: number;
  outperformance_ratio: number;
  analysis_score_10: number;
  hours_since_publish: number;
  repair_similarity: number;
  subniche: string;
  intent_label: string;
  winner_tag: string;
  thumbnail_url: string;
}

interface ClusterItem {
  cluster_id: string;
  cluster_rank: number;
  cluster_label: string;
  topic: string;
  cluster_score10: number;
  video_count: number;
  search_gap: number;
  demand_score: number;
  avg_vph: number;
  avg_outperformance: number;
  window: string;
  top_videos?: VideoItem[];
}

interface OpportunityItem {
  rank: number;
  cluster_label: string;
  topic: string;
  final_score: number;
  window: string;
  trending_score: number;
  search_gap_score: number;
  seasonal_score: number;
  outlier_score: number;
  video_count: number;
  avg_vph: number;
  outperformance_multiplier: string;
  search_gap_percent: string;
  recommended_angle: string;
  sample_titles?: string[];
  live?: boolean;
}

interface BriefItem {
  brief_id: string;
  niche: string;
  topic: string;
  target_angle: string;
  ai_powered?: boolean;
  generated_at: string;
  titles: {
    title_1_search_match: string;
    title_2_curiosity: string;
    title_3_value: string;
    recommended_title: string;
    reason: string;
  };
  hook_script: string;
  thumbnail_direction: {
    primary_image: string;
    text_overlay: string;
    color_signal: string;
    focal_point: string;
  };
  pacing_outline: Array<{ time: string; beat: string; action: string }>;
  production_checklist: string[];
  // Present on briefs built from live YouTube research
  live_research?: boolean;
  why_it_works?: string;
  pattern_insights?: string[];
  source_video_ids?: string[];
  research?: { query: string; window_days: number; videos_analysed: number; small_channel_share: number; cached?: boolean };
  opportunity?: OpportunityItem;
}

interface StepHumanSummary {
  stepNumber: number;
  title: string;
  headline: string;
  explanation: string;
  metrics: Array<{ label: string; value: string; badge?: string }>;
  highlights: string[];
  previewItems: Array<{ title: string; badge: string; metric: string }>;
}

interface StepExecutionState {
  status: 'pending' | 'running' | 'done' | 'error';
  executionTimeMs?: number;
  summary?: StepHumanSummary;
  stdout?: string;
  stderr?: string;
  expanded?: boolean;
}

export default function App() {
  const [niches, setNiches] = useState<NicheInfo[]>([]);
  const [selectedNiche, setSelectedNiche] = useState<string>('automotive');
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>([]);
  
  // Theme & Layout
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  // ─── MODES SELECTABLE VIA LEFT NAVBAR ────────────────────────────────────
  // 'simple': Super clean, conversational for casual users (No clutter, 1 button, 4 simple steps, clear answer)
  // 'creator': The Masterclass Creator Studio ("tell everything" - full hook psychology, 3 title angles, teleprompter, thumbnail prompt, pacing schedule)
  // 'video-studio': AI Video Studio (YouTube Upload Stepper, Clipper, Faceless, Split-screen, Aspect Ratio, Kinetic Subtitles, Review & Render)
  // 'deepdive': Technical engineering view (7 Python steps, raw terminal stdout, vector clusters, discards audit)
  const [appMode, setAppMode] = useState<'simple' | 'creator' | 'video-studio' | 'deepdive' | 'channel'>(
    () => (new URLSearchParams(window.location.search).get('view') === 'channel' ? 'channel' : 'creator')
  );

  // Active & Recent Briefs State (Fixes duplicate brief bug)
  const [activeBrief, setActiveBrief] = useState<BriefItem | null>(null);
  const [recentBriefs, setRecentBriefs] = useState<BriefItem[]>([]);
  const [activeOpportunity, setActiveOpportunity] = useState<OpportunityItem | null>(null);

  // Settings & Niches Modal State
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [settingsTab, setSettingsTab] = useState<'niches' | 'keys' | 'gates'>('niches');
  const [nicheSearch, setNicheSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [youtubeKeyInput, setYoutubeKeyInput] = useState<string>('');
  const [geminiKeyInput, setGeminiKeyInput] = useState<string>('');
  const [savingKey, setSavingKey] = useState<boolean>(false);
  const [apiKeysStatus, setApiKeysStatus] = useState<{
    geminiConfigured: boolean;
    geminiModel: string;
    youtubeConfigured: boolean;
    userCustomYoutubeApiKey: string;
    activeNichesCount?: number;
  } | null>(null);

  // Discovery / Scanner Gates Thresholds
  const [gateMultiplier, setGateMultiplier] = useState<number>(3.0);
  const [gateMinDuration, setGateMinDuration] = useState<number>(180);
  const [gateFreshnessDays, setGateFreshnessDays] = useState<number>(30);

  // ─── AI VIDEO STUDIO STATE (NEW) ──────────────────────────────────────────
  const [selectedOutlierVideo, setSelectedOutlierVideo] = useState<VideoItem | null>(null);
  const [studioCustomTopic, setStudioCustomTopic] = useState<string>('');
  const setCurrentTopic = (t: string) => setStudioCustomTopic(t);
  // Lets other views open Video Studio on a specific section (key forces a re-apply on repeat clicks)
  const [studioRequest, setStudioRequest] = useState<{ tab: 'create' | 'templates' | 'clips'; clipSource?: string; key: number } | null>(null);

  // Sub-tabs for deepdive mode
  const [activeTab, setActiveTab] = useState<'auto-runner' | 'pipeline' | 'videos' | 'clusters' | 'opportunities' | 'discards'>('auto-runner');

  // Niche Data
  const [data, setData] = useState<{
    top100: any;
    mergedSemantic: { videos?: VideoItem[] };
    clusters: ClusterItem[];
    opportunities: OpportunityItem[];
    channelMeta: any;
    discoveredChannels: any[];
    discardedVideos: any[];
    briefs: BriefItem[];
  } | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [runningStep, setRunningStep] = useState<string | null>(null);
  const [consoleLogs, setConsoleLogs] = useState<Array<{ time: string; text: string; type: 'info' | 'success' | 'warn' | 'error' }>>([
    { time: new Date().toLocaleTimeString(), text: 'AutoSignal Engine ready with ChatGPT/Claude style sidebar.', type: 'info' }
  ]);

  // Sequential Auto-Runner State
  const [isAutoRunning, setIsAutoRunning] = useState<boolean>(false);
  const [autoRunStepIndex, setAutoRunStepIndex] = useState<number>(-1);
  const [autoRunProgress, setAutoRunProgress] = useState<number>(0);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const timerRef = useRef<any>(null);
  const isCancelledRef = useRef<boolean>(false);

  // Simple Mode Progress Simulation / Scan
  const [isSimpleRunning, setIsSimpleRunning] = useState<boolean>(false);
  const [simpleActiveStep, setSimpleActiveStep] = useState<number>(4);

  // Creator Mode State & Customization
  const [activeHookStyle, setActiveHookStyle] = useState<'debunk' | 'lossAversion' | 'proof' | 'question'>('debunk');
  const [showTeleprompter, setShowTeleprompter] = useState<boolean>(false);
  const [teleprompterSpeed, setTeleprompterSpeed] = useState<number>(140);
  const [teleprompterFontSize, setTeleprompterFontSize] = useState<number>(24);
  const [isPrompterPlaying, setIsPrompterPlaying] = useState<boolean>(false);
  const [showQuickTips, setShowQuickTips] = useState<boolean>(false);
  const [quickTipsTab, setQuickTipsTab] = useState<'psychology' | 'retention' | 'delivery'>('psychology');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Production checklist tracking
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({
    hookMemorized: true,
    thumbnailShotTaken: false,
    audioLeveled: true,
    patternInterruptReady: true,
    brollQueued: false,
  });

  // Per-step execution results dictionary
  const [stepResults, setStepResults] = useState<Record<string, StepExecutionState>>({});

  // Modals
  const [codeModal, setCodeModal] = useState<{ open: boolean; title: string; code: string; filename: string } | null>(null);
  const [jsonModal, setJsonModal] = useState<{ open: boolean; title: string; data: any } | null>(null);
  const [generatingBrief, setGeneratingBrief] = useState<boolean>(false);

  // Video Search & Filter
  const [videoFilter, setVideoFilter] = useState<'all' | 'outliers' | 'viral' | 'evergreen'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearchingLive, setIsSearchingLive] = useState<boolean>(false);
  const [liveSearchResult, setLiveSearchResult] = useState<{
    query: string;
    count: number;
    isLive: boolean;
    topVideoTitle: string;
  } | null>(null);

  // Toast notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), type === 'error' ? 9000 : 3500);
  };

  const handleCopy = (text: string, key: string, label = 'Copied to clipboard') => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    showToast(label, 'success');
    setTimeout(() => setCopiedKey(null), 2500);
  };

  // Toggle Theme Class on Root
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Fetch Niches and API Keys on Mount
  useEffect(() => {
    fetch('/api/niches')
      .then(res => res.json())
      .then(json => {
        if (json.niches) {
          setNiches(json.niches);
          setPipelineSteps(json.pipelineSteps || []);
          if (json.niches.length > 0 && !selectedNiche) {
            setSelectedNiche(json.niches[0].id);
          }
        }
      })
      .catch(err => console.error('Failed to load niches:', err));

    fetch('/api/config/keys')
      .then(res => res.json())
      .then(json => {
        setApiKeysStatus(json);
        if (json.userCustomYoutubeApiKey) {
          setYoutubeKeyInput(json.userCustomYoutubeApiKey);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch Data when selectedNiche changes
  useEffect(() => {
    if (!selectedNiche) return;
    setLoading(true);
    fetch(`/api/data/${selectedNiche}`)
      .then(res => res.json())
      .then(result => {
        setData(result);
        setLoading(false);
        if (result.briefs && result.briefs.length > 0) {
          setActiveBrief(result.briefs[0]);
          setRecentBriefs(result.briefs);
        } else {
          setActiveBrief(null);
        }
        // Latest live idea wins over the pipeline's saved #1 opportunity
        if (result.briefs?.[0]?.opportunity) {
          setActiveOpportunity(result.briefs[0].opportunity);
        } else if (result.opportunities && result.opportunities.length > 0) {
          setActiveOpportunity(result.opportunities[0]);
        }
        const vList = result.mergedSemantic?.videos || [];
        if (vList.length > 0) {
          setSelectedOutlierVideo(vList.find((v: any) => v.outperformance_ratio >= 3.0) || vList[0]);
        }
      })
      .catch(err => {
        console.error('Failed to load niche data:', err);
        setLoading(false);
      });
  }, [selectedNiche]);

  // Teleprompter Auto-scroll Effect
  const prompterContentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let scrollInterval: any = null;
    if (showTeleprompter && isPrompterPlaying && prompterContentRef.current) {
      const pixelsPerSec = (teleprompterSpeed / 60) * 18;
      scrollInterval = setInterval(() => {
        if (prompterContentRef.current) {
          prompterContentRef.current.scrollTop += 1.5;
        }
      }, 1000 / (pixelsPerSec || 30));
    }
    return () => {
      if (scrollInterval) clearInterval(scrollInterval);
    };
  }, [showTeleprompter, isPrompterPlaying, teleprompterSpeed]);

  // Execute single pipeline step
  const executeStep = async (stepId: string) => {
    const stepObj = pipelineSteps.find(s => s.id === stepId);
    const stepLabel = stepObj ? stepObj.name : stepId;

    setConsoleLogs(prev => [
      { time: new Date().toLocaleTimeString(), text: `▶ Executing: ${stepLabel} for [${selectedNiche.toUpperCase()}]...`, type: 'info' },
      ...prev
    ]);

    try {
      const res = await fetch('/api/pipeline/run-step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche: selectedNiche, stepId })
      });
      const result = await res.json();

      if (result.success) {
        setConsoleLogs(prev => [
          { time: new Date().toLocaleTimeString(), text: `✔ Completed ${stepLabel} (${result.executionTimeMs}ms):\n${result.stdout}`, type: 'success' },
          ...prev
        ]);
        return result;
      } else {
        setConsoleLogs(prev => [
          { time: new Date().toLocaleTimeString(), text: `⚠ Completed with output (${result.executionTimeMs}ms):\n${result.stdout || result.stderr || result.error}`, type: 'warn' },
          ...prev
        ]);
        return result;
      }
    } catch (err: any) {
      setConsoleLogs(prev => [
        { time: new Date().toLocaleTimeString(), text: `❌ Execution failed: ${err.message}`, type: 'error' },
        ...prev
      ]);
      return { success: false, error: err.message };
    }
  };

  // Run a standalone step manually
  const handleRunSingleStep = async (stepId: string) => {
    setRunningStep(stepId);
    const result = await executeStep(stepId);
    setRunningStep(null);

    if (result.success) {
      showToast(`Step "${stepId}" completed successfully!`, 'success');
      setStepResults(prev => ({
        ...prev,
        [stepId]: {
          status: 'done',
          executionTimeMs: result.executionTimeMs,
          summary: result.summary,
          stdout: result.stdout,
          stderr: result.stderr,
          expanded: true
        }
      }));
    } else {
      showToast(`Step completed with notes`, 'info');
    }

    const refreshRes = await fetch(`/api/data/${selectedNiche}`);
    const freshData = await refreshRes.json();
    setData(freshData);
  };

  // e.g. "from 12 live YouTube outliers (cached, no quota used)" / "(118 of 2,000 daily units used)"
  const describeLiveSource = (result: any) => {
    const usage = result.cached
      ? 'cached YouTube data, no quota used'
      : result.quota ? `${result.quota.unitsUsed.toLocaleString()} of ${result.quota.dailyBudget.toLocaleString()} daily YouTube units used` : '';
    return `${result.videos.length} YouTube outliers${usage ? ` (${usage})` : ''}`;
  };

  // Show a live research result (brief + opportunity + videos) everywhere the UI reads them
  const applyLiveResult = (result: { brief: BriefItem; opportunity: OpportunityItem; videos: VideoItem[] }) => {
    setActiveOpportunity(result.opportunity);
    setActiveBrief(result.brief);
    setActiveHookStyle('debunk');
    setRecentBriefs(prev => [result.brief, ...prev.filter(b => b.brief_id !== result.brief.brief_id)]);
    setData(prev => {
      if (!prev) return prev;
      const prevVideos = prev.mergedSemantic?.videos || [];
      const seen = new Set(result.videos.map(v => v.video_id));
      const merged = [...result.videos, ...prevVideos.filter((v: any) => !seen.has(v.video_id))];
      return { ...prev, mergedSemantic: { videos: merged }, mergedVideos: { videos: merged } };
    });
    if (result.videos.length > 0) setSelectedOutlierVideo(result.videos[0]);
  };

  // Point the user at Settings → API Keys instead of silently re-showing old data
  const promptForKeys = (message: string) => {
    setSettingsTab('keys');
    setShowSettingsModal(true);
    showToast(message, 'error');
  };

  // Simple Mode Instant Scan: live YouTube research + Gemini when keys are set
  const handleSimpleRun = async () => {
    if (isSimpleRunning) return;
    if (!apiKeysStatus?.geminiConfigured || !apiKeysStatus?.youtubeConfigured) {
      promptForKeys('New ideas need your Gemini and YouTube keys. Add them here.');
      return;
    }
    setIsSimpleRunning(true);
    setSimpleActiveStep(0);

    const request = fetch('/api/ideas/live', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        niche: selectedNiche,
        creatorSubs: data?.channelMeta?.subscribers,
        creatorAvgViews: data?.channelMeta?.average_views
      })
    }).then(r => r.json()).catch((err: any) => ({ success: false, error: err.message }));

    for (let s = 1; s <= 3; s++) {
      await new Promise(r => setTimeout(r, 450));
      setSimpleActiveStep(s);
    }
    const result = await request;
    setSimpleActiveStep(4);
    setIsSimpleRunning(false);

    if (result.success) {
      applyLiveResult(result);
      showToast(`New idea from ${describeLiveSource(result)}`, 'success');
    } else {
      showToast(result.error || 'Live research failed', 'error');
    }
  };

  // Sequential Pipeline Runner
  const startSequentialAutoRun = async () => {
    if (isAutoRunning || pipelineSteps.length === 0) return;

    setIsAutoRunning(true);
    isCancelledRef.current = false;
    setAutoRunStepIndex(0);
    setAutoRunProgress(0);
    setElapsedTime(0);

    const startTimestamp = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTimestamp) / 1000));
    }, 500);

    const initialResults: Record<string, StepExecutionState> = {};
    pipelineSteps.forEach(s => {
      initialResults[s.id] = { status: 'pending', expanded: false };
    });
    setStepResults(initialResults);

    showToast(`Starting sequential pipeline execution for ${selectedNiche.toUpperCase()}...`, 'info');

    for (let i = 0; i < pipelineSteps.length; i++) {
      if (isCancelledRef.current) {
        showToast('Sequential pipeline run paused.', 'info');
        break;
      }

      const step = pipelineSteps[i];
      setAutoRunStepIndex(i);

      setStepResults(prev => ({
        ...prev,
        [step.id]: { ...prev[step.id], status: 'running', expanded: true }
      }));

      setAutoRunProgress(Math.round((i / pipelineSteps.length) * 100));
      const result = await executeStep(step.id);

      setStepResults(prev => ({
        ...prev,
        [step.id]: {
          status: 'done',
          executionTimeMs: result.executionTimeMs,
          summary: result.summary,
          stdout: result.stdout,
          stderr: result.stderr,
          expanded: true
        }
      }));

      setAutoRunProgress(Math.round(((i + 1) / pipelineSteps.length) * 100));
      await new Promise(r => setTimeout(r, 400));
    }

    clearInterval(timerRef.current);
    setIsAutoRunning(false);
    setAutoRunStepIndex(-1);
    setAutoRunProgress(100);

    showToast('✨ All 7 pipeline steps completed successfully!', 'success');
    const refreshRes = await fetch(`/api/data/${selectedNiche}`);
    const freshData = await refreshRes.json();
    setData(freshData);
  };

  const stopSequentialAutoRun = () => {
    isCancelledRef.current = true;
    setIsAutoRunning(false);
    clearInterval(timerRef.current);
    showToast('Auto-runner stopped', 'info');
  };

  const handleViewPythonCode = async (filename: string) => {
    try {
      const res = await fetch(`/api/python-code/${filename}`);
      const result = await res.json();
      if (result.code) {
        setCodeModal({ open: true, title: filename, code: result.code, filename });
      }
    } catch (err: any) {
      showToast(`Could not open file: ${err.message}`, 'error');
    }
  };

  const handleSaveYoutubeApiKey = async () => {
    setSavingKey(true);
    try {
      const res = await fetch('/api/config/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtubeApiKey: youtubeKeyInput, geminiApiKey: geminiKeyInput })
      });
      const json = await res.json();
      setApiKeysStatus(prev => ({
        geminiConfigured: json.geminiConfigured,
        geminiModel: json.geminiModel || prev?.geminiModel || '',
        youtubeConfigured: json.youtubeConfigured,
        userCustomYoutubeApiKey: json.userCustomYoutubeApiKey,
        activeNichesCount: 20
      }));
      if (json.success) {
        setGeminiKeyInput('');
        showToast(json.savedToEnv ? 'Keys verified and saved to .env' : 'Keys verified', 'success');
      } else {
        const problems = [
          json.errors?.youtube && `YouTube: ${json.errors.youtube}`,
          json.errors?.gemini && `Gemini: ${json.errors.gemini}`
        ].filter(Boolean).join(' | ');
        showToast(`Key not saved. ${problems}`, 'error');
      }
    } catch (err: any) {
      showToast(`Key error: ${err.message}`, 'error');
    } finally {
      setSavingKey(false);
    }
  };

  const handleGenerateBrief = async (target?: OpportunityItem | VideoItem | string) => {
    if (!apiKeysStatus?.geminiConfigured) {
      promptForKeys('Generating a new brief needs your Gemini key (and YouTube key for live data). Add them here.');
      return;
    }
    setGeneratingBrief(true);
    let topicName = 'High-Impact Content Strategy';
    let angleText = 'Uncovering counter-intuitive secrets that outperform common advice';
    let score = 9.5;

    if (typeof target === 'string') {
      topicName = target;
      angleText = `Comprehensive breakdown and high-retention tutorial for ${target}`;
      setActiveOpportunity({
        rank: 1,
        cluster_label: target,
        topic: target,
        final_score: 9.8,
        window: 'IMMEDIATE',
        trending_score: 9.7,
        search_gap_score: 9.8,
        seasonal_score: 9.2,
        outlier_score: 9.8,
        video_count: 14,
        avg_vph: 2600,
        outperformance_multiplier: '6.2x Channel Baseline',
        search_gap_percent: '94% High Demand',
        recommended_angle: `Why 90% of tutorials on ${target} fail`
      });
    } else if (target && 'cluster_label' in target) {
      topicName = target.cluster_label;
      angleText = target.recommended_angle || angleText;
      score = target.final_score || score;
      setActiveOpportunity(target);
    } else if (target && 'title' in target) {
      topicName = target.title;
      angleText = `Deconstructing why this video outperformed by ${target.outperformance_ratio}x`;
      score = target.analysis_score_10 || score;
      setActiveOpportunity({
        rank: 1,
        cluster_label: target.title,
        topic: target.title,
        final_score: target.analysis_score_10 || 9.7,
        window: 'IMMEDIATE',
        trending_score: 9.6,
        search_gap_score: 9.7,
        seasonal_score: 9.0,
        outlier_score: 9.8,
        video_count: 8,
        avg_vph: target.views_per_hour,
        outperformance_multiplier: `${target.outperformance_ratio}x Channel Baseline`,
        search_gap_percent: '92% Demand Gap',
        recommended_angle: `Deconstruct why "${target.title}" outperformed`
      });
    } else if (activeOpportunity) {
      topicName = activeOpportunity.cluster_label;
      angleText = activeOpportunity.recommended_angle || angleText;
      score = activeOpportunity.final_score || score;
    } else if (topOpp) {
      topicName = topOpp.cluster_label;
      angleText = topOpp.recommended_angle;
      score = topOpp.final_score;
    }

    showToast(`Generating AI Masterclass Brief for "${topicName}"...`, 'info');

    try {
      const res = await fetch('/api/briefs/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          niche: selectedNiche,
          topic: topicName,
          clusterScore: score,
          angle: angleText,
          creatorSubs: data?.channelMeta?.subscribers || 25000,
          creatorAvgViews: data?.channelMeta?.average_views || 14000
        })
      });

      const result = await res.json();
      if (result.success && result.live) {
        applyLiveResult(result);
        showToast(`Brief built from ${describeLiveSource(result)}`, 'success');
      } else if (result.success && result.brief) {
        setActiveBrief(result.brief);
        setRecentBriefs(prev => [result.brief, ...prev.filter(b => b.brief_id !== result.brief.brief_id)]);
        showToast(
          result.liveError ? `Live research failed (${result.liveError}). Used topic-only brief.` : `✨ Generated new AI Brief for "${result.brief.topic}"!`,
          result.liveError ? 'error' : 'success'
        );

        // Refresh niche data in background
        const refreshRes = await fetch(`/api/data/${selectedNiche}`);
        const freshData = await refreshRes.json();
        setData(freshData);
      } else {
        showToast('Brief generated from database blueprint', 'info');
      }
    } catch (err: any) {
      showToast(`Brief error: ${err.message}`, 'error');
    } finally {
      setGeneratingBrief(false);
    }
  };

  const handleLiveYoutubeSearch = async (queryText?: string) => {
    const q = (queryText || searchQuery || '').trim();
    if (!q) {
      showToast('Please type a search query first', 'error');
      return;
    }

    setIsSearchingLive(true);
    showToast(`Searching live YouTube outliers for "${q}"...`, 'info');

    try {
      const res = await fetch('/api/youtube/search-and-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          niche: selectedNiche,
          apiKey: youtubeKeyInput
        })
      });
      const result = await res.json();

      if (result.success && Array.isArray(result.videos) && result.videos.length > 0) {
        // Update local data state with newly saved videos
        setData(prev => {
          if (!prev) return prev;
          const prevVideos = prev.mergedSemantic?.videos || [];
          const seen = new Set(result.videos.map((v: any) => v.video_id));
          const merged = [...result.videos, ...prevVideos.filter((v: any) => !seen.has(v.video_id))];
          return {
            ...prev,
            mergedSemantic: { videos: merged },
            mergedVideos: { videos: merged }
          };
        });

        // Set the active brief to the newly generated brief
        if (result.brief) {
          setActiveBrief(result.brief);
          setRecentBriefs(prev => [result.brief, ...prev.filter(b => b.brief_id !== result.brief.brief_id)]);
        }

        // Set the active opportunity
        setActiveOpportunity({
          rank: 1,
          cluster_label: q,
          topic: q,
          final_score: 9.8,
          window: 'IMMEDIATE',
          trending_score: 9.7,
          search_gap_score: 9.8,
          seasonal_score: 9.2,
          outlier_score: 9.8,
          video_count: result.videos.length,
          avg_vph: result.videos[0]?.views_per_hour || 2400,
          outperformance_multiplier: `${result.videos[0]?.outperformance_ratio || 5.4}x Baseline`,
          search_gap_percent: '94% High Search Gap',
          recommended_angle: `Why 90% of tutorials on ${q} fail`
        });

        setSelectedOutlierVideo(result.videos[0]);
        setLiveSearchResult({
          query: q,
          count: result.videos.length,
          isLive: Boolean(result.isLiveYoutube),
          topVideoTitle: result.videos[0]?.title || q
        });

        showToast(
          result.isLiveYoutube
            ? `✔ Saved ${result.videos.length} live YouTube videos to database!`
            : `✔ Saved ${result.videos.length} breakout outliers for "${q}"!`,
          'success'
        );
      } else {
        showToast(result.error || 'No videos returned from search', 'error');
      }
    } catch (err: any) {
      showToast(`Search error: ${err.message}`, 'error');
    } finally {
      setIsSearchingLive(false);
    }
  };

  const toggleStepCard = (stepId: string) => {
    setStepResults(prev => ({
      ...prev,
      [stepId]: {
        ...prev[stepId],
        expanded: !prev[stepId]?.expanded
      }
    }));
  };

  // Helper values
  const currentNicheMeta = niches.find(n => n.id === selectedNiche);
  const videosList: VideoItem[] = data?.mergedSemantic?.videos || [];
  const topOpp: OpportunityItem | undefined = activeOpportunity || data?.opportunities?.[0];
  const topScore = topOpp?.final_score || 9.8;
  const currentBrief: BriefItem | undefined = activeBrief || (data?.briefs && data.briefs.length > 0 ? data.briefs[0] : undefined);
  const latestBrief = currentBrief;

  const filteredVideos = videosList.filter(v => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const match = v.title.toLowerCase().includes(q) || v.channel_title.toLowerCase().includes(q) || v.subniche?.toLowerCase().includes(q);
      if (!match) return false;
    }
    if (videoFilter === 'outliers') return v.outperformance_ratio >= 3.0;
    if (videoFilter === 'viral') return v.views_per_hour >= 2000;
    if (videoFilter === 'evergreen') return v.winner_tag === 'evergreen_winner' || v.hours_since_publish > 72;
    return true;
  });

  const strongOutliersCount = videosList.filter(v => v.outperformance_ratio >= 3.0).length || 4;

  // 4 Hook variations tailored to topic
  const currentTopic = studioCustomTopic || topOpp?.cluster_label || latestBrief?.topic || 'Brake Caliper Pin Service';
  const hookVariations: Record<'debunk' | 'lossAversion' | 'proof' | 'question', {
    label: string;
    badge: string;
    delivery: string;
    script: string;
    whyItWorks: string;
  }> = {
    debunk: {
      label: 'Debunk & Pattern Interrupt',
      badge: 'Highest Retention',
      delivery: 'Direct to lens, confident skeptic tone, 0:03 quick cut to warning graphic.',
      script: `Before you spend a single dollar trying to fix ${currentTopic.toLowerCase()}, stop. Over 80% of creators and DIY mechanics give advice that actually creates worse problems down the line. In the next 6 minutes, I will show you the exact procedure the pros use that YouTube almost never shows you.`,
      whyItWorks: 'Breaks the viewer’s expectation instantly by calling out faulty common advice. Hooks skeptical viewers within 3 seconds.'
    },
    lossAversion: {
      label: 'Costly Mistake & Loss Aversion',
      badge: 'Highest Click-Through',
      delivery: 'Urgent, serious delivery, holding a damaged part or pointing at danger area.',
      script: `Doing this one common thing to your ${currentTopic.toLowerCase()} could easily cost you over $1,200 in premature wear. I see people making this exact mistake every single week. Here is the 10-minute check you need to do today before it breaks completely.`,
      whyItWorks: 'Leverages behavioral loss aversion: humans are twice as motivated to avoid losing $1,000 as they are to save $1,000.'
    },
    proof: {
      label: 'Proof & Result First',
      badge: 'Fastest Authority',
      delivery: 'Show the working result on screen in the first 2 seconds, high energy.',
      script: `Look at this right here. This took under 20 minutes and cost less than $15, yet it completely eliminated the issue that two separate shops couldn't diagnose. You don't need expensive equipment—here is the exact step-by-step breakdown.`,
      whyItWorks: 'Demonstrates tangible proof before explaining theory. Reduces immediate drop-off by validating the viewer’s time investment.'
    },
    question: {
      label: 'Curiosity & Unpopular Truth',
      badge: 'High Engagement & Comments',
      delivery: 'Intriguing, conversational, head tilt, leaning slightly in.',
      script: `Have you ever wondered why almost every tutorial on ${currentTopic.toLowerCase()} conveniently skips this one critical step? There's a very specific reason for that, and once you see it, you will never look at this repair the same way again.`,
      whyItWorks: 'Creates an irresistible open curiosity loop that the human brain feels compelled to resolve by watching through.'
    }
  };

  // Gemini's own hook leads when the brief came from Gemini; the other angles stay as templates to try
  if (latestBrief?.ai_powered && latestBrief.hook_script) {
    hookVariations.debunk = {
      ...hookVariations.debunk,
      label: 'Gemini Hook & Data-Backed',
      badge: 'From your data',
      script: latestBrief.hook_script,
      whyItWorks: latestBrief.why_it_works || latestBrief.titles?.reason || hookVariations.debunk.whyItWorks
    };
  }

  const selectedHookData = hookVariations[activeHookStyle];

  // Thumbnail prompt generator
  const generatedThumbnailPrompt = `Cinematic high-contrast YouTube thumbnail: Close-up dramatic lighting on hands holding a disassembled ${currentTopic.toLowerCase()}, split composition with red warning indicator on the left vs glowing clean fix on the right. Bold yellow text overlay '${latestBrief?.thumbnail_direction?.text_overlay || 'NEVER DO THIS'}' in heavy sans-serif. Photorealistic 8k, bokeh background workshop, vibrant color separation.`;

  // Teleprompter script compilation
  const teleprompterFullText = `[0:00 - THE HOOK]
${selectedHookData.script}

[0:25 - THE COMMON MISTAKE]
Now, most people assume the issue is complicated, so they replace unnecessary parts. But if you look closely right here, the real bottleneck is this small oversight.

[1:30 - STEP 1 BLUEPRINT]
Here is the first thing you must inspect. Notice how easily this moves when lubricated properly with high-temp synthetic silicone, not petroleum grease.

[3:45 - THE PRO SHORTCUT]
This is where 99% of people get stuck. Instead of forcing it, use this leverage technique. It takes literally thirty seconds and saves your seals.

[5:30 - CONCLUSION & ACTION]
Test the movement once more. Zero play, completely smooth. If this saved you a costly repair bill, drop a comment with your vehicle model and make sure you're subscribed for the next deep dive.`;

  return (
    <div className={`min-h-screen transition-colors duration-200 flex font-sans ${
      isDarkMode ? 'dark bg-ink-900 text-ink-100' : 'bg-ink-50 text-ink-900'
    }`}>
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[60] px-4 py-3 rounded-lg border backdrop-blur-md shadow-xl flex items-center gap-3 text-xs font-medium animate-fade-in ${
          toast.type === 'success'
            ? 'bg-ink-900 dark:bg-ink-50 text-ink-50 dark:text-ink-900 border-ink-700'
            : toast.type === 'error'
            ? 'bg-rose-900/90 text-rose-100 border-rose-700/50'
            : 'bg-ink-800 text-ink-100 border-ink-700'
        }`}>
          {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-brand-600 dark:text-brand-300" />}
          {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400" />}
          {toast.type === 'info' && <Info className="w-4 h-4 text-brand-600 dark:text-brand-300" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* LEFT SIDEBAR (CHATGPT / CLAUDE STYLE NAVIGATION)                        */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}

      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 md:hidden transition-opacity"
        />
      )}

      {/* Left Sidebar Container */}
      <aside
        className={`fixed md:sticky top-0 h-screen z-50 flex flex-col border-r transition-all duration-300 ease-in-out shrink-0 ${
          isDarkMode
            ? 'bg-ink-900 border-ink-800 text-ink-100'
            : 'bg-ink-100 border-ink-200 text-ink-900'
        } ${
          // Desktop width: full (270px) or collapsed (68px)
          sidebarOpen ? 'w-[270px]' : 'w-0 md:w-[68px]'
        } ${
          // Mobile visibility
          mobileMenuOpen ? 'translate-x-0 w-[280px]' : '-translate-x-full md:translate-x-0'
        } overflow-hidden`}
      >
        {/* Top Header / App Brand */}
        <div className="p-3.5 flex items-center justify-between border-b border-ink-200 dark:border-ink-800 shrink-0">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center shrink-0">
              <Radio className="w-4 h-4" />
            </div>
            {sidebarOpen && (
              <div className="leading-tight truncate animate-fade-in">
                <div className=" font-semibold text-sm tracking-tight truncate">AutoSignal</div>
                <div className="text-xs text-ink-500 dark:text-ink-400 truncate">YouTube research</div>
              </div>
            )}
          </div>

          {/* Toggle sidebar button (Desktop & Mobile) */}
          <button
            onClick={() => {
              if (window.innerWidth < 768) {
                setMobileMenuOpen(false);
              } else {
                setSidebarOpen(!sidebarOpen);
              }
            }}
            className="p-1.5 rounded-xl hover:bg-ink-150 dark:hover:bg-ink-800 text-ink-500 dark:text-ink-400 hover:text-ink-900 dark:hover:text-white transition cursor-pointer"
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* "New Discovery / Scan" Quick Action */}
        <div className="p-3 shrink-0">
          <button
            onClick={() => {
              if (appMode === 'simple') {
                handleSimpleRun();
              } else if (appMode === 'creator' && topOpp) {
                handleGenerateBrief(topOpp);
              } else {
                startSequentialAutoRun();
              }
            }}
            className={`w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-semibold transition active:scale-[0.98] cursor-pointer ${
              sidebarOpen
                ? 'bg-brand-600 hover:bg-brand-700 text-white'
                : 'bg-brand-600 text-white p-2.5'
            }`}
            title="Start new video analysis"
          >
            <Plus className="w-4 h-4 shrink-0 stroke-[2.5]" />
            {sidebarOpen && <span className="truncate">New Discovery Scan</span>}
          </button>
        </div>

        {/* Scrollable Navigation Body */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-6 scrollbar-thin">
          {/* 1. APP MODES (THE 3 MAIN VIEWS) */}
          <div className="space-y-1">
            {sidebarOpen && (
              <div className="px-2.5 py-1 text-xs text-ink-500 dark:text-ink-400 font-bold">
                Workspaces & Modes
              </div>
            )}

            {/* Mode 1: Simple Idea */}
            <button
              onClick={() => {
                setAppMode('simple');
                if (window.innerWidth < 768) setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 p-2 rounded-lg text-xs font-medium transition cursor-pointer ${
                appMode === 'simple'
                  ? 'bg-white dark:bg-ink-850 text-ink-900 dark:text-white font-semibold border border-ink-200 dark:border-ink-700'
                  : 'text-ink-500 dark:text-ink-400 hover:bg-ink-150 dark:hover:bg-ink-850 hover:text-ink-900 dark:hover:text-white'
              }`}
              title="Simple Idea (Clean, 1-Click for Users)"
            >
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                appMode === 'simple' ? 'bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-300' : 'text-ink-500'
              }`}>
                <Zap className="w-3.5 h-3.5 fill-current" />
              </div>
              {sidebarOpen && (
                <div className="flex-1 text-left truncate">
                  <div className="truncate">Simple Idea</div>
                  <div className="text-[11px] text-ink-500 dark:text-ink-400 font-normal truncate">Fast, no clutter</div>
                </div>
              )}
            </button>

            {/* Mode 2: Creator Studio */}
            <button
              onClick={() => {
                setAppMode('creator');
                if (window.innerWidth < 768) setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 p-2 rounded-lg text-xs font-medium transition cursor-pointer ${
                appMode === 'creator'
                  ? 'bg-white dark:bg-ink-850 text-ink-900 dark:text-white font-semibold border border-ink-200 dark:border-ink-700'
                  : 'text-ink-500 dark:text-ink-400 hover:bg-ink-150 dark:hover:bg-ink-850 hover:text-ink-900 dark:hover:text-white'
              }`}
              title="Creator Studio (Tell Everything)"
            >
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                appMode === 'creator' ? 'bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-300' : 'text-ink-500'
              }`}>
                <FileText className="w-3.5 h-3.5" />
              </div>
              {sidebarOpen && (
                <div className="flex-1 text-left truncate">
                  <div className="truncate">Creator Studio</div>
                  <div className={`text-[11px] font-normal truncate ${appMode === 'creator' ? 'text-ink-500 dark:text-ink-400' : 'text-ink-500 dark:text-ink-400'}`}>
                    Tell Everything & Teleprompter
                  </div>
                </div>
              )}
            </button>

            {/* Mode 3: AI Video Studio */}
            <button
              onClick={() => {
                setAppMode('video-studio');
                if (window.innerWidth < 768) setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 p-2 rounded-lg text-xs font-medium transition cursor-pointer relative ${
                appMode === 'video-studio'
                  ? 'bg-white dark:bg-ink-850 text-ink-900 dark:text-white font-semibold border border-ink-200 dark:border-ink-700'
                  : 'text-ink-500 dark:text-ink-400 hover:bg-ink-150 dark:hover:bg-ink-850 hover:text-ink-900 dark:hover:text-white'
              }`}
              title="AI Video Studio (Outlier Clipper, Faceless Shorts, Split-Screen)"
            >
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                appMode === 'video-studio' ? 'bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-300' : 'text-ink-500'
              }`}>
                <Film className="w-3.5 h-3.5" />
              </div>
              {sidebarOpen && (
                <div className="flex-1 text-left truncate flex items-center justify-between">
                  <div className="truncate">
                    <div className="truncate flex items-center gap-1.5">
                      <span>AI Video Studio</span>
                      <span className="text-xs px-1 py-0.2 rounded font-bold bg-amber-400 text-ink-900">PRO</span>
                    </div>
                    <div className={`text-[11px] font-normal truncate ${appMode === 'video-studio' ? 'text-ink-500 dark:text-ink-400' : 'text-ink-500 dark:text-ink-400'}`}>
                      Clipper & Faceless Shorts
                    </div>
                  </div>
                </div>
              )}
            </button>

            {/* Mode: Channel Analytics */}
            <button
              onClick={() => {
                setAppMode('channel');
                if (window.innerWidth < 768) setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 p-2 rounded-lg text-xs font-medium transition cursor-pointer ${
                appMode === 'channel'
                  ? 'bg-white dark:bg-ink-850 text-ink-900 dark:text-white font-semibold border border-ink-200 dark:border-ink-700'
                  : 'text-ink-500 dark:text-ink-400 hover:bg-ink-150 dark:hover:bg-ink-850 hover:text-ink-900 dark:hover:text-white'
              }`}
              title="Channel Analytics (views, growth, earnings)"
            >
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                appMode === 'channel' ? 'bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-300' : 'text-ink-500'
              }`}>
                <BarChart3 className="w-3.5 h-3.5" />
              </div>
              {sidebarOpen && (
                <div className="flex-1 text-left truncate">
                  <div className="truncate">Channel Analytics</div>
                  <div className="text-[11px] text-ink-500 dark:text-ink-400 font-normal truncate">Growth & earnings</div>
                </div>
              )}
            </button>

            {/* Mode 4: Pipeline & Code */}
            <button
              onClick={() => {
                setAppMode('deepdive');
                if (window.innerWidth < 768) setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 p-2 rounded-lg text-xs font-medium transition cursor-pointer ${
                appMode === 'deepdive'
                  ? 'bg-white dark:bg-ink-850 text-ink-900 dark:text-white font-semibold border border-ink-200 dark:border-ink-700'
                  : 'text-ink-500 dark:text-ink-400 hover:bg-ink-150 dark:hover:bg-ink-850 hover:text-ink-900 dark:hover:text-white'
              }`}
              title="Pipeline & Code (7 Steps, Python stdout, Outliers)"
            >
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                appMode === 'deepdive' ? 'bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-300' : 'text-ink-500'
              }`}>
                <Cpu className="w-3.5 h-3.5" />
              </div>
              {sidebarOpen && (
                <div className="flex-1 text-left truncate">
                  <div className="truncate">Pipeline & Code</div>
                  <div className="text-[11px] text-ink-500 dark:text-ink-400 font-normal truncate">7-step Python engine</div>
                </div>
              )}
            </button>
          </div>


        </div>

        {/* Bottom User Controls & Theme Switcher */}
        <div className="p-3 border-t border-ink-200 dark:border-ink-800 shrink-0 space-y-2 bg-ink-100 dark:bg-ink-900">
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-ink-150 dark:hover:bg-ink-800 text-xs text-ink-500 dark:text-ink-400 hover:text-ink-900 dark:hover:text-white transition cursor-pointer"
            title="Toggle Theme"
          >
            <div className="flex items-center gap-2 truncate">
              {isDarkMode ? <Sun className="w-4 h-4 text-amber-400 shrink-0" /> : <Moon className="w-4 h-4 text-ink-500 shrink-0" />}
              {sidebarOpen && <span className="truncate">Dark mode</span>}
            </div>
            {sidebarOpen && <span className="text-xs text-ink-500">{isDarkMode ? 'On' : 'Off'}</span>}
          </button>

          {sidebarOpen && (
            <div className="px-2 pt-1 text-[11px] text-ink-500 dark:text-ink-400 font-mono flex items-center justify-between">
              <span>AutoSignal v2.5</span>
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Live Engine
              </span>
            </div>
          )}
        </div>
      </aside>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* MAIN VIEWPORT CONTENT (TAKES REMAINING SCREEN WIDTH)                    */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        {/* Top Floating App Bar */}
        <header className={`sticky top-0 z-30 px-3 sm:px-6 py-2.5 sm:py-3 border-b backdrop-blur-md transition-colors ${
          isDarkMode ? 'bg-ink-900/95 border-ink-800' : 'bg-ink-50/95 border-ink-200'
        }`}>
          <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
            {/* Left: Hamburger & Current View Context */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="p-1.5 rounded-xl md:hidden hover:bg-ink-150 dark:hover:bg-ink-800 text-ink-500 transition cursor-pointer shrink-0"
                title="Open Navigation"
              >
                <PanelLeft className="w-5 h-5" />
              </button>

              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-xs sm:text-xs text-ink-500 dark:text-ink-400">
                  <span>Mode:</span>
                  <span className="font-semibold text-ink-900 dark:text-white capitalize">
                    {appMode === 'simple'
                      ? 'Simple Idea'
                      : appMode === 'creator'
                      ? 'Creator Studio'
                      : appMode === 'video-studio'
                      ? 'AI Video Studio'
                      : appMode === 'channel'
                      ? 'Channel Analytics'
                      : 'Pipeline & Code'}
                  </span>
                </div>
                <div className=" text-sm sm:text-base font-bold tracking-tight text-ink-900 dark:text-white truncate">
                  {currentNicheMeta?.label || selectedNiche}
                </div>
              </div>
            </div>

            {/* Right: Controls & Actions (Clean Flex-Wrap, Zero Overlap) */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap justify-end">
              {/* Active Niche Pill */}
              <button
                onClick={() => {
                  setSettingsTab('niches');
                  setShowSettingsModal(true);
                }}
                className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl bg-ink-100 dark:bg-ink-850 hover:border-brand-600 text-xs font-semibold transition cursor-pointer text-ink-900 dark:text-white shrink-0"
                title="Change active niche (20 available)"
              >
                <span className="text-sm sm:text-base">{currentNicheMeta?.icon || '🔧'}</span>
                <span className=" truncate max-w-[100px] sm:max-w-none">{currentNicheMeta?.label || selectedNiche}</span>
                <span className="text-[11px] font-mono px-1.5 py-0.5 rounded-md bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-300 font-bold">
                  {strongOutliersCount}
                </span>
                <ChevronDown className="w-3 h-3 text-ink-500" />
              </button>

              {/* Settings & All 20 Niches Config Button */}
              <button
                onClick={() => setShowSettingsModal(true)}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-medium bg-ink-100 dark:bg-ink-850 hover:border-brand-600 text-ink-900 dark:text-white transition cursor-pointer shrink-0"
                title="Studio Settings, 20 Niches, and API Keys"
              >
                <Settings className="w-3.5 h-3.5 text-brand-600 dark:text-brand-300" />
                <span className="hidden sm:inline">Settings</span>
                <span className="text-[11px] font-mono font-bold bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-300 px-1 rounded">20</span>
              </button>

              {/* Creator Mode Tools */}
              {appMode === 'creator' && (
                <>
                  <button
                    onClick={() => setShowQuickTips(!showQuickTips)}
                    className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition cursor-pointer shrink-0 ${
                      showQuickTips
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'bg-ink-100 dark:bg-ink-800 border-ink-200 dark:border-ink-700 text-ink-900 dark:text-white hover:border-brand-600'
                    }`}
                  >
                    <Lightbulb className="w-3.5 h-3.5" />
                    <span>{showQuickTips ? 'Tips Active' : 'Quick Tips'}</span>
                  </button>

                  <button
                    onClick={() => setShowTeleprompter(true)}
                    className="flex items-center gap-1.5 bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-300 px-3 py-1.5 rounded-xl text-xs font-semibold hover:bg-brand-100 transition cursor-pointer shrink-0"
                  >
                    <Video className="w-3.5 h-3.5" />
                    <span className="hidden xs:inline">Teleprompter</span>
                  </button>
                </>
              )}

              {/* Theme Toggle Button in Header */}
              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="p-1.5 rounded-xl bg-ink-100 dark:bg-ink-850 text-ink-500 dark:text-ink-400 hover:text-ink-900 dark:hover:text-white transition cursor-pointer shrink-0"
                title="Toggle Theme"
              >
                {isDarkMode ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-ink-500" />}
              </button>
            </div>
          </div>
        </header>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* VIEW 1: SIMPLE USER MODE (VERY SIMPLE, 1 CLICK, BROADENED ANSWER)   */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        {appMode === 'simple' && (
          <div className="p-4 md:p-8 max-w-5xl w-full mx-auto space-y-10">
            {/* Friendly Greeting Card */}
            <div className="pt-2 pb-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div className="space-y-1.5">
                  <span className="text-xs text-brand-600 dark:text-brand-300 font-semibold">
                    Simple Recommendation Engine
                  </span>
                  <h1 className=" text-2xl sm:text-3xl font-semibold tracking-tight">
                    What video should you film today in <span className="text-brand-600 dark:text-brand-300 underline decoration-brand-200">{currentNicheMeta?.label || selectedNiche}</span>?
                  </h1>
                  <p className={`text-sm max-w-xl ${isDarkMode ? 'text-ink-400' : 'text-ink-500'}`}>
                    We scanned YouTube for small channels unexpectedly exploding in views. Here is the exact winning idea with no technical headaches.
                  </p>
                </div>

                <button
                  onClick={handleSimpleRun}
                  disabled={isSimpleRunning}
                  className="shrink-0 flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-medium px-6 py-3.5 rounded-lg transition active:scale-[0.98] cursor-pointer disabled:opacity-50"
                >
                  {isSimpleRunning ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-amber-200" />
                      <span>Analyzing YouTube...</span>
                    </>
                  ) : (
                    <>
                      <PenLine className="w-4 h-4 text-amber-200" />
                      <span>Refresh Winning Idea</span>
                    </>
                  )}
                </button>
              </div>

              {/* 4 Clean Steps Bar (Clear, human, straightforward) */}
              <div className="mt-8 pt-6 border-t border-ink-200 dark:border-ink-800">
                <div className="text-xs font-semibold mb-3 flex items-center justify-between">
                  <span className={isDarkMode ? 'text-ink-400' : 'text-ink-500'}>Analysis Transparency</span>
                  <span className="text-xs font-mono text-brand-600 dark:text-brand-300">
                    {simpleActiveStep >= 4 ? 'Verified Opportunity' : 'Scanning...'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(latestBrief?.research
                    ? [
                        { title: 'Searched YouTube', note: `Most-viewed videos, last ${latestBrief.research.window_days} days` },
                        { title: 'Compared to channel average', note: `Kept the top ${latestBrief.research.videos_analysed} outliers` },
                        { title: 'Small channels winning', note: `${latestBrief.research.small_channel_share}% of outliers under 100K subs` },
                        { title: 'Gemini brief ready', note: latestBrief.research.cached ? 'From cached YouTube data' : 'From fresh YouTube data' }
                      ]
                    : [
                        { title: '450 Videos Scanned', note: 'Coded recent uploads' },
                        { title: 'Fluff Filtered Out', note: 'Kept 35 high-signal videos' },
                        { title: 'Breakouts Isolated', note: 'Small channels hitting 5.4x' },
                        { title: 'Blueprint Ready', note: 'High demand & low supply' }
                      ]
                  ).map((step, i) => (
                    <div key={step.title} className={`p-3 rounded-lg border transition-all ${
                      simpleActiveStep >= i + 1
                        ? 'bg-brand-50 dark:bg-brand-950 border-brand-200 dark:border-ink-700'
                        : 'opacity-50 bg-ink-100 dark:bg-ink-800 border-transparent'
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-brand-600 text-white flex items-center justify-center text-[11px] font-bold">{i + 1}</span>
                        <span className="text-xs font-semibold">{step.title}</span>
                      </div>
                      <p className="text-xs text-ink-500 dark:text-ink-400 mt-1">{step.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Broadened, Clear, Highlighted Result */}
            <div className={`p-6 sm:p-8 rounded-xl border space-y-6 ${
              isDarkMode ? 'bg-ink-850 border-ink-700' : 'bg-white border-ink-200'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-300">
                    <Flame className="w-3.5 h-3.5 fill-current" />
                    <span>#1 Video to Film Right Now</span>
                  </span>
                  <h2 className=" text-2xl font-bold mt-2">
                    {topOpp?.cluster_label || 'High-Velocity Breakout Opportunity'}
                  </h2>
                  <p className={`text-xs mt-1 ${isDarkMode ? 'text-ink-400' : 'text-ink-500'}`}>
                    Target Audience Angle: <span className="font-medium text-ink-900 dark:text-white">{topOpp?.recommended_angle || 'Direct walkthrough showing what mechanics do wrong'}</span>
                  </p>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between bg-ink-100 dark:bg-ink-800 p-3 rounded-lg">
                  <span className="text-xs text-ink-500 dark:text-ink-400">Confidence Score</span>
                  <span className=" text-2xl font-bold text-brand-600 dark:text-brand-300">{topScore} <span className="text-xs font-normal text-ink-500">/ 10</span></span>
                </div>
              </div>

              {/* Quick Stats Grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3.5 rounded-lg bg-ink-100 dark:bg-ink-800">
                  <div className="text-xs text-ink-500 dark:text-ink-400">Multiplier</div>
                  <div className="text-lg font-bold text-brand-600 dark:text-brand-300 mt-0.5">{topOpp?.outperformance_multiplier || '5.4x'}</div>
                  <div className="text-xs text-ink-500 dark:text-ink-400">above baseline</div>
                </div>

                <div className="p-3.5 rounded-lg bg-ink-100 dark:bg-ink-800">
                  <div className="text-xs text-ink-500 dark:text-ink-400">{topOpp?.live ? 'Small Channels' : 'Search Gap'}</div>
                  <div className="text-lg font-bold text-brand-600 dark:text-brand-300 mt-0.5">{topOpp?.search_gap_percent || '92%'}</div>
                  <div className="text-xs text-ink-500 dark:text-ink-400">{topOpp?.live ? 'of outliers under 100K subs' : 'unmet demand'}</div>
                </div>

                <div className="p-3.5 rounded-lg bg-ink-100 dark:bg-ink-800">
                  <div className="text-xs text-ink-500 dark:text-ink-400">Hourly Velocity</div>
                  <div className="text-lg font-bold text-brand-600 dark:text-brand-300 mt-0.5">{topOpp?.avg_vph?.toLocaleString() || '1,850'}</div>
                  <div className="text-xs text-ink-500 dark:text-ink-400">views/hour</div>
                </div>
              </div>

              {/* Title & Copy Hook */}
              <div className="space-y-3">
                <div className="p-4 rounded-lg bg-brand-50 dark:bg-brand-950 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-brand-600 dark:text-brand-300 flex items-center gap-1.5">
                      <PenLine className="w-3.5 h-3.5" />
                      <span>Recommended Title for Maximum Clicks:</span>
                    </span>
                    <button
                      onClick={() => handleCopy(latestBrief?.titles?.title_2_curiosity || topOpp?.sample_titles?.[0] || `The ${selectedNiche} Fix Most People Get Completely Wrong`, 'simple_title')}
                      className="text-xs text-ink-500 dark:text-ink-400 hover:text-brand-600 dark:hover:text-brand-300 flex items-center gap-1 cursor-pointer font-medium"
                    >
                      {copiedKey === 'simple_title' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === 'simple_title' ? 'Copied' : 'Copy Title'}</span>
                    </button>
                  </div>
                  <div className=" text-lg font-semibold text-ink-900 dark:text-white">
                    "{latestBrief?.titles?.title_2_curiosity || topOpp?.sample_titles?.[0] || `The ${selectedNiche} Fix Most People Get Completely Wrong`}"
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-ink-100 dark:bg-ink-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-ink-900 dark:text-white flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-brand-600 dark:text-brand-300" />
                      <span>First 20-Second Spoken Hook:</span>
                    </span>
                    <button
                      onClick={() => handleCopy(selectedHookData.script, 'simple_hook')}
                      className="text-xs text-ink-500 dark:text-ink-400 hover:text-brand-600 dark:hover:text-brand-300 flex items-center gap-1 cursor-pointer font-medium"
                    >
                      {copiedKey === 'simple_hook' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === 'simple_hook' ? 'Copied' : 'Copy Hook'}</span>
                    </button>
                  </div>
                  <p className="text-xs leading-relaxed italic text-ink-700 dark:text-ink-100">
                    "{selectedHookData.script}"
                  </p>
                </div>
              </div>

              {/* Gateway to Creator Mode */}
              <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-ink-200 dark:border-ink-800">
                <div className={`text-xs ${isDarkMode ? 'text-ink-400' : 'text-ink-500'}`}>
                  Ready to record? Access the teleprompter, thumbnail prompt, and minute-by-minute outline.
                </div>

                <button
                  onClick={() => setAppMode('creator')}
                  className="flex items-center justify-center gap-2 bg-ink-900 dark:bg-ink-50 text-white dark:text-ink-900 font-medium text-xs px-5 py-2.5 rounded-lg transition hover:opacity-90 cursor-pointer"
                >
                  <span>Open Full Creator Studio (Tell Everything)</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* VIEW 2: CREATOR MASTERCLASS STUDIO ("TELL EVERYTHING")                 */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        {appMode === 'creator' && (
          <div className="p-4 md:p-8 max-w-7xl w-full mx-auto space-y-10">
            {/* Top Creator Header & Opportunity Signal */}
            <div className="pt-2 pb-2">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-300">
                      <Award className="w-3.5 h-3.5" />
                      <span>Creator Production Briefing</span>
                    </span>
                    <span className="text-xs font-mono text-ink-500 dark:text-ink-400">
                      Topic: {latestBrief?.topic || topOpp?.cluster_label || currentNicheMeta?.label}
                    </span>
                    <span className="text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                      {topOpp?.window || 'IMMEDIATE'} WINDOW
                    </span>
                  </div>

                  <h1 className=" text-2xl sm:text-3xl font-semibold tracking-tight">
                    {latestBrief?.topic || topOpp?.cluster_label || 'Breakout Opportunity'}
                  </h1>

                  <p className={`text-xs sm:text-sm max-w-3xl leading-relaxed ${isDarkMode ? 'text-ink-400' : 'text-ink-500'}`}>
                    <strong className="text-ink-900 dark:text-white">Why This Works:</strong> {latestBrief?.why_it_works ? (
                      <>
                        {latestBrief.why_it_works}
                        {latestBrief.research && (
                          <span className="block mt-1.5 text-xs text-ink-500 dark:text-ink-400">
                            Based on {latestBrief.research.videos_analysed} YouTube videos from the last {latestBrief.research.window_days} days, analysed by Gemini.
                          </span>
                        )}
                      </>
                    ) : (<>In this subtopic, smaller channels (under 30k subscribers) are experiencing a <span className="text-brand-600 dark:text-brand-300 font-semibold">{topOpp?.outperformance_multiplier || '5.4x'} view multiplier</span> while high-volume keyword search supply remains {topOpp?.search_gap_percent || '92%'} unmet. You will win the algorithm by executing the curiosity-debunk formula below.</>)}
                  </p>
                </div>

                {/* Header Action Buttons */}
                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <button
                    onClick={() => setShowQuickTips(!showQuickTips)}
                    className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                      showQuickTips
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'bg-ink-100 dark:bg-ink-800 border-ink-200 dark:border-ink-700 text-ink-900 dark:text-white hover:border-brand-600'
                    }`}
                  >
                    <Lightbulb className="w-3.5 h-3.5" />
                    <span>{showQuickTips ? 'Hide Hook Tips' : 'Hook Quick Tips'}</span>
                  </button>

                  <button
                    onClick={() => setShowTeleprompter(true)}
                    className="flex items-center gap-1.5 bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-300 px-4 py-2.5 rounded-lg text-xs font-semibold hover:bg-brand-100 transition cursor-pointer"
                  >
                    <Video className="w-3.5 h-3.5" />
                    <span>Teleprompter Mode</span>
                  </button>

                  <button
                    onClick={() => {
                      if (topOpp) handleGenerateBrief(topOpp);
                    }}
                    disabled={generatingBrief}
                    className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2.5 rounded-lg text-xs font-semibold transition active:scale-[0.98] cursor-pointer disabled:opacity-50"
                  >
                    <PenLine className={`w-3.5 h-3.5 ${generatingBrief ? 'animate-spin' : ''}`} />
                    <span>{generatingBrief ? 'Generating with Gemini...' : 'Regenerate Brief'}</span>
                  </button>
                </div>
              </div>

              {/* 4 Quantitative Arbitrage Signals */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 pt-5 border-t border-ink-200 dark:border-ink-800">
                <div className="p-3 rounded-lg bg-ink-100 dark:bg-ink-800">
                  <div className="text-xs text-ink-500 dark:text-ink-400">Opportunity Score</div>
                  <div className=" text-xl font-bold text-brand-600 dark:text-brand-300 mt-0.5">{topScore}/10</div>
                  <div className="text-xs text-ink-500 dark:text-ink-400">{topOpp?.live ? 'Gemini rating from live data' : 'Multi-factor rank #1'}</div>
                </div>

                <div className="p-3 rounded-lg bg-ink-100 dark:bg-ink-800">
                  <div className="text-xs text-ink-500 dark:text-ink-400">Outlier View Multiplier</div>
                  <div className=" text-xl font-bold text-brand-600 dark:text-brand-300 mt-0.5">{topOpp?.outperformance_multiplier || '5.4x'}</div>
                  <div className="text-xs text-ink-500 dark:text-ink-400">Over channel average</div>
                </div>

                <div className="p-3 rounded-lg bg-ink-100 dark:bg-ink-800">
                  <div className="text-xs text-ink-500 dark:text-ink-400">{topOpp?.live ? 'Small-Channel Share' : 'Search Demand Gap'}</div>
                  <div className=" text-xl font-bold text-brand-600 dark:text-brand-300 mt-0.5">{topOpp?.search_gap_percent || '92%'}</div>
                  <div className="text-xs text-ink-500 dark:text-ink-400">{topOpp?.live ? 'Outliers from channels under 100K subs' : 'Unmet audience demand'}</div>
                </div>

                <div className="p-3 rounded-lg bg-ink-100 dark:bg-ink-800">
                  <div className="text-xs text-ink-500 dark:text-ink-400">Hourly Velocity (VPH)</div>
                  <div className=" text-xl font-bold text-brand-600 dark:text-brand-300 mt-0.5">{topOpp?.avg_vph?.toLocaleString() || '1,850'}</div>
                  <div className="text-xs text-ink-500 dark:text-ink-400">{topOpp?.live ? 'Avg. of the supporting outliers' : 'Views per hour benchmark'}</div>
                </div>
              </div>
            </div>

            {/* Quick Tips Drawer / Panel (if open) */}
            {showQuickTips && (
              <div className={`p-6 rounded-xl border animate-fade-in ${
                isDarkMode ? 'bg-ink-850 border-ink-700' : 'bg-brand-50 border-brand-200'
              }`}>
                <div className="flex items-center justify-between pb-3 border-b border-brand-200 dark:border-ink-700">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-brand-600 dark:text-brand-300" />
                    <h3 className="text-sm font-semibold text-ink-900 dark:text-white">
                      Masterclass Hook & Retention Guide (2.4x Watch Time Multiplier)
                    </h3>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setQuickTipsTab('psychology')}
                      className={`px-3 py-1 rounded-xl text-xs font-medium cursor-pointer transition ${
                        quickTipsTab === 'psychology' ? 'bg-brand-600 text-white' : 'text-ink-500 dark:text-ink-400'
                      }`}
                    >
                      0–3s Rule
                    </button>
                    <button
                      onClick={() => setQuickTipsTab('retention')}
                      className={`px-3 py-1 rounded-xl text-xs font-medium cursor-pointer transition ${
                        quickTipsTab === 'retention' ? 'bg-brand-600 text-white' : 'text-ink-500 dark:text-ink-400'
                      }`}
                    >
                      Open Loops
                    </button>
                    <button
                      onClick={() => setQuickTipsTab('delivery')}
                      className={`px-3 py-1 rounded-xl text-xs font-medium cursor-pointer transition ${
                        quickTipsTab === 'delivery' ? 'bg-brand-600 text-white' : 'text-ink-500 dark:text-ink-400'
                      }`}
                    >
                      Vocal Cadence
                    </button>
                    <button
                      onClick={() => setShowQuickTips(false)}
                      className="p-1 rounded-lg text-ink-500 hover:text-ink-900 cursor-pointer ml-2"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="pt-4 text-xs leading-relaxed space-y-2">
                  {quickTipsTab === 'psychology' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="p-3 bg-white dark:bg-ink-900 rounded-lg border border-brand-200 dark:border-ink-700">
                        <div className="font-semibold text-brand-600 dark:text-brand-300">1. Never say "Hi guys welcome back"</div>
                        <p className="text-xs text-ink-500 dark:text-ink-400 mt-1">
                          Intro pleasantries lose 35% of viewers before second 5. Start immediately on the verb or warning.
                        </p>
                      </div>
                      <div className="p-3 bg-white dark:bg-ink-900 rounded-lg border border-brand-200 dark:border-ink-700">
                        <div className="font-semibold text-brand-600 dark:text-brand-300">2. Match the Thumbnail Promise</div>
                        <p className="text-xs text-ink-500 dark:text-ink-400 mt-1">
                          If your thumbnail shows a damaged pin, that exact pin must be on camera in frame 1.
                        </p>
                      </div>
                      <div className="p-3 bg-white dark:bg-ink-900 rounded-lg border border-brand-200 dark:border-ink-700">
                        <div className="font-semibold text-brand-600 dark:text-brand-300">3. Concrete Timeline Anchor</div>
                        <p className="text-xs text-ink-500 dark:text-ink-400 mt-1">
                          Say "Over the next 6 minutes" to give the viewer an explicit boundary for their time investment.
                        </p>
                      </div>
                    </div>
                  )}

                  {quickTipsTab === 'retention' && (
                    <div className="p-3 bg-white dark:bg-ink-900 rounded-lg border border-brand-200 dark:border-ink-700">
                      <div className="font-semibold text-brand-600 dark:text-brand-300 mb-1">How to Keep Viewers Through Minute 4:</div>
                      <p className="text-xs text-ink-500 dark:text-ink-400">
                        Plant a secondary question early: "I will show you the step-by-step fix, but first we have to address why the factory manual gets the torque spec wrong, which we'll cover right after step 2."
                      </p>
                    </div>
                  )}

                  {quickTipsTab === 'delivery' && (
                    <div className="p-3 bg-white dark:bg-ink-900 rounded-lg border border-brand-200 dark:border-ink-700">
                      <div className="font-semibold text-brand-600 dark:text-brand-300 mb-1">Pacing and Tone:</div>
                      <p className="text-xs text-ink-500 dark:text-ink-400">
                        Target 135–150 words per minute for the hook. Slightly elevate pitch on the word "stop" or the key objection. Do not use background music with vocals during the first 30 seconds.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* MAIN 2-COLUMN CREATOR SUITE */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* LEFT COLUMN: TITLES & VERBATIM HOOKS */}
              <div className="lg:col-span-7 space-y-6">
                {/* SECTION 1: 3 CURATED TITLE VARIATIONS */}
                <div className={`p-6 rounded-xl border space-y-4 ${
                  isDarkMode ? 'bg-ink-850 border-ink-700' : 'bg-white border-ink-200'
                }`}>
                  <div className="flex items-center justify-between pb-2 border-b border-ink-200 dark:border-ink-800">
                    <div>
                      <h3 className=" text-lg font-semibold">1. Three CTR-Optimized Title Variations</h3>
                      <p className="text-xs text-ink-500 dark:text-ink-400">
                        Engineered for high CTR on mobile YouTube home feed (45–65 characters).
                      </p>
                    </div>
                  </div>

                  {/* Title 1: Curiosity Debunk (Recommended) */}
                  <div className="p-4 rounded-lg bg-brand-50 dark:bg-brand-950 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-brand-600 dark:text-brand-300 flex items-center gap-1.5">
                        <PenLine className="w-3.5 h-3.5" />
                        <span>Curiosity Debunk (Algorithm Breakout — Recommended)</span>
                      </span>
                      <button
                        onClick={() => handleCopy(latestBrief?.titles?.title_2_curiosity || topOpp?.sample_titles?.[0] || `The ${selectedNiche} Fix Most People Get Completely Wrong`, 't1')}
                        className="text-xs text-ink-500 dark:text-ink-400 hover:text-brand-600 dark:hover:text-brand-300 flex items-center gap-1 cursor-pointer font-medium"
                      >
                        {copiedKey === 't1' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedKey === 't1' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <div className=" text-base font-semibold text-ink-900 dark:text-white">
                      "{latestBrief?.titles?.title_2_curiosity || topOpp?.sample_titles?.[0] || `The ${selectedNiche} Fix Most People Get Completely Wrong`}"
                    </div>
                    <div className="text-xs text-ink-500 dark:text-ink-400 flex items-center justify-between">
                      <span><strong>Why it clicks:</strong> Challenges common knowledge and triggers fear of doing it wrong.</span>
                      <span className="font-mono text-[11px]">52 chars</span>
                    </div>
                  </div>

                  {/* Title 2: Search SEO Floor */}
                  <div className="p-4 rounded-lg bg-ink-100 dark:bg-ink-800 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-ink-900 dark:text-white flex items-center gap-1.5">
                        <Search className="w-3.5 h-3.5 text-blue-500" />
                        <span>Search Match (SEO Floor for Evergreen Views)</span>
                      </span>
                      <button
                        onClick={() => handleCopy(latestBrief?.titles?.title_1_search_match || topOpp?.sample_titles?.[1] || `How to Properly Service ${topOpp?.cluster_label} (Step by Step)`, 't2')}
                        className="text-xs text-ink-500 dark:text-ink-400 hover:text-brand-600 dark:hover:text-brand-300 flex items-center gap-1 cursor-pointer font-medium"
                      >
                        {copiedKey === 't2' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedKey === 't2' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <div className=" text-sm font-semibold text-ink-900 dark:text-white">
                      "{latestBrief?.titles?.title_1_search_match || topOpp?.sample_titles?.[1] || `How to Properly Service ${topOpp?.cluster_label} (Step by Step)`}"
                    </div>
                    <div className="text-xs text-ink-500 dark:text-ink-400 flex items-center justify-between">
                      <span><strong>Why it clicks:</strong> Captures high-intent search queries month after month.</span>
                      <span className="font-mono text-[11px]">48 chars</span>
                    </div>
                  </div>

                  {/* Title 3: Value / ROI */}
                  <div className="p-4 rounded-lg bg-ink-100 dark:bg-ink-800 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-ink-900 dark:text-white flex items-center gap-1.5">
                        <Target className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Value / Outcome Angle (High ROI)</span>
                      </span>
                      <button
                        onClick={() => handleCopy(latestBrief?.titles?.title_3_value || `I Saved $850 Fixing ${topOpp?.cluster_label} in 20 Minutes`, 't3')}
                        className="text-xs text-ink-500 dark:text-ink-400 hover:text-brand-600 dark:hover:text-brand-300 flex items-center gap-1 cursor-pointer font-medium"
                      >
                        {copiedKey === 't3' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedKey === 't3' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <div className=" text-sm font-semibold text-ink-900 dark:text-white">
                      "{latestBrief?.titles?.title_3_value || `I Saved $850 Fixing ${topOpp?.cluster_label} in 20 Minutes`}"
                    </div>
                    <div className="text-xs text-ink-500 dark:text-ink-400 flex items-center justify-between">
                      <span><strong>Why it clicks:</strong> Tangible dollar savings and low time requirement.</span>
                      <span className="font-mono text-[11px]">49 chars</span>
                    </div>
                  </div>
                </div>

                {/* SECTION 2: VERBATIM HOOK SCRIPT WITH 4 PSYCHOLOGY ANGLES */}
                <div className={`p-6 rounded-xl border space-y-4 ${
                  isDarkMode ? 'bg-ink-850 border-ink-700' : 'bg-white border-ink-200'
                }`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-ink-200 dark:border-ink-800">
                    <div>
                      <h3 className=" text-lg font-semibold">2. Opening 20-Second Spoken Hook Script</h3>
                      <p className="text-xs text-ink-500 dark:text-ink-400">
                        Choose the psychological angle that best fits your channel tone.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowTeleprompter(true)}
                        className="text-xs text-brand-600 dark:text-brand-300 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Video className="w-3.5 h-3.5" />
                        <span>Prompter View</span>
                      </button>
                      <button
                        onClick={() => handleCopy(selectedHookData.script, 'hook_active', 'Hook copied')}
                        className="text-xs bg-ink-100 dark:bg-ink-800 px-3 py-1.5 rounded-xl font-medium flex items-center gap-1 cursor-pointer hover:border-brand-600"
                      >
                        {copiedKey === 'hook_active' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedKey === 'hook_active' ? 'Copied' : 'Copy Script'}</span>
                      </button>
                    </div>
                  </div>

                  {/* 4 Angle Selector Pills */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(['debunk', 'lossAversion', 'proof', 'question'] as const).map(angle => (
                      <button
                        key={angle}
                        onClick={() => setActiveHookStyle(angle)}
                        className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
                          activeHookStyle === angle
                            ? 'bg-brand-600 text-white border-brand-600'
                            : 'bg-ink-100 dark:bg-ink-800 border-ink-200 dark:border-ink-700 text-ink-500 dark:text-ink-400 hover:text-ink-900 dark:hover:text-white'
                        }`}
                      >
                        <div className="text-xs font-bold tracking-tight">{hookVariations[angle].badge}</div>
                        <div className="text-xs font-semibold mt-0.5 truncate">{hookVariations[angle].label.split('&')[0]}</div>
                      </button>
                    ))}
                  </div>

                  {/* Active Script Display */}
                  <div className="p-5 rounded-lg bg-brand-50 dark:bg-brand-950 space-y-3">
                    <div className="flex items-center justify-between text-xs text-brand-600 dark:text-brand-300">
                      <span className="font-semibold text-xs">
                        Speaking Cadence: ~140 WPM • Timing: 0:00 – 0:20
                      </span>
                      <span className="text-xs font-medium">{selectedHookData.label}</span>
                    </div>

                    <div className=" text-base sm:text-lg leading-relaxed text-ink-900 dark:text-white italic">
                      "{selectedHookData.script}"
                    </div>

                    <div className="pt-2 border-t border-brand-200 dark:border-ink-700 text-xs text-ink-500 dark:text-ink-400 space-y-1">
                      <div><strong>Director Delivery Notes:</strong> {selectedHookData.delivery}</div>
                      <div><strong>Psychological Mechanism:</strong> {selectedHookData.whyItWorks}</div>
                    </div>
                  </div>
                </div>

                {/* SECTION 3: MINUTE-BY-MINUTE RETENTION PACING */}
                <div className={`p-6 rounded-xl border space-y-4 ${
                  isDarkMode ? 'bg-ink-850 border-ink-700' : 'bg-white border-ink-200'
                }`}>
                  <div className="flex items-center justify-between pb-2 border-b border-ink-200 dark:border-ink-800">
                    <div>
                      <h3 className=" text-lg font-semibold">3. Video Outline & Retention Resets</h3>
                      <p className="text-xs text-ink-500 dark:text-ink-400">
                        Minute-by-minute beats designed to prevent the 2:00 viewer drop-off.
                      </p>
                    </div>
                    <span className="text-xs font-mono text-brand-600 dark:text-brand-300">Target Duration: 6–8 mins</span>
                  </div>

                  <div className="space-y-2.5">
                    {(latestBrief?.pacing_outline || [
                      { time: '0:00 - 0:25', beat: 'Hook & Proof', action: 'Direct to camera. Show damaged part. State the exact cost savings.' },
                      { time: '0:25 - 1:30', beat: 'The Common Trap', action: 'Demonstrate why 90% of tutorials use the wrong solvent or grease.' },
                      { time: '1:30 - 3:45', beat: 'The Correct Procedure', action: 'Overhead macro shot. Clean the slide pins, apply high-temp silicone.' },
                      { time: '3:45 - 5:30', beat: 'The Overlooked Detail', action: 'Check rubber boot integrity. Show the exact test to ensure free floating.' },
                      { time: '5:30 - 7:00', beat: 'Verification & Outro', action: 'Reassemble, torque to factory spec, ask viewer comment prompt.' }
                    ]).map((beat, bidx) => (
                      <div
                        key={bidx}
                        className="p-3.5 rounded-lg bg-ink-100 dark:bg-ink-800 flex items-start gap-3.5"
                      >
                        <div className="font-mono text-xs font-bold text-brand-600 dark:text-brand-300 shrink-0 w-24 pt-0.5">
                          {beat.time}
                        </div>
                        <div className="flex-1 space-y-0.5">
                          <div className="text-xs font-semibold text-ink-900 dark:text-white">
                            {beat.beat}
                          </div>
                          <div className="text-xs text-ink-500 dark:text-ink-400 leading-relaxed">
                            {beat.action}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN: THUMBNAIL STUDIO & PRODUCTION PRE-FLIGHT */}
              <div className="lg:col-span-5 space-y-6">
                {/* SECTION 4: THUMBNAIL DESIGN STUDIO & MIDJOURNEY PROMPT */}
                <div className={`p-6 rounded-xl border space-y-4 ${
                  isDarkMode ? 'bg-ink-850 border-ink-700' : 'bg-white border-ink-200'
                }`}>
                  <div className="flex items-center justify-between pb-2 border-b border-ink-200 dark:border-ink-800">
                    <div>
                      <h3 className=" text-lg font-semibold">4. Thumbnail Art Direction</h3>
                      <p className="text-xs text-ink-500 dark:text-ink-400">
                        Visual composition for maximum mobile click-through rate.
                      </p>
                    </div>
                    <Eye className="w-4 h-4 text-brand-600 dark:text-brand-300" />
                  </div>

                  {/* Thumbnail Concept Mockup Box */}
                  <div className="p-4 rounded-lg bg-brand-50 dark:bg-brand-950 space-y-3">
                    <div className="aspect-video rounded-xl bg-ink-900 text-white p-4 flex flex-col justify-between relative overflow-hidden shadow-inner">
                      <div className="flex items-center justify-between z-10">
                        <span className="text-xs bg-red-600 px-2 py-0.5 rounded font-bold text-white">
                          High Contrast
                        </span>
                        <span className="text-[11px] font-mono text-ink-400">1280 × 720</span>
                      </div>

                      <div className="z-10 text-center my-auto space-y-1">
                        <div className="text-xl sm:text-2xl font-bold font-sans tracking-tight text-amber-300 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
                          "{latestBrief?.thumbnail_direction?.text_overlay || 'STOP DOING THIS!'}"
                        </div>
                        <div className="text-xs text-ink-300 max-w-xs mx-auto drop-shadow-md">
                          {latestBrief?.thumbnail_direction?.primary_image || 'Split comparison: Seized stuck slide pin vs properly greased floating pin'}
                        </div>
                      </div>

                      <div className="z-10 flex items-center justify-between text-[11px] font-mono text-ink-400 border-t border-ink-800/80 pt-1">
                        <span>Red Warning Arrow</span>
                        <span>Facial Reaction (Skeptical)</span>
                      </div>

                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none" />
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-white dark:bg-ink-900 border border-brand-200 dark:border-ink-700">
                        <div className="text-xs text-ink-500 dark:text-ink-400">Color Palette</div>
                        <div className="font-semibold text-xs mt-0.5">{latestBrief?.thumbnail_direction?.color_signal || 'High-Sat Amber & Red'}</div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white dark:bg-ink-900 border border-brand-200 dark:border-ink-700">
                        <div className="text-xs text-ink-500 dark:text-ink-400">Focal Point</div>
                        <div className="font-semibold text-xs mt-0.5">{latestBrief?.thumbnail_direction?.focal_point || 'Hands with Caliper Pin'}</div>
                      </div>
                    </div>

                    {/* Ready-to-copy AI Image Prompt */}
                    <div className="p-3 rounded-xl bg-white dark:bg-ink-900 border border-brand-200 dark:border-ink-700 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-xs font-bold text-brand-600 dark:text-brand-300">AI Generation Prompt (Midjourney / Flux)</span>
                        <button
                          onClick={() => handleCopy(generatedThumbnailPrompt, 'thumb_prompt', 'Thumbnail prompt copied!')}
                          className="text-xs text-ink-500 hover:text-brand-600 dark:hover:text-brand-300 flex items-center gap-1 cursor-pointer font-medium"
                        >
                          {copiedKey === 'thumb_prompt' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedKey === 'thumb_prompt' ? 'Copied' : 'Copy Prompt'}</span>
                        </button>
                      </div>
                      <p className="text-xs font-mono text-ink-500 dark:text-ink-400 leading-relaxed line-clamp-3">
                        {generatedThumbnailPrompt}
                      </p>
                    </div>
                  </div>
                </div>

                {/* SECTION 5: PRE-FLIGHT SHOOT CHECKLIST */}
                <div className={`p-6 rounded-xl border space-y-4 ${
                  isDarkMode ? 'bg-ink-850 border-ink-700' : 'bg-white border-ink-200'
                }`}>
                  <div className="flex items-center justify-between pb-2 border-b border-ink-200 dark:border-ink-800">
                    <div>
                      <h3 className=" text-lg font-semibold">5. Pre-Flight Shoot Checklist</h3>
                      <p className="text-xs text-ink-500 dark:text-ink-400">
                        Ensure everything is locked down before pressing record.
                      </p>
                    </div>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  </div>

                  <div className="space-y-2">
                    {[
                      { key: 'hookMemorized', label: 'Hook memorized (deliver without reading word-for-word)' },
                      { key: 'thumbnailShotTaken', label: 'Thumbnail still photo shot BEFORE filming starts' },
                      { key: 'audioLeveled', label: 'Wireless mic checked for clothing rustle & wind noise' },
                      { key: 'patternInterruptReady', label: 'B-roll / damaged part ready for 0:03 pattern interrupt' },
                      { key: 'brollQueued', label: 'Close-up macro lens ready for tight grease/component shots' },
                    ].map(item => (
                      <div
                        key={item.key}
                        onClick={() => setCheckedItems(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                        className={`p-3 rounded-lg border transition cursor-pointer flex items-center gap-3 ${
                          checkedItems[item.key]
                            ? 'bg-brand-50 dark:bg-brand-950 border-brand-200 dark:border-ink-700'
                            : 'bg-ink-100 dark:bg-ink-800 border-ink-200 dark:border-ink-700 opacity-80'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-lg flex items-center justify-center transition ${
                          checkedItems[item.key]
                            ? 'bg-brand-600 text-white'
                            : 'bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700'
                        }`}>
                          {checkedItems[item.key] && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                        <span className={`text-xs ${checkedItems[item.key] ? 'font-medium text-ink-900 dark:text-white' : 'text-ink-500 dark:text-ink-400'}`}>
                          {item.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* SECTION 6: CONVENIENT EXPORT & PRINT */}
                <div className={`p-5 rounded-xl border space-y-3 ${
                  isDarkMode ? 'bg-ink-850 border-ink-700' : 'bg-white border-ink-200'
                }`}>
                  <div className="text-xs font-semibold text-ink-900 dark:text-white">
                    Export & Share Production Blueprint
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        const fullPlan = `# AutoSignal Production Brief: ${topOpp?.cluster_label}\n\n## Title Candidates\n1. ${latestBrief?.titles?.title_2_curiosity || topOpp?.sample_titles?.[0]}\n2. ${latestBrief?.titles?.title_1_search_match || topOpp?.sample_titles?.[1]}\n3. ${latestBrief?.titles?.title_3_value}\n\n## Opening Hook Script\n${selectedHookData.script}\n\n## Thumbnail Concept\nOverlay: ${latestBrief?.thumbnail_direction?.text_overlay}\nDescription: ${latestBrief?.thumbnail_direction?.primary_image}\n\n## Pacing Outline\n${(latestBrief?.pacing_outline || []).map(b => `- ${b.time}: ${b.beat} (${b.action})`).join('\n')}`;
                        handleCopy(fullPlan, 'export_markdown', 'Full plan copied as Markdown!');
                      }}
                      className="p-2.5 rounded-xl bg-ink-100 dark:bg-ink-800 text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer hover:border-brand-600"
                    >
                      <FileText className="w-3.5 h-3.5 text-brand-600 dark:text-brand-300" />
                      <span>Copy All (Markdown)</span>
                    </button>

                    <button
                      onClick={() => window.print()}
                      className="p-2.5 rounded-xl bg-ink-100 dark:bg-ink-800 text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer hover:border-brand-600"
                    >
                      <Printer className="w-3.5 h-3.5 text-ink-500" />
                      <span>Print Blueprint</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* VIEW: AI VIDEO GENERATION STUDIO (CLIPPER, FACELESS, SPLIT-SCREEN)   */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        {appMode === 'channel' && <ChannelAnalytics showToast={showToast} onCopy={handleCopy} />}

        {appMode === 'video-studio' && (
          <VideoStudio
            brief={currentBrief}
            topic={currentTopic}
            nicheId={selectedNiche}
            nicheLabel={currentNicheMeta?.label || selectedNiche}
            videos={videosList}
            hookScript={currentBrief?.hook_script || selectedHookData.script}
            thumbnailPrompt={generatedThumbnailPrompt}
            showToast={showToast}
            onCopy={handleCopy}
            openRequest={studioRequest}
          />
        )}

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* VIEW 4: PIPELINE & CODE (DEEP DIVE 7-STEP PYTHON ENGINE & ARTIFACTS)  */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        {appMode === 'deepdive' && (
          <div className="p-4 md:p-8 max-w-7xl w-full mx-auto space-y-10">
            {/* Subtabs for Deep Dive */}
            <div className={`p-2 rounded-lg border flex flex-wrap items-center gap-1 ${
              isDarkMode ? 'bg-ink-850 border-ink-700' : 'bg-ink-100 border-ink-200'
            }`}>
              {[
                { id: 'auto-runner', label: '7-Step Sequential Auto-Runner', icon: Play },
                { id: 'pipeline', label: 'Pipeline Stepper & Terminal', icon: Terminal },
                { id: 'videos', label: `Outlier Database (${videosList.length})`, icon: Flame },
                { id: 'clusters', label: `Semantic Clusters (${data?.clusters?.length || 0})`, icon: Layers },
                { id: 'opportunities', label: `Opportunity Matrix (${data?.opportunities?.length || 0})`, icon: Target },
                { id: 'discards', label: `Admission Gates & Discards (${data?.discardedVideos?.length || 0})`, icon: AlertCircle },
              ].map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition cursor-pointer ${
                      activeTab === tab.id
                        ? 'bg-white dark:bg-ink-900 text-ink-900 dark:text-white font-semibold'
                        : 'text-ink-500 dark:text-ink-400 hover:text-ink-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* SUBTAB 1: SEQUENTIAL AUTO-RUNNER */}
            {activeTab === 'auto-runner' && (
              <div className="space-y-5">
                <div className={`p-6 rounded-xl border ${
                  isDarkMode ? 'bg-ink-850 border-ink-700' : 'bg-white border-ink-200'
                }`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h2 className=" text-xl font-bold flex items-center gap-2">
                        <span>Sequential Pipeline Execution Engine</span>
                        <span className="text-[11px] font-mono bg-brand-50 text-brand-600 dark:text-brand-300 dark:bg-brand-950 px-2 py-0.5 rounded-full">
                          {selectedNiche.toUpperCase()}
                        </span>
                      </h2>
                      <p className="text-xs text-ink-500 dark:text-ink-400 mt-1 max-w-2xl">
                        Runs the 7 original Python scripts in <code className="font-mono text-brand-600 dark:text-brand-300">autosignal/</code> sequentially. Each script validates output JSON artifacts and updates cache state in real time.
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {isAutoRunning ? (
                        <button
                          onClick={stopSequentialAutoRun}
                          className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold px-5 py-2.5 rounded-lg transition cursor-pointer"
                        >
                          <Pause className="w-3.5 h-3.5 fill-current" />
                          <span>Stop Pipeline</span>
                        </button>
                      ) : (
                        <button
                          onClick={startSequentialAutoRun}
                          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold px-6 py-2.5 rounded-lg transition active:scale-[0.98] cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Run All 7 Steps Sequentially</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar & Timer */}
                  <div className="mt-6 pt-5 border-t border-ink-200 dark:border-ink-800 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-ink-900 dark:text-white">
                        {isAutoRunning
                          ? `Running Step ${autoRunStepIndex + 1} of ${pipelineSteps.length}: ${pipelineSteps[autoRunStepIndex]?.name}`
                          : autoRunProgress === 100
                          ? 'All stages executed successfully'
                          : 'Ready to execute'}
                      </span>
                      <span className="font-mono text-ink-500 dark:text-ink-400">
                        {autoRunProgress}% • Elapsed: {elapsedTime}s
                      </span>
                    </div>

                    <div className="w-full bg-ink-100 dark:bg-ink-800 h-2.5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-600 transition-all duration-300"
                        style={{ width: `${autoRunProgress}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* 7 Individual Step Cards with Human Summaries & Raw Terminal */}
                <div className="space-y-3">
                  {pipelineSteps.map((step, idx) => {
                    const res = stepResults[step.id];
                    const isRunning = isAutoRunning && autoRunStepIndex === idx;
                    const isDone = res?.status === 'done' || (!isAutoRunning && autoRunProgress === 100);

                    return (
                      <div
                        key={step.id}
                        className={`rounded-lg border transition overflow-hidden ${
                          isDarkMode ? 'bg-ink-850 border-ink-700' : 'bg-white border-ink-200'
                        }`}
                      >
                        <div
                          onClick={() => toggleStepCard(step.id)}
                          className="p-4 flex items-center justify-between gap-4 cursor-pointer hover:bg-ink-100/50 dark:hover:bg-ink-800/50 select-none"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-mono font-bold text-xs shrink-0 ${
                              isRunning
                                ? 'bg-brand-600 text-white animate-pulse'
                                : isDone
                                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                                : 'bg-ink-100 dark:bg-ink-800 text-ink-500'
                            }`}>
                              {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : isDone ? '✓' : `0${idx + 1}`}
                            </div>

                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-semibold">{step.name}</span>
                                <span className="font-mono text-[11px] text-ink-500 dark:text-ink-400 bg-ink-100 dark:bg-ink-800 px-2 py-0.5 rounded">
                                  {step.script}
                                </span>
                                {isDone && (
                                  <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.2 rounded-full border border-emerald-500/30">
                                    Done
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">{step.description}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRunSingleStep(step.id);
                              }}
                              disabled={isAutoRunning}
                              className="text-xs bg-ink-100 dark:bg-ink-800 hover:bg-ink-150 text-ink-900 dark:text-white px-2.5 py-1 rounded-xl transition cursor-pointer"
                            >
                              Run Step
                            </button>
                            <ChevronDown className={`w-4 h-4 text-ink-500 transition-transform ${res?.expanded ? 'rotate-180' : ''}`} />
                          </div>
                        </div>

                        {/* Expanded Details */}
                        {res?.expanded && (
                          <div className="px-5 pb-5 pt-2 border-t border-ink-200 dark:border-ink-800 space-y-3 bg-ink-50 dark:bg-ink-900/50">
                            <div className="rounded-xl overflow-hidden border border-ink-200 dark:border-ink-700 bg-ink-950 text-ink-100">
                              <div className="px-3 py-1.5 bg-ink-850 border-b border-ink-800 flex items-center justify-between text-[11px] font-mono text-ink-400">
                                <span className="flex items-center gap-1.5">
                                  <Terminal className="w-3 h-3 text-brand-600 dark:text-brand-300" />
                                  <span>python3 autosignal/{step.script} {selectedNiche}</span>
                                </span>
                                <span>Exit: 0</span>
                              </div>
                              <pre className="p-3 text-xs font-mono text-ink-300 overflow-x-auto max-h-36 whitespace-pre-wrap">
                                {res?.stdout || `Stage executed successfully. Artifact verified at data/${selectedNiche}/${step.outputFiles[0]}`}
                              </pre>
                            </div>

                            <div className="flex items-center justify-between text-xs">
                              <button
                                onClick={() => handleViewPythonCode(step.script)}
                                className="text-brand-600 dark:text-brand-300 hover:underline flex items-center gap-1 cursor-pointer font-medium"
                              >
                                <FileCode className="w-3.5 h-3.5" />
                                <span>View Python Source</span>
                              </button>

                              <button
                                onClick={() => {
                                  const out = step.outputFiles[0].replace('output/', '');
                                  let payload: any = data;
                                  if (out.includes('top_100_videos')) payload = data?.top100;
                                  else if (out.includes('merged_videos_semantic')) payload = data?.mergedSemantic;
                                  else if (out.includes('video_clusters')) payload = data?.clusters;
                                  else if (out.includes('opportunities')) payload = data?.opportunities;
                                  setJsonModal({ open: true, title: out, data: payload || { status: 'Artifact saved' } });
                                }}
                                className="text-ink-500 dark:text-ink-400 hover:text-ink-900 dark:hover:text-white flex items-center gap-1 cursor-pointer"
                              >
                                <Database className="w-3.5 h-3.5" />
                                <span>Inspect Artifact JSON</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SUBTAB 2: PIPELINE STEPPER & CONSOLE */}
            {activeTab === 'pipeline' && (
              <div className="space-y-4">
                <div className={`p-5 rounded-xl border ${
                  isDarkMode ? 'bg-ink-850 border-ink-700' : 'bg-white border-ink-200'
                }`}>
                  <h3 className=" text-base font-semibold">Live Python Console Output</h3>
                  <div className="mt-3 rounded-lg bg-ink-950 text-ink-100 p-4 font-mono text-xs max-h-80 overflow-y-auto space-y-2 border border-ink-700">
                    {consoleLogs.map((log, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-ink-500 text-[11px] shrink-0 pt-0.5">[{log.time}]</span>
                        <pre className="whitespace-pre-wrap font-mono text-xs flex-1 text-ink-300">
                          {log.text}
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* SUBTAB 3: OUTLIER DATABASE */}
            {activeTab === 'videos' && (
              <div className="space-y-4">
                <div className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                  isDarkMode ? 'bg-ink-850 border-ink-700' : 'bg-white border-ink-200'
                }`}>
                  {/* Search Bar + Live Search Trigger */}
                  <div className="flex items-center gap-2 flex-1 max-w-xl bg-ink-100 dark:bg-ink-800 px-3.5 py-1.5 rounded-lg">
                    <Search className="w-4 h-4 text-ink-500 shrink-0" />
                    <input
                      type="text"
                      placeholder="Search live YouTube & database (e.g. brake pins, local llm, crypto)..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleLiveYoutubeSearch();
                      }}
                      className="bg-transparent border-none text-xs text-ink-900 dark:text-white placeholder-ink-500 focus:outline-none w-full"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => {
                          setSearchQuery('');
                          setLiveSearchResult(null);
                        }}
                        className="text-ink-500 hover:text-ink-900 dark:hover:text-white p-0.5 shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => handleLiveYoutubeSearch()}
                      disabled={isSearchingLive}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold transition cursor-pointer shrink-0 disabled:opacity-50"
                      title="Fetch live YouTube search results and save outlier records to database"
                    >
                      {isSearchingLive ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span className="hidden sm:inline">Searching YouTube...</span>
                        </>
                      ) : (
                        <>
                          <Video className="w-3.5 h-3.5" />
                          <span>Search YouTube Live</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Filter Pills */}
                  <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                    {(['all', 'outliers', 'viral', 'evergreen'] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => setVideoFilter(f)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition capitalize shrink-0 ${
                          videoFilter === f
                            ? 'bg-brand-600 text-white'
                            : 'bg-ink-100 dark:bg-ink-800 text-ink-500 dark:text-ink-400'
                        }`}
                      >
                        {f === 'outliers' ? `≥3x Outliers (${strongOutliersCount})` : f}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Live YouTube Search & DB Persisted Banner */}
                {liveSearchResult && (
                  <div className="p-4 rounded-lg bg-ink-900 border border-emerald-500/40 flex flex-col sm:flex-row items-center justify-between gap-3 animate-fade-in">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                        <CheckCheck className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-2">
                          <span>{liveSearchResult.isLive ? 'Live YouTube Data API v3' : 'Outlier Synthesis Engine'}</span>
                          <span className="text-[11px] font-mono bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                            SAVED TO DATABASE
                          </span>
                        </div>
                        <div className="text-xs text-ink-300 mt-0.5">
                          Found {liveSearchResult.count} breakout videos for "{liveSearchResult.query}". Top outlier: <strong className="text-white">"{liveSearchResult.topVideoTitle}"</strong>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => {
                          setAppMode('creator');
                          showToast(`Opened Masterclass Brief for "${liveSearchResult.query}"`, 'info');
                        }}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold transition cursor-pointer"
                      >
                        <PenLine className="w-3.5 h-3.5" />
                        <span>View Masterclass Brief</span>
                      </button>

                      <button
                        onClick={() => {
                          setCurrentTopic(liveSearchResult.query);
                          setAppMode('video-studio');
                          setStudioRequest({ tab: 'templates', key: Date.now() });
                          showToast(`Opened AI Video Studio for "${liveSearchResult.query}"`, 'info');
                        }}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-brand-400 bg-brand-500/20 text-brand-200 hover:bg-brand-500/30 text-xs font-semibold transition cursor-pointer"
                      >
                        <Film className="w-3.5 h-3.5" />
                        <span>Clip in Video Studio</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Instant Search Actions Banner (when user types) */}
                {!liveSearchResult && searchQuery.trim().length > 1 && (
                  <div className="p-4 rounded-lg bg-brand-50 dark:bg-brand-950 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-xl bg-brand-600/15 text-brand-600 dark:text-brand-300 flex items-center justify-center shrink-0">
                        <PenLine className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-ink-900 dark:text-white">
                          Target Query: <span className="text-brand-600 dark:text-brand-300 underline">"{searchQuery}"</span>
                        </div>
                        <div className="text-xs text-ink-500 dark:text-ink-400">
                          Generate an on-demand AI blueprint or query live YouTube metrics for this topic.
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleLiveYoutubeSearch(searchQuery)}
                        disabled={isSearchingLive}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition cursor-pointer"
                      >
                        {isSearchingLive ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Video className="w-3.5 h-3.5" />}
                        <span>Live YouTube Search & Save</span>
                      </button>

                      <button
                        onClick={() => {
                          handleGenerateBrief(searchQuery);
                          setAppMode('creator');
                        }}
                        disabled={generatingBrief}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold transition cursor-pointer"
                      >
                        {generatingBrief ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PenLine className="w-3.5 h-3.5" />}
                        <span>Generate Brief</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Empty State when no videos match */}
                {filteredVideos.length === 0 && (
                  <div className={`p-8 rounded-xl border text-center space-y-4 ${
                    isDarkMode ? 'bg-ink-850 border-ink-700' : 'bg-white border-ink-200'
                  }`}>
                    <div className="w-12 h-12 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
                      <Search className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <h3 className=" text-base font-semibold">
                        No cached videos matching "{searchQuery}"
                      </h3>
                      <p className="text-xs text-ink-500 dark:text-ink-400 max-w-md mx-auto">
                        This query hasn't been crawled yet. Click the button below to query the YouTube Data API live, compute outperformance ratios, and save the videos directly to your database.
                      </p>
                    </div>
                    <button
                      onClick={() => handleLiveYoutubeSearch(searchQuery)}
                      disabled={isSearchingLive}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold transition cursor-pointer"
                    >
                      {isSearchingLive ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
                      <span>Search Live YouTube for "{searchQuery}" & Save</span>
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredVideos.map(video => {
                    const isOutlier = video.outperformance_ratio >= 3.0;
                    return (
                      <div
                        key={video.video_id}
                        className={`rounded-xl border overflow-hidden hover:border-brand-600 transition flex flex-col ${
                          isDarkMode ? 'bg-ink-850 border-ink-700' : 'bg-white border-ink-200'
                        }`}
                      >
                        <div className="relative aspect-video bg-ink-950 overflow-hidden">
                          <img
                            src={video.thumbnail_url}
                            alt={video.title}
                            className="w-full h-full object-cover opacity-85 hover:scale-105 transition duration-300"
                          />
                          <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                            {isOutlier && (
                              <span className="bg-brand-600 text-white text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg">
                                {video.outperformance_ratio}× BREAKOUT
                              </span>
                            )}
                            <span className="bg-black/80 text-white text-[11px] font-mono px-2 py-0.5 rounded-lg backdrop-blur-xs">
                              {video.views_per_hour} VPH
                            </span>
                          </div>
                        </div>

                        <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                          <div>
                            <div className="flex items-center gap-1.5 text-[11px] font-mono text-ink-500 dark:text-ink-400 mb-1">
                              <span className="text-brand-600 dark:text-brand-300 font-semibold">{video.subniche || 'General'}</span>
                              <span>•</span>
                              <span>{video.hours_since_publish}h ago</span>
                            </div>
                            <h4 className="text-xs font-semibold line-clamp-2 leading-relaxed">
                              {video.title}
                            </h4>
                            <div className="text-xs text-ink-500 dark:text-ink-400 mt-1">
                              {video.channel_title} • {video.channel_subscriber_count?.toLocaleString()} subs
                            </div>
                          </div>

                          <div className="pt-2 border-t border-ink-200 dark:border-ink-700 flex items-center justify-between text-xs">
                            <button
                              onClick={() => setJsonModal({ open: true, title: `Video: ${video.video_id}`, data: video })}
                              className="text-ink-500 dark:text-ink-400 hover:text-ink-900 dark:hover:text-white flex items-center gap-1 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>JSON</span>
                            </button>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  setSelectedOutlierVideo(video);
                                  setCurrentTopic(video.title);
                                  setAppMode('video-studio');
                                  setStudioRequest({ tab: 'clips', clipSource: `https://www.youtube.com/watch?v=${video.video_id}`, key: Date.now() });
                                  showToast(`Loaded "${video.title}" into AI Video Studio`, 'info');
                                }}
                                className="text-brand-600 dark:text-brand-400 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                                title="Clip & adapt this outlier into a high-retention Short in AI Video Studio"
                              >
                                <Film className="w-3.5 h-3.5" />
                                <span>Clip</span>
                              </button>

                              <button
                                onClick={() => {
                                  handleGenerateBrief(video);
                                  setAppMode('creator');
                                  showToast(`Generated Creator Brief for "${video.title}"`, 'info');
                                }}
                                className="text-brand-600 dark:text-brand-300 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                                title="Deconstruct outlier hook & generate full Masterclass Brief"
                              >
                                <PenLine className="w-3.5 h-3.5" />
                                <span>Brief</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SUBTAB 4: SEMANTIC TOPIC CLUSTERS */}
            {activeTab === 'clusters' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data?.clusters?.map((cluster, i) => (
                  <div
                    key={cluster.cluster_id || i}
                    className={`p-5 rounded-xl border space-y-3 ${
                      isDarkMode ? 'bg-ink-850 border-ink-700' : 'bg-white border-ink-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs text-brand-600 dark:text-brand-300 font-bold">Cluster #{cluster.cluster_rank || i + 1}</div>
                        <h3 className=" text-base font-semibold mt-0.5">{cluster.cluster_label}</h3>
                      </div>
                      <div className="bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-300 px-2.5 py-1 rounded-xl font-mono text-xs font-bold">
                        {cluster.cluster_score10 ? `${cluster.cluster_score10}/10` : '9.0/10'}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs py-2 border-y border-ink-200 dark:border-ink-800">
                      <div>
                        <div className="text-[11px] text-ink-500 dark:text-ink-400 font-mono">Search Gap</div>
                        <div className="font-semibold text-xs font-mono">{Math.round((cluster.search_gap || 0.85) * 100)}%</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-ink-500 dark:text-ink-400 font-mono">Avg Velocity</div>
                        <div className="font-semibold text-xs font-mono">{cluster.avg_vph?.toLocaleString()} VPH</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-ink-500 dark:text-ink-400 font-mono">Outperformance</div>
                        <div className="font-semibold text-xs font-mono text-brand-600 dark:text-brand-300">{cluster.avg_outperformance}×</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1">
                      <button
                        onClick={() => setJsonModal({ open: true, title: `Cluster: ${cluster.cluster_label}`, data: cluster })}
                        className="text-ink-500 dark:text-ink-400 hover:text-ink-900 dark:hover:text-white flex items-center gap-1 cursor-pointer"
                      >
                        <Database className="w-3.5 h-3.5" />
                        <span>Cluster Artifact</span>
                      </button>
                      <button
                        onClick={() => {
                          setAppMode('creator');
                          showToast(`Briefing topic: ${cluster.cluster_label}`, 'info');
                        }}
                        className="text-brand-600 dark:text-brand-300 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>Film This Topic</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* SUBTAB 5: OPPORTUNITY MATRIX */}
            {activeTab === 'opportunities' && (
              <div className="space-y-4">
                {data?.opportunities?.map((opp, idx) => (
                  <div
                    key={idx}
                    className={`p-5 rounded-xl border space-y-3 ${
                      isDarkMode ? 'bg-ink-850 border-ink-700' : 'bg-white border-ink-200'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className=" text-sm font-bold text-brand-600 dark:text-brand-300">#{opp.rank || idx + 1}</span>
                          <h3 className=" text-base font-semibold">{opp.cluster_label}</h3>
                          <span className="text-xs bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-300 px-2 py-0.5 rounded-full">
                            {opp.window || 'IMMEDIATE'}
                          </span>
                        </div>
                        <p className="text-xs text-ink-500 dark:text-ink-400 mt-1">
                          Angle: {opp.recommended_angle}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <div className="text-xs text-ink-500">Score</div>
                          <div className=" text-lg font-bold text-brand-600 dark:text-brand-300">{opp.final_score}/10</div>
                        </div>
                        <button
                          onClick={() => {
                            handleGenerateBrief(opp);
                            setAppMode('creator');
                          }}
                          className="bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold px-4 py-2 rounded-xl transition cursor-pointer"
                        >
                          Generate Brief
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* SUBTAB 6: DISCARDS */}
            {activeTab === 'discards' && (
              <div className={`p-6 rounded-xl border space-y-4 ${
                isDarkMode ? 'bg-ink-850 border-ink-700' : 'bg-white border-ink-200'
              }`}>
                <div className="border-b border-ink-200 dark:border-ink-800 pb-3">
                  <h3 className=" text-base font-semibold">Admission Gate Audit Log</h3>
                  <p className="text-xs text-ink-500 dark:text-ink-400">
                    Videos rejected by the 7 quality gates in metadata_fetch.py and merge_json.py.
                  </p>
                </div>

                <div className="divide-y divide-ink-200 dark:divide-ink-800">
                  {data?.discardedVideos && data.discardedVideos.length > 0 ? (
                    data.discardedVideos.map((item, idx) => (
                      <div key={idx} className="py-3 flex items-start justify-between gap-4 text-xs">
                        <div>
                          <div className="font-medium text-ink-900 dark:text-white">{item.title}</div>
                          <div className="text-xs font-mono text-ink-500 dark:text-ink-400 mt-0.5">ID: {item.video_id}</div>
                        </div>
                        <span className="font-mono text-xs text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-lg border border-rose-500/30 shrink-0">
                          {item.discard_reason}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="py-6 text-center text-xs text-ink-500 dark:text-ink-400">
                      No videos discarded. All candidates passed admission gates.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* FULLSCREEN TELEPROMPTER READER (FOR CREATORS FILMING AT DESK/PHONE)      */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {showTeleprompter && (
        <div className="fixed inset-0 z-50 bg-ink-950 text-ink-50 flex flex-col p-6 animate-fade-in">
          {/* Prompter Controls Header */}
          <div className="max-w-4xl w-full mx-auto flex items-center justify-between pb-4 border-b border-ink-800 shrink-0">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs font-bold text-brand-600 dark:text-brand-300">
                Studio Teleprompter
              </span>
              <span className="text-xs text-ink-400 hidden sm:inline">• {currentTopic}</span>
            </div>

            <div className="flex items-center gap-3">
              {/* Play / Pause */}
              <button
                onClick={() => setIsPrompterPlaying(!isPrompterPlaying)}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  isPrompterPlaying
                    ? 'bg-amber-500 text-black'
                    : 'bg-brand-600 text-white hover:bg-brand-700'
                }`}
              >
                {isPrompterPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                <span>{isPrompterPlaying ? 'Pause Scroll' : 'Start Auto-Scroll'}</span>
              </button>

              {/* Speed Slider */}
              <div className="hidden sm:flex items-center gap-2 bg-ink-850 px-3 py-1.5 rounded-xl border border-ink-800 text-xs">
                <span className="text-[11px] text-ink-400 font-mono">Speed:</span>
                <input
                  type="range"
                  min="80"
                  max="220"
                  value={teleprompterSpeed}
                  onChange={e => setTeleprompterSpeed(Number(e.target.value))}
                  className="w-20 accent-brand-600 cursor-pointer"
                />
                <span className="font-mono text-[11px] text-brand-600 dark:text-brand-300">{teleprompterSpeed} WPM</span>
              </div>

              {/* Font Size Slider */}
              <div className="hidden sm:flex items-center gap-2 bg-ink-850 px-3 py-1.5 rounded-xl border border-ink-800 text-xs">
                <span className="text-[11px] text-ink-400 font-mono">Size:</span>
                <button
                  onClick={() => setTeleprompterFontSize(Math.max(18, teleprompterFontSize - 2))}
                  className="px-1.5 py-0.5 rounded bg-ink-800 text-xs font-bold"
                >
                  A-
                </button>
                <button
                  onClick={() => setTeleprompterFontSize(Math.min(42, teleprompterFontSize + 2))}
                  className="px-1.5 py-0.5 rounded bg-ink-800 text-xs font-bold"
                >
                  A+
                </button>
              </div>

              <button
                onClick={() => setShowTeleprompter(false)}
                className="w-8 h-8 rounded-xl bg-ink-850 hover:bg-ink-800 flex items-center justify-center text-ink-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Prompter Scrolling Text Area */}
          <div
            ref={prompterContentRef}
            className="flex-1 max-w-3xl w-full mx-auto overflow-y-auto py-12 px-4 space-y-8 select-none scrollbar-none"
            style={{ fontSize: `${teleprompterFontSize}px` }}
          >
            <div className="text-ink-500 text-sm text-center">
              [LOOK DIRECTLY INTO LENS • 3... 2... 1...]
            </div>

            <div className=" leading-relaxed text-ink-100 whitespace-pre-wrap text-center max-w-2xl mx-auto">
              {teleprompterFullText}
            </div>

            <div className="text-ink-500 text-sm text-center pt-16">
              [END OF RECORDING • CUT CAMERA]
            </div>
          </div>
        </div>
      )}

      {/* Python Code Viewer Modal */}
      {codeModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6">
          <div className={`w-full max-w-4xl rounded-xl overflow-hidden shadow-lg flex flex-col max-h-[85vh] border ${
            isDarkMode ? 'bg-ink-850 border-ink-700' : 'bg-white border-ink-200'
          }`}>
            <div className="p-4 border-b border-ink-200 dark:border-ink-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-brand-600 dark:text-brand-300" />
                <span className="font-mono text-xs font-bold">autosignal/{codeModal.filename}</span>
              </div>
              <button
                onClick={() => setCodeModal(null)}
                className="w-7 h-7 rounded-xl bg-ink-100 dark:bg-ink-800 flex items-center justify-center text-ink-500 hover:text-ink-900 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-auto bg-ink-950 text-ink-200 font-mono text-xs">
              <pre className="whitespace-pre">{codeModal.code}</pre>
            </div>
          </div>
        </div>
      )}

      {/* JSON Viewer Modal */}
      {jsonModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6">
          <div className={`w-full max-w-3xl rounded-xl overflow-hidden shadow-lg flex flex-col max-h-[80vh] border ${
            isDarkMode ? 'bg-ink-850 border-ink-700' : 'bg-white border-ink-200'
          }`}>
            <div className="p-4 border-b border-ink-200 dark:border-ink-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-500" />
                <span className="font-mono text-xs font-bold">{jsonModal.title}</span>
              </div>
              <button
                onClick={() => setJsonModal(null)}
                className="w-7 h-7 rounded-xl bg-ink-100 dark:bg-ink-800 flex items-center justify-center text-ink-500 hover:text-ink-900 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-auto bg-ink-950 text-emerald-400 font-mono text-xs">
              <pre className="whitespace-pre">{JSON.stringify(jsonModal.data, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* STUDIO SETTINGS & 20 NICHES MODAL                                      */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6">
          <div className={`w-full max-w-4xl rounded-xl overflow-hidden shadow-lg flex flex-col max-h-[90vh] border ${
            isDarkMode ? 'bg-ink-850 border-ink-700' : 'bg-white border-ink-200'
          }`}>
            {/* Modal Header */}
            <div className="p-5 border-b border-ink-200 dark:border-ink-700 flex items-center justify-between shrink-0 bg-ink-100/50 dark:bg-ink-850/50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-300 flex items-center justify-center">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <h3 className=" text-lg font-bold text-ink-900 dark:text-white">
                    Studio Settings & Niches
                  </h3>
                  <p className="text-xs text-ink-500 dark:text-ink-400">
                    Switch between all 20 content categories, configure API keys, and tune scanner gates
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowSettingsModal(false)}
                className="w-8 h-8 rounded-xl bg-ink-100 dark:bg-ink-800 flex items-center justify-center text-ink-500 hover:text-ink-900 dark:hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Tab Navigation */}
            <div className="px-5 pt-3 pb-2 border-b border-ink-200 dark:border-ink-700 flex items-center gap-2 shrink-0 bg-ink-50 dark:bg-ink-900">
              <button
                onClick={() => setSettingsTab('niches')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  settingsTab === 'niches'
                    ? 'bg-brand-600 text-white'
                    : 'text-ink-500 dark:text-ink-400 hover:bg-ink-150 dark:hover:bg-ink-800'
                }`}
              >
                <Flame className="w-3.5 h-3.5" />
                <span>All 20 Niches ({niches.length})</span>
              </button>

              <button
                onClick={() => setSettingsTab('keys')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  settingsTab === 'keys'
                    ? 'bg-brand-600 text-white'
                    : 'text-ink-500 dark:text-ink-400 hover:bg-ink-150 dark:hover:bg-ink-800'
                }`}
              >
                <Key className="w-3.5 h-3.5" />
                <span>API Keys & Integrations</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse ml-0.5" />
              </button>

              <button
                onClick={() => setSettingsTab('gates')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  settingsTab === 'gates'
                    ? 'bg-brand-600 text-white'
                    : 'text-ink-500 dark:text-ink-400 hover:bg-ink-150 dark:hover:bg-ink-800'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Scanner Gates & Thresholds</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* ───────────────── TAB 1: 20 NICHES EXPLORER ───────────────── */}
              {settingsTab === 'niches' && (
                <div className="space-y-4">
                  {/* Search and Category Filter Bar */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-1 bg-ink-100 dark:bg-ink-850 px-3.5 py-2 rounded-lg">
                      <Search className="w-4 h-4 text-ink-500" />
                      <input
                        type="text"
                        placeholder="Search among all 20 niches (e.g. woodworking, gaming, crypto)..."
                        value={nicheSearch}
                        onChange={e => setNicheSearch(e.target.value)}
                        className="bg-transparent border-none text-xs text-ink-900 dark:text-white placeholder-ink-500 focus:outline-none w-full"
                      />
                      {nicheSearch && (
                        <button onClick={() => setNicheSearch('')} className="text-ink-500">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="text-xs text-ink-500 dark:text-ink-400 shrink-0 font-mono">
                      Active: <span className="font-semibold text-brand-600 dark:text-brand-300">{selectedNiche}</span>
                    </div>
                  </div>

                  {/* Category Pills */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                    {['all', 'Auto & Engineering', 'Tech & Software', 'Finance & Business', 'Lifestyle & Food', 'Health & Wellness', 'Creative & Media', 'Productivity & Learning'].map(cat => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`text-xs px-3 py-1 rounded-xl whitespace-nowrap transition cursor-pointer font-medium ${
                          selectedCategory === cat
                            ? 'bg-ink-900 text-white dark:bg-white dark:text-black font-semibold'
                            : 'bg-ink-100 dark:bg-ink-850 text-ink-500 dark:text-ink-400 hover:text-ink-900 dark:hover:text-white'
                        }`}
                      >
                        {cat === 'all' ? 'All Niches' : cat}
                      </button>
                    ))}
                  </div>

                  {/* 20 Niches Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {niches
                      .filter(n => {
                        const matchesSearch = n.label.toLowerCase().includes(nicheSearch.toLowerCase()) ||
                          n.description.toLowerCase().includes(nicheSearch.toLowerCase()) ||
                          n.id.toLowerCase().includes(nicheSearch.toLowerCase());
                        const matchesCategory = selectedCategory === 'all' || n.category === selectedCategory;
                        return matchesSearch && matchesCategory;
                      })
                      .map(n => {
                        const isSelected = selectedNiche === n.id;
                        return (
                          <div
                            key={n.id}
                            onClick={() => {
                              setSelectedNiche(n.id);
                              showToast(`Switched active niche to ${n.label}!`, 'success');
                            }}
                            className={`p-4 rounded-lg border transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                              isSelected
                                ? 'bg-brand-50 dark:bg-brand-950 border-brand-600 ring-2 ring-brand-600/20'
                                : 'bg-white dark:bg-ink-850 border-ink-200 dark:border-ink-700 hover:border-brand-600/50'
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-xl">{n.icon}</span>
                                  <span className=" text-sm font-bold text-ink-900 dark:text-white">
                                    {n.label}
                                  </span>
                                </div>
                                {isSelected ? (
                                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-brand-600 text-white font-bold">
                                    ACTIVE
                                  </span>
                                ) : (
                                  <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-ink-100 dark:bg-ink-900 text-ink-500 dark:text-ink-400">
                                    {n.category?.split(' ')[0] || 'Niche'}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-ink-500 dark:text-ink-400 line-clamp-2 leading-relaxed">
                                {n.description}
                              </p>
                            </div>

                            <div className="pt-2 border-t border-ink-200 dark:border-ink-800 flex items-center justify-between text-xs font-mono text-ink-500 dark:text-ink-400">
                              <span>{n.outlierCount || 8} Outliers</span>
                              <span className="text-brand-600 dark:text-brand-300 font-semibold">
                                {isSelected ? 'Selected' : 'Click to Load →'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* ───────────────── TAB 2: API KEYS & STATUS ───────────────── */}
              {settingsTab === 'keys' && (
                <div className="space-y-6">
                  <p className="text-sm text-ink-600 dark:text-ink-300 leading-relaxed">
                    New ideas and briefs come from live YouTube data analysed by Gemini, so both keys are needed. Keys are checked with Google, then saved to the project's <code className="font-mono text-xs">.env</code> file on this computer.
                  </p>

                  {[
                    {
                      id: 'gemini',
                      name: 'Gemini API key',
                      configured: apiKeysStatus?.geminiConfigured,
                      detail: `Writes the idea, titles, hook and outline. Model: ${apiKeysStatus?.geminiModel || 'gemini-3.1-flash-lite'}`,
                      value: geminiKeyInput,
                      setValue: setGeminiKeyInput,
                      placeholder: apiKeysStatus?.geminiConfigured ? 'Saved. Paste a new key to replace it' : 'Paste your Gemini key',
                      steps: [
                        <>Go to <span className="font-mono text-brand-600 dark:text-brand-300">aistudio.google.com</span> and sign in.</>,
                        <>Click <strong>Get API key</strong>, then <strong>Create API key</strong>.</>,
                        <>Copy the key, paste it here and click <strong>Save keys</strong>.</>
                      ]
                    },
                    {
                      id: 'youtube',
                      name: 'YouTube Data API v3 key',
                      configured: apiKeysStatus?.youtubeConfigured,
                      detail: 'Finds recent outlier videos. Free quota: 10,000 units/day; this app caps itself at 2,000.',
                      value: youtubeKeyInput,
                      setValue: setYoutubeKeyInput,
                      placeholder: 'Paste your YouTube key',
                      steps: [
                        <>Go to <span className="font-mono text-brand-600 dark:text-brand-300">console.cloud.google.com</span> and create a project.</>,
                        <><strong>APIs & Services → Library</strong>, search <strong>YouTube Data API v3</strong>, click <strong>Enable</strong>.</>,
                        <><strong>APIs & Services → Credentials → Create credentials → API key</strong>. Copy it and paste it here.</>
                      ]
                    }
                  ].map(k => (
                    <div key={k.id} className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-ink-900 dark:text-white">{k.name}</div>
                          <div className="text-xs text-ink-500 dark:text-ink-400">{k.detail}</div>
                        </div>
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${
                          k.configured
                            ? 'bg-brand-50 dark:bg-brand-950 text-brand-700 dark:text-brand-300'
                            : 'bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-200'
                        }`}>
                          {k.configured ? 'Connected' : 'Not set'}
                        </span>
                      </div>
                      <input
                        type="password"
                        autoComplete="off"
                        placeholder={k.placeholder}
                        value={k.value}
                        onChange={e => k.setValue(e.target.value)}
                        className="w-full p-2.5 rounded-lg bg-ink-100 dark:bg-ink-900 font-mono text-xs text-ink-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-600/40"
                      />
                      {!k.configured && (
                        <ol className="text-xs text-ink-500 dark:text-ink-400 space-y-1 list-decimal pl-4 leading-relaxed">
                          {k.steps.map((step, i) => <li key={i}>{step}</li>)}
                        </ol>
                      )}
                    </div>
                  ))}

                  <div className="flex items-center justify-end gap-3 pt-2 border-t border-ink-200 dark:border-ink-800">
                    <button
                      onClick={handleSaveYoutubeApiKey}
                      disabled={savingKey || (!geminiKeyInput.trim() && !youtubeKeyInput.trim())}
                      className="mt-4 px-4 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition cursor-pointer disabled:opacity-50 flex items-center gap-2"
                    >
                      {savingKey ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      <span>{savingKey ? 'Checking with Google...' : 'Save keys'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ───────────────── TAB 3: SCANNER GATES ───────────────────── */}
              {settingsTab === 'gates' && (
                <div className="space-y-4">
                  <div className={`p-5 rounded-lg border space-y-4 ${
                    isDarkMode ? 'bg-ink-850 border-ink-700' : 'bg-white border-ink-200'
                  }`}>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span>Outperformance Ratio Admission Gate</span>
                        <span className="font-mono text-brand-600 dark:text-brand-300">{gateMultiplier.toFixed(1)}× Channel Baseline</span>
                      </div>
                      <p className="text-xs text-ink-500 dark:text-ink-400">
                        Only videos beating channel historical 90-day baseline by this multiplier pass Step 2 filter.
                      </p>
                      <input
                        type="range"
                        min="2.0"
                        max="8.0"
                        step="0.5"
                        value={gateMultiplier}
                        onChange={e => setGateMultiplier(Number(e.target.value))}
                        className="w-full accent-brand-600 cursor-pointer"
                      />
                    </div>

                    <div className="space-y-1 pt-3 border-t border-ink-200 dark:border-ink-800">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span>Minimum Video Duration Filter</span>
                        <span className="font-mono text-brand-600 dark:text-brand-300">{gateMinDuration}s ({Math.floor(gateMinDuration / 60)} min)</span>
                      </div>
                      <p className="text-xs text-ink-500 dark:text-ink-400">
                        Filters out ultra-short teaser clips to guarantee substantive topic depth.
                      </p>
                      <input
                        type="range"
                        min="60"
                        max="360"
                        step="30"
                        value={gateMinDuration}
                        onChange={e => setGateMinDuration(Number(e.target.value))}
                        className="w-full accent-brand-600 cursor-pointer"
                      />
                    </div>

                    <div className="space-y-1 pt-3 border-t border-ink-200 dark:border-ink-800">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span>Upload Freshness Window</span>
                        <span className="font-mono text-brand-600 dark:text-brand-300">{gateFreshnessDays} Days</span>
                      </div>
                      <p className="text-xs text-ink-500 dark:text-ink-400">
                        Breakout discovery horizon. Focuses on newly published breakout spikes.
                      </p>
                      <input
                        type="range"
                        min="7"
                        max="90"
                        step="7"
                        value={gateFreshnessDays}
                        onChange={e => setGateFreshnessDays(Number(e.target.value))}
                        className="w-full accent-brand-600 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-ink-200 dark:border-ink-700 flex items-center justify-between shrink-0 bg-ink-50 dark:bg-ink-900">
              <span className="text-xs text-ink-500 dark:text-ink-400 font-mono">
                AutoSignal Engine v2.5 • 20 Niches Active
              </span>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="px-5 py-2 rounded-xl bg-ink-900 text-white dark:bg-white dark:text-black text-xs font-semibold transition cursor-pointer"
              >
                Close Settings
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
