import React, { useState, useEffect, useRef } from 'react';
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
  Sparkles,
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
  const [appMode, setAppMode] = useState<'simple' | 'creator' | 'video-studio' | 'deepdive'>('creator');

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
  const [studioSubMode, setStudioSubMode] = useState<'clipper' | 'prompt_generator'>('prompt_generator');
  const [videoStudioStep, setVideoStudioStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [videoFormat, setVideoFormat] = useState<'clipper' | 'faceless' | 'splitscreen'>('clipper');
  const [videoAspectRatio, setVideoAspectRatio] = useState<'9:16' | '16:9'>('9:16');
  const [videoPacing, setVideoPacing] = useState<'fast' | 'dynamic' | 'documentary'>('fast');
  const [videoSourceType, setVideoSourceType] = useState<'outlier' | 'custom' | 'ai_prompt'>('outlier');
  const [selectedOutlierVideo, setSelectedOutlierVideo] = useState<VideoItem | null>(null);
  const [customVideoUrl, setCustomVideoUrl] = useState<string>('');
  const [aiVideoPrompt, setAiVideoPrompt] = useState<string>('Cinematic 8K macro camera push-in: High-precision diagnostic inspection of glowing red hot mechanical brake components, atmospheric workshop haze, hyper-realistic reflections, 60fps slow motion, Unreal Engine 5 photorealism.');
  const [aiVideoNegativePrompt, setAiVideoNegativePrompt] = useState<string>('blurry, distorted hands, low resolution, warped textures, glitch, noise, cartoonish, watermark, oversaturated');
  const [aiVideoModel, setAiVideoModel] = useState<string>('veo-2');
  const [aiCameraMotion, setAiCameraMotion] = useState<string>('push_in');
  const [aiMotionStrength, setAiMotionStrength] = useState<number>(7);
  const [aiVideoSeed, setAiVideoSeed] = useState<string>('7291048');
  const [aiVideoResolution, setAiVideoResolution] = useState<'1080p' | '4k'>('1080p');
  const [aiVideoFps, setAiVideoFps] = useState<24 | 30 | 60>(60);
  const [showNegativePrompt, setShowNegativePrompt] = useState<boolean>(false);
  const [videoDuration, setVideoDuration] = useState<string>('60s Viral Short');
  const [captionStyle, setCaptionStyle] = useState<'hormozi' | 'minimal' | 'neon' | 'red'>('hormozi');
  const [voiceoverTone, setVoiceoverTone] = useState<'marcus' | 'elena' | 'kai' | 'sarah'>('marcus');
  const [bgMusic, setBgMusic] = useState<'lofi' | 'tension' | 'phonk' | 'ambient'>('lofi');
  const [selectedTitleIdx, setSelectedTitleIdx] = useState<number>(0);
  const [isPlayingVideoMock, setIsPlayingVideoMock] = useState<boolean>(false);
  const [videoMockProgress, setVideoMockProgress] = useState<number>(24);
  const [showComingSoonModal, setShowComingSoonModal] = useState<boolean>(false);
  const [studioCustomTopic, setStudioCustomTopic] = useState<string>('');
  const setCurrentTopic = (t: string) => setStudioCustomTopic(t);

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
    setTimeout(() => setToast(null), 3500);
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
        if (result.opportunities && result.opportunities.length > 0) {
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

  // Video Mock Playback Animation Loop
  useEffect(() => {
    let interval: any = null;
    if (isPlayingVideoMock) {
      interval = setInterval(() => {
        setVideoMockProgress(prev => (prev >= 100 ? 0 : prev + 2.5));
      }, 150);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlayingVideoMock]);

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

  // Simple Mode Instant Scan
  const handleSimpleRun = async () => {
    if (isSimpleRunning) return;
    setIsSimpleRunning(true);
    setSimpleActiveStep(0);

    for (let s = 1; s <= 4; s++) {
      await new Promise(r => setTimeout(r, 450));
      setSimpleActiveStep(s);
    }

    setIsSimpleRunning(false);
    showToast('✨ Top video blueprint refreshed & validated!', 'success');
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
        body: JSON.stringify({ youtubeApiKey: youtubeKeyInput })
      });
      const json = await res.json();
      if (json.success) {
        setApiKeysStatus(prev => ({
          geminiConfigured: json.geminiConfigured,
          geminiModel: 'gemini-2.5-flash',
          youtubeConfigured: json.youtubeConfigured,
          userCustomYoutubeApiKey: json.userCustomYoutubeApiKey,
          activeNichesCount: 20
        }));
        showToast(json.youtubeConfigured ? 'YouTube API Key verified & stored!' : 'API Key removed', 'success');
      }
    } catch (err: any) {
      showToast(`Key error: ${err.message}`, 'error');
    } finally {
      setSavingKey(false);
    }
  };

  const handleGenerateBrief = async (target?: OpportunityItem | VideoItem | string) => {
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
      if (result.success && result.brief) {
        setActiveBrief(result.brief);
        setRecentBriefs(prev => [result.brief, ...prev.filter(b => b.brief_id !== result.brief.brief_id)]);
        showToast(`✨ Generated new AI Brief for "${result.brief.topic}"!`, 'success');
        
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
      isDarkMode ? 'dark bg-[#1B1A18] text-[#ECE8E1]' : 'bg-[#FAF9F5] text-[#1C1917]'
    }`}>
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl border backdrop-blur-md shadow-xl flex items-center gap-3 text-xs font-medium animate-fade-in ${
          toast.type === 'success'
            ? 'bg-[#1C1917] dark:bg-[#FAF9F5] text-[#FAF9F5] dark:text-[#1C1917] border-[#383630]'
            : toast.type === 'error'
            ? 'bg-rose-900/90 text-rose-100 border-rose-700/50'
            : 'bg-[#2B2A26] text-[#ECE8E1] border-[#3A3833]'
        }`}>
          {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-[#C96442]" />}
          {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400" />}
          {toast.type === 'info' && <Sparkles className="w-4 h-4 text-[#C96442]" />}
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
            ? 'bg-[#181715] border-[#2E2D28] text-[#ECE8E1]'
            : 'bg-[#F5F3EC] border-[#E8E5DC] text-[#1C1917]'
        } ${
          // Desktop width: full (270px) or collapsed (68px)
          sidebarOpen ? 'w-[270px]' : 'w-0 md:w-[68px]'
        } ${
          // Mobile visibility
          mobileMenuOpen ? 'translate-x-0 w-[280px]' : '-translate-x-full md:translate-x-0'
        } overflow-hidden`}
      >
        {/* Top Header / App Brand */}
        <div className="p-3.5 flex items-center justify-between border-b border-[#E8E5DC] dark:border-[#2E2D28] shrink-0">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-xl bg-[#C96442] text-white flex items-center justify-center font-serif text-lg font-bold shadow-xs shrink-0">
              α
            </div>
            {sidebarOpen && (
              <div className="leading-tight truncate animate-fade-in">
                <div className="font-serif font-semibold text-sm tracking-tight truncate">AutoSignal AI</div>
                <div className="text-[10px] text-[#736E65] dark:text-[#9E9A90] truncate font-mono">Content Engine</div>
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
            className="p-1.5 rounded-xl hover:bg-[#EAE6DC] dark:hover:bg-[#282723] text-[#736E65] dark:text-[#9E9A90] hover:text-[#1C1917] dark:hover:text-white transition cursor-pointer"
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
            className={`w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-2xl text-xs font-semibold shadow-xs transition active:scale-[0.98] cursor-pointer ${
              sidebarOpen
                ? 'bg-[#C96442] hover:bg-[#B55232] text-white'
                : 'bg-[#C96442] text-white p-2.5'
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
              <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-[#736E65] dark:text-[#9E9A90] font-bold">
                Workspaces & Modes
              </div>
            )}

            {/* Mode 1: Simple Idea */}
            <button
              onClick={() => {
                setAppMode('simple');
                if (window.innerWidth < 768) setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 p-2 rounded-2xl text-xs font-medium transition cursor-pointer ${
                appMode === 'simple'
                  ? 'bg-white dark:bg-[#242320] text-[#1C1917] dark:text-white shadow-xs font-semibold border border-[#E8E5DC] dark:border-[#383630]'
                  : 'text-[#736E65] dark:text-[#9E9A90] hover:bg-[#EAE6DC] dark:hover:bg-[#242320] hover:text-[#1C1917] dark:hover:text-white'
              }`}
              title="Simple Idea (Clean, 1-Click for Users)"
            >
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                appMode === 'simple' ? 'bg-[#FAF0EB] dark:bg-[#2F241F] text-[#C96442]' : 'text-[#736E65]'
              }`}>
                <Zap className="w-3.5 h-3.5 fill-current" />
              </div>
              {sidebarOpen && (
                <div className="flex-1 text-left truncate">
                  <div className="truncate">Simple Idea</div>
                  <div className="text-[10px] text-[#736E65] dark:text-[#9E9A90] font-normal truncate">Fast, no clutter</div>
                </div>
              )}
            </button>

            {/* Mode 2: Creator Studio */}
            <button
              onClick={() => {
                setAppMode('creator');
                if (window.innerWidth < 768) setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 p-2 rounded-2xl text-xs font-medium transition cursor-pointer ${
                appMode === 'creator'
                  ? 'bg-[#C96442] text-white shadow-xs font-semibold'
                  : 'text-[#736E65] dark:text-[#9E9A90] hover:bg-[#EAE6DC] dark:hover:bg-[#242320] hover:text-[#1C1917] dark:hover:text-white'
              }`}
              title="Creator Studio (Tell Everything)"
            >
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                appMode === 'creator' ? 'bg-white/20 text-white' : 'text-[#736E65]'
              }`}>
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              {sidebarOpen && (
                <div className="flex-1 text-left truncate">
                  <div className="truncate">Creator Studio</div>
                  <div className={`text-[10px] font-normal truncate ${appMode === 'creator' ? 'text-white/80' : 'text-[#736E65] dark:text-[#9E9A90]'}`}>
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
              className={`w-full flex items-center gap-2.5 p-2 rounded-2xl text-xs font-medium transition cursor-pointer relative ${
                appMode === 'video-studio'
                  ? 'bg-gradient-to-r from-purple-700 via-indigo-600 to-[#C96442] text-white shadow-xs font-semibold'
                  : 'text-[#736E65] dark:text-[#9E9A90] hover:bg-[#EAE6DC] dark:hover:bg-[#242320] hover:text-[#1C1917] dark:hover:text-white'
              }`}
              title="AI Video Studio (Outlier Clipper, Faceless Shorts, Split-Screen)"
            >
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                appMode === 'video-studio' ? 'bg-white/20 text-white' : 'text-purple-500 bg-purple-500/10'
              }`}>
                <Film className="w-3.5 h-3.5" />
              </div>
              {sidebarOpen && (
                <div className="flex-1 text-left truncate flex items-center justify-between">
                  <div className="truncate">
                    <div className="truncate flex items-center gap-1.5">
                      <span>AI Video Studio</span>
                      <span className="text-[9px] px-1 py-0.2 rounded font-mono font-bold bg-amber-400 text-stone-900 uppercase">PRO</span>
                    </div>
                    <div className={`text-[10px] font-normal truncate ${appMode === 'video-studio' ? 'text-white/80' : 'text-[#736E65] dark:text-[#9E9A90]'}`}>
                      Clipper & Faceless Shorts
                    </div>
                  </div>
                </div>
              )}
            </button>

            {/* Mode 4: Pipeline & Code */}
            <button
              onClick={() => {
                setAppMode('deepdive');
                if (window.innerWidth < 768) setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 p-2 rounded-2xl text-xs font-medium transition cursor-pointer ${
                appMode === 'deepdive'
                  ? 'bg-white dark:bg-[#242320] text-[#1C1917] dark:text-white shadow-xs font-semibold border border-[#E8E5DC] dark:border-[#383630]'
                  : 'text-[#736E65] dark:text-[#9E9A90] hover:bg-[#EAE6DC] dark:hover:bg-[#242320] hover:text-[#1C1917] dark:hover:text-white'
              }`}
              title="Pipeline & Code (7 Steps, Python stdout, Outliers)"
            >
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                appMode === 'deepdive' ? 'bg-blue-500/15 text-blue-500' : 'text-[#736E65]'
              }`}>
                <Cpu className="w-3.5 h-3.5" />
              </div>
              {sidebarOpen && (
                <div className="flex-1 text-left truncate">
                  <div className="truncate">Pipeline & Code</div>
                  <div className="text-[10px] text-[#736E65] dark:text-[#9E9A90] font-normal truncate">7-step Python engine</div>
                </div>
              )}
            </button>
          </div>


        </div>

        {/* Bottom User Controls & Theme Switcher */}
        <div className="p-3 border-t border-[#E8E5DC] dark:border-[#2E2D28] shrink-0 space-y-2 bg-[#F5F3EC] dark:bg-[#181715]">
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-[#EAE6DC] dark:hover:bg-[#282723] text-xs text-[#736E65] dark:text-[#9E9A90] hover:text-[#1C1917] dark:hover:text-white transition cursor-pointer"
            title="Toggle Theme"
          >
            <div className="flex items-center gap-2 truncate">
              {isDarkMode ? <Sun className="w-4 h-4 text-amber-400 shrink-0" /> : <Moon className="w-4 h-4 text-[#736E65] shrink-0" />}
              {sidebarOpen && <span className="truncate">{isDarkMode ? 'Warm Ivory Theme' : 'Warm Obsidian Theme'}</span>}
            </div>
            {sidebarOpen && <span className="text-[10px] font-mono text-[#736E65]">{isDarkMode ? 'DARK' : 'LIGHT'}</span>}
          </button>

          {sidebarOpen && (
            <div className="px-2 pt-1 text-[10px] text-[#736E65] dark:text-[#9E9A90] font-mono flex items-center justify-between">
              <span>AutoSignal v2.5</span>
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
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
          isDarkMode ? 'bg-[#1B1A18]/95 border-[#2E2D28]' : 'bg-[#FAF9F5]/95 border-[#E8E5DC]'
        }`}>
          <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
            {/* Left: Hamburger & Current View Context */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="p-1.5 rounded-xl md:hidden hover:bg-[#EAE6DC] dark:hover:bg-[#282723] text-[#736E65] transition cursor-pointer shrink-0"
                title="Open Navigation"
              >
                <PanelLeft className="w-5 h-5" />
              </button>

              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-[#736E65] dark:text-[#9E9A90] font-mono uppercase tracking-wider">
                  <span>Mode:</span>
                  <span className="font-semibold text-[#1C1917] dark:text-white capitalize">
                    {appMode === 'simple'
                      ? 'Simple Idea'
                      : appMode === 'creator'
                      ? 'Creator Studio'
                      : appMode === 'video-studio'
                      ? 'AI Video Studio'
                      : 'Pipeline & Code'}
                  </span>
                </div>
                <div className="font-serif text-sm sm:text-base font-bold tracking-tight text-[#1C1917] dark:text-white truncate">
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
                className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl border bg-[#F5F3EC] dark:bg-[#242320] border-[#E8E5DC] dark:border-[#383630] hover:border-[#C96442] text-xs font-semibold transition cursor-pointer text-[#1C1917] dark:text-white shadow-xs shrink-0"
                title="Change active niche (20 available)"
              >
                <span className="text-sm sm:text-base">{currentNicheMeta?.icon || '🔧'}</span>
                <span className="font-serif truncate max-w-[100px] sm:max-w-none">{currentNicheMeta?.label || selectedNiche}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-[#FAF0EB] dark:bg-[#2F241F] text-[#C96442] font-bold">
                  {strongOutliersCount}
                </span>
                <ChevronDown className="w-3 h-3 text-[#736E65]" />
              </button>

              {/* Settings & All 20 Niches Config Button */}
              <button
                onClick={() => setShowSettingsModal(true)}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-medium border bg-[#F5F3EC] dark:bg-[#242320] border-[#E8E5DC] dark:border-[#383630] hover:border-[#C96442] text-[#1C1917] dark:text-white transition cursor-pointer shadow-xs shrink-0"
                title="Studio Settings, 20 Niches, and API Keys"
              >
                <Settings className="w-3.5 h-3.5 text-[#C96442]" />
                <span className="hidden sm:inline">Settings</span>
                <span className="text-[10px] font-mono font-bold bg-[#FAF0EB] dark:bg-[#2F241F] text-[#C96442] px-1 rounded">20</span>
              </button>

              {/* Creator Mode Tools */}
              {appMode === 'creator' && (
                <>
                  <button
                    onClick={() => setShowQuickTips(!showQuickTips)}
                    className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition cursor-pointer shrink-0 ${
                      showQuickTips
                        ? 'bg-[#C96442] text-white border-[#C96442]'
                        : 'bg-[#F5F3EC] dark:bg-[#2B2A26] border-[#E8E5DC] dark:border-[#383630] text-[#1C1917] dark:text-white hover:border-[#C96442]'
                    }`}
                  >
                    <Lightbulb className="w-3.5 h-3.5" />
                    <span>{showQuickTips ? 'Tips Active' : 'Quick Tips'}</span>
                  </button>

                  <button
                    onClick={() => setShowTeleprompter(true)}
                    className="flex items-center gap-1.5 bg-[#FAF0EB] dark:bg-[#2F241F] text-[#C96442] border border-[#E8D0C5] dark:border-[#4A342B] px-3 py-1.5 rounded-xl text-xs font-semibold hover:bg-[#F5E6DE] transition cursor-pointer shrink-0"
                  >
                    <Video className="w-3.5 h-3.5" />
                    <span className="hidden xs:inline">Teleprompter</span>
                  </button>
                </>
              )}

              {/* Theme Toggle Button in Header */}
              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="p-1.5 rounded-xl border border-[#E8E5DC] dark:border-[#383630] bg-[#F5F3EC] dark:bg-[#242320] text-[#736E65] dark:text-[#9E9A90] hover:text-[#1C1917] dark:hover:text-white transition cursor-pointer shrink-0"
                title="Toggle Theme"
              >
                {isDarkMode ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-[#736E65]" />}
              </button>
            </div>
          </div>
        </header>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* VIEW 1: SIMPLE USER MODE (VERY SIMPLE, 1 CLICK, BROADENED ANSWER)   */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        {appMode === 'simple' && (
          <div className="p-4 md:p-8 max-w-5xl w-full mx-auto space-y-6">
            {/* Friendly Greeting Card */}
            <div className={`p-6 sm:p-8 rounded-3xl border shadow-xs transition-all ${
              isDarkMode ? 'bg-[#242320] border-[#383630]' : 'bg-white border-[#E8E5DC]'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div className="space-y-1.5">
                  <span className="text-xs font-mono text-[#C96442] uppercase tracking-wider font-semibold">
                    Simple Recommendation Engine
                  </span>
                  <h1 className="font-serif text-2xl sm:text-3xl font-semibold tracking-tight">
                    What video should you film today in <span className="text-[#C96442] underline decoration-[#E8D0C5]">{currentNicheMeta?.label || selectedNiche}</span>?
                  </h1>
                  <p className={`text-sm max-w-xl ${isDarkMode ? 'text-[#9E9A90]' : 'text-[#736E65]'}`}>
                    We scanned YouTube for small channels unexpectedly exploding in views. Here is the exact winning idea with no technical headaches.
                  </p>
                </div>

                <button
                  onClick={handleSimpleRun}
                  disabled={isSimpleRunning}
                  className="shrink-0 flex items-center justify-center gap-2 bg-[#C96442] hover:bg-[#B55232] text-white font-medium px-6 py-3.5 rounded-2xl shadow-sm transition active:scale-[0.98] cursor-pointer disabled:opacity-50"
                >
                  {isSimpleRunning ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-amber-200" />
                      <span>Analyzing YouTube...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-amber-200" />
                      <span>Refresh Winning Idea</span>
                    </>
                  )}
                </button>
              </div>

              {/* 4 Clean Steps Bar (Clear, human, straightforward) */}
              <div className="mt-8 pt-6 border-t border-[#E8E5DC] dark:border-[#302F2A]">
                <div className="text-xs font-semibold mb-3 flex items-center justify-between">
                  <span className={isDarkMode ? 'text-[#9E9A90]' : 'text-[#736E65]'}>Analysis Transparency</span>
                  <span className="text-xs font-mono text-[#C96442]">
                    {simpleActiveStep >= 4 ? 'Verified Opportunity' : 'Scanning...'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className={`p-3 rounded-2xl border transition-all ${
                    simpleActiveStep >= 1
                      ? 'bg-[#FAF0EB] dark:bg-[#2F241F] border-[#E8D0C5] dark:border-[#4A342B]'
                      : 'opacity-50 bg-[#F5F3EC] dark:bg-[#2B2A26] border-transparent'
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#C96442] text-white flex items-center justify-center text-[10px] font-bold">1</span>
                      <span className="text-xs font-semibold">450 Videos Scanned</span>
                    </div>
                    <p className="text-[11px] text-[#736E65] dark:text-[#9E9A90] mt-1">Coded recent uploads</p>
                  </div>

                  <div className={`p-3 rounded-2xl border transition-all ${
                    simpleActiveStep >= 2
                      ? 'bg-[#FAF0EB] dark:bg-[#2F241F] border-[#E8D0C5] dark:border-[#4A342B]'
                      : 'opacity-50 bg-[#F5F3EC] dark:bg-[#2B2A26] border-transparent'
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#C96442] text-white flex items-center justify-center text-[10px] font-bold">2</span>
                      <span className="text-xs font-semibold">Fluff Filtered Out</span>
                    </div>
                    <p className="text-[11px] text-[#736E65] dark:text-[#9E9A90] mt-1">Kept 35 high-signal videos</p>
                  </div>

                  <div className={`p-3 rounded-2xl border transition-all ${
                    simpleActiveStep >= 3
                      ? 'bg-[#FAF0EB] dark:bg-[#2F241F] border-[#E8D0C5] dark:border-[#4A342B]'
                      : 'opacity-50 bg-[#F5F3EC] dark:bg-[#2B2A26] border-transparent'
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#C96442] text-white flex items-center justify-center text-[10px] font-bold">3</span>
                      <span className="text-xs font-semibold">Breakouts Isolated</span>
                    </div>
                    <p className="text-[11px] text-[#736E65] dark:text-[#9E9A90] mt-1">Small channels hitting 5.4x</p>
                  </div>

                  <div className={`p-3 rounded-2xl border transition-all ${
                    simpleActiveStep >= 4
                      ? 'bg-[#FAF0EB] dark:bg-[#2F241F] border-[#E8D0C5] dark:border-[#4A342B]'
                      : 'opacity-50 bg-[#F5F3EC] dark:bg-[#2B2A26] border-transparent'
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#C96442] text-white flex items-center justify-center text-[10px] font-bold">4</span>
                      <span className="text-xs font-semibold">Blueprint Ready</span>
                    </div>
                    <p className="text-[11px] text-[#736E65] dark:text-[#9E9A90] mt-1">High demand & low supply</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Broadened, Clear, Highlighted Result */}
            <div className={`p-6 sm:p-8 rounded-3xl border shadow-sm space-y-6 ${
              isDarkMode ? 'bg-[#242320] border-[#383630]' : 'bg-white border-[#E8E5DC]'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#FAF0EB] dark:bg-[#2F241F] text-[#C96442] border border-[#E8D0C5] dark:border-[#4A342B]">
                    <Flame className="w-3.5 h-3.5 fill-current" />
                    <span>#1 Video to Film Right Now</span>
                  </span>
                  <h2 className="font-serif text-2xl font-bold mt-2">
                    {topOpp?.cluster_label || 'High-Velocity Breakout Opportunity'}
                  </h2>
                  <p className={`text-xs mt-1 ${isDarkMode ? 'text-[#9E9A90]' : 'text-[#736E65]'}`}>
                    Target Audience Angle: <span className="font-medium text-[#1C1917] dark:text-white">{topOpp?.recommended_angle || 'Direct walkthrough showing what mechanics do wrong'}</span>
                  </p>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between bg-[#F5F3EC] dark:bg-[#2B2A26] p-3 rounded-2xl border border-[#E8E5DC] dark:border-[#383630]">
                  <span className="text-[10px] uppercase font-mono text-[#736E65] dark:text-[#9E9A90]">Confidence Score</span>
                  <span className="font-serif text-2xl font-bold text-[#C96442]">{topScore} <span className="text-xs font-normal text-[#736E65]">/ 10</span></span>
                </div>
              </div>

              {/* Quick Stats Grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3.5 rounded-2xl bg-[#F5F3EC] dark:bg-[#2B2A26] border border-[#E8E5DC] dark:border-[#383630]">
                  <div className="text-[10px] uppercase font-mono text-[#736E65] dark:text-[#9E9A90]">Multiplier</div>
                  <div className="text-lg font-bold font-serif text-[#C96442] mt-0.5">{topOpp?.outperformance_multiplier || '5.4x'}</div>
                  <div className="text-[11px] text-[#736E65] dark:text-[#9E9A90]">above baseline</div>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#F5F3EC] dark:bg-[#2B2A26] border border-[#E8E5DC] dark:border-[#383630]">
                  <div className="text-[10px] uppercase font-mono text-[#736E65] dark:text-[#9E9A90]">Search Gap</div>
                  <div className="text-lg font-bold font-serif text-[#C96442] mt-0.5">{topOpp?.search_gap_percent || '92%'}</div>
                  <div className="text-[11px] text-[#736E65] dark:text-[#9E9A90]">unmet demand</div>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#F5F3EC] dark:bg-[#2B2A26] border border-[#E8E5DC] dark:border-[#383630]">
                  <div className="text-[10px] uppercase font-mono text-[#736E65] dark:text-[#9E9A90]">Hourly Velocity</div>
                  <div className="text-lg font-bold font-serif text-[#C96442] mt-0.5">{topOpp?.avg_vph?.toLocaleString() || '1,850'}</div>
                  <div className="text-[11px] text-[#736E65] dark:text-[#9E9A90]">views/hour</div>
                </div>
              </div>

              {/* Title & Copy Hook */}
              <div className="space-y-3">
                <div className="p-4 rounded-2xl bg-[#FAF0EB] dark:bg-[#2F241F] border border-[#E8D0C5] dark:border-[#4A342B] space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#C96442] flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Recommended Title for Maximum Clicks:</span>
                    </span>
                    <button
                      onClick={() => handleCopy(latestBrief?.titles?.title_2_curiosity || topOpp?.sample_titles?.[0] || `The ${selectedNiche} Fix Most People Get Completely Wrong`, 'simple_title')}
                      className="text-xs text-[#736E65] dark:text-[#9E9A90] hover:text-[#C96442] flex items-center gap-1 cursor-pointer font-medium"
                    >
                      {copiedKey === 'simple_title' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === 'simple_title' ? 'Copied' : 'Copy Title'}</span>
                    </button>
                  </div>
                  <div className="font-serif text-lg font-semibold text-[#1C1917] dark:text-white">
                    "{latestBrief?.titles?.title_2_curiosity || topOpp?.sample_titles?.[0] || `The ${selectedNiche} Fix Most People Get Completely Wrong`}"
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[#F5F3EC] dark:bg-[#2B2A26] border border-[#E8E5DC] dark:border-[#383630] space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#1C1917] dark:text-white flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-[#C96442]" />
                      <span>First 20-Second Spoken Hook:</span>
                    </span>
                    <button
                      onClick={() => handleCopy(selectedHookData.script, 'simple_hook')}
                      className="text-xs text-[#736E65] dark:text-[#9E9A90] hover:text-[#C96442] flex items-center gap-1 cursor-pointer font-medium"
                    >
                      {copiedKey === 'simple_hook' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === 'simple_hook' ? 'Copied' : 'Copy Hook'}</span>
                    </button>
                  </div>
                  <p className="text-xs leading-relaxed italic text-[#38352F] dark:text-[#EDEAE2]">
                    "{selectedHookData.script}"
                  </p>
                </div>
              </div>

              {/* Gateway to Creator Mode */}
              <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-[#E8E5DC] dark:border-[#302F2A]">
                <div className={`text-xs ${isDarkMode ? 'text-[#9E9A90]' : 'text-[#736E65]'}`}>
                  Ready to record? Access the teleprompter, thumbnail prompt, and minute-by-minute outline.
                </div>

                <button
                  onClick={() => setAppMode('creator')}
                  className="flex items-center justify-center gap-2 bg-[#1C1917] dark:bg-[#FAF9F5] text-white dark:text-[#1C1917] font-medium text-xs px-5 py-2.5 rounded-2xl transition hover:opacity-90 cursor-pointer"
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
          <div className="p-4 md:p-8 max-w-7xl w-full mx-auto space-y-6">
            {/* Top Creator Header & Opportunity Signal */}
            <div className={`p-6 sm:p-7 rounded-3xl border shadow-xs ${
              isDarkMode ? 'bg-[#242320] border-[#383630]' : 'bg-white border-[#E8E5DC]'
            }`}>
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#FAF0EB] dark:bg-[#2F241F] text-[#C96442] border border-[#E8D0C5] dark:border-[#4A342B]">
                      <Award className="w-3.5 h-3.5" />
                      <span>Creator Production Briefing</span>
                    </span>
                    <span className="text-xs font-mono text-[#736E65] dark:text-[#9E9A90]">
                      Topic: {latestBrief?.topic || topOpp?.cluster_label || currentNicheMeta?.label}
                    </span>
                    <span className="text-[10px] font-mono uppercase bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                      {topOpp?.window || 'IMMEDIATE'} WINDOW
                    </span>
                  </div>

                  <h1 className="font-serif text-2xl sm:text-3xl font-semibold tracking-tight">
                    {latestBrief?.topic || topOpp?.cluster_label || 'Breakout Opportunity'}
                  </h1>

                  <p className={`text-xs sm:text-sm max-w-3xl leading-relaxed ${isDarkMode ? 'text-[#9E9A90]' : 'text-[#736E65]'}`}>
                    <strong className="text-[#1C1917] dark:text-white">Why This Works:</strong> In this subtopic, smaller channels (under 30k subscribers) are experiencing a <span className="text-[#C96442] font-semibold">{topOpp?.outperformance_multiplier || '5.4x'} view multiplier</span> while high-volume keyword search supply remains {topOpp?.search_gap_percent || '92%'} unmet. You will win the algorithm by executing the curiosity-debunk formula below.
                  </p>
                </div>

                {/* Header Action Buttons */}
                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <button
                    onClick={() => setShowQuickTips(!showQuickTips)}
                    className={`flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs font-semibold border transition cursor-pointer ${
                      showQuickTips
                        ? 'bg-[#C96442] text-white border-[#C96442]'
                        : 'bg-[#F5F3EC] dark:bg-[#2B2A26] border-[#E8E5DC] dark:border-[#383630] text-[#1C1917] dark:text-white hover:border-[#C96442]'
                    }`}
                  >
                    <Lightbulb className="w-3.5 h-3.5" />
                    <span>{showQuickTips ? 'Hide Hook Tips' : 'Hook Quick Tips'}</span>
                  </button>

                  <button
                    onClick={() => setShowTeleprompter(true)}
                    className="flex items-center gap-1.5 bg-[#FAF0EB] dark:bg-[#2F241F] text-[#C96442] border border-[#E8D0C5] dark:border-[#4A342B] px-4 py-2.5 rounded-2xl text-xs font-semibold hover:bg-[#F5E6DE] transition cursor-pointer"
                  >
                    <Video className="w-3.5 h-3.5" />
                    <span>Teleprompter Mode</span>
                  </button>

                  <button
                    onClick={() => {
                      if (topOpp) handleGenerateBrief(topOpp);
                    }}
                    disabled={generatingBrief}
                    className="flex items-center gap-1.5 bg-[#C96442] hover:bg-[#B55232] text-white px-4 py-2.5 rounded-2xl text-xs font-semibold shadow-xs transition active:scale-[0.98] cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${generatingBrief ? 'animate-spin' : ''}`} />
                    <span>{generatingBrief ? 'Generating with Gemini...' : 'Regenerate Brief'}</span>
                  </button>
                </div>
              </div>

              {/* 4 Quantitative Arbitrage Signals */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 pt-5 border-t border-[#E8E5DC] dark:border-[#302F2A]">
                <div className="p-3 rounded-2xl bg-[#F5F3EC] dark:bg-[#2B2A26] border border-[#E8E5DC] dark:border-[#383630]">
                  <div className="text-[10px] uppercase font-mono text-[#736E65] dark:text-[#9E9A90]">Opportunity Score</div>
                  <div className="font-serif text-xl font-bold text-[#C96442] mt-0.5">{topScore}/10</div>
                  <div className="text-[11px] text-[#736E65] dark:text-[#9E9A90]">Multi-factor rank #1</div>
                </div>

                <div className="p-3 rounded-2xl bg-[#F5F3EC] dark:bg-[#2B2A26] border border-[#E8E5DC] dark:border-[#383630]">
                  <div className="text-[10px] uppercase font-mono text-[#736E65] dark:text-[#9E9A90]">Outlier View Multiplier</div>
                  <div className="font-serif text-xl font-bold text-[#C96442] mt-0.5">{topOpp?.outperformance_multiplier || '5.4x'}</div>
                  <div className="text-[11px] text-[#736E65] dark:text-[#9E9A90]">Over channel average</div>
                </div>

                <div className="p-3 rounded-2xl bg-[#F5F3EC] dark:bg-[#2B2A26] border border-[#E8E5DC] dark:border-[#383630]">
                  <div className="text-[10px] uppercase font-mono text-[#736E65] dark:text-[#9E9A90]">Search Demand Gap</div>
                  <div className="font-serif text-xl font-bold text-[#C96442] mt-0.5">{topOpp?.search_gap_percent || '92%'}</div>
                  <div className="text-[11px] text-[#736E65] dark:text-[#9E9A90]">Unmet audience demand</div>
                </div>

                <div className="p-3 rounded-2xl bg-[#F5F3EC] dark:bg-[#2B2A26] border border-[#E8E5DC] dark:border-[#383630]">
                  <div className="text-[10px] uppercase font-mono text-[#736E65] dark:text-[#9E9A90]">Hourly Velocity (VPH)</div>
                  <div className="font-serif text-xl font-bold text-[#C96442] mt-0.5">{topOpp?.avg_vph?.toLocaleString() || '1,850'}</div>
                  <div className="text-[11px] text-[#736E65] dark:text-[#9E9A90]">Views per hour benchmark</div>
                </div>
              </div>
            </div>

            {/* Quick Tips Drawer / Panel (if open) */}
            {showQuickTips && (
              <div className={`p-6 rounded-3xl border shadow-xs animate-fade-in ${
                isDarkMode ? 'bg-[#242320] border-[#383630]' : 'bg-[#FAF0EB] border-[#E8D0C5]'
              }`}>
                <div className="flex items-center justify-between pb-3 border-b border-[#E8D0C5] dark:border-[#4A342B]">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-[#C96442]" />
                    <h3 className="text-sm font-semibold text-[#1C1917] dark:text-white">
                      Masterclass Hook & Retention Guide (2.4x Watch Time Multiplier)
                    </h3>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setQuickTipsTab('psychology')}
                      className={`px-3 py-1 rounded-xl text-xs font-medium cursor-pointer transition ${
                        quickTipsTab === 'psychology' ? 'bg-[#C96442] text-white' : 'text-[#736E65] dark:text-[#9E9A90]'
                      }`}
                    >
                      0–3s Rule
                    </button>
                    <button
                      onClick={() => setQuickTipsTab('retention')}
                      className={`px-3 py-1 rounded-xl text-xs font-medium cursor-pointer transition ${
                        quickTipsTab === 'retention' ? 'bg-[#C96442] text-white' : 'text-[#736E65] dark:text-[#9E9A90]'
                      }`}
                    >
                      Open Loops
                    </button>
                    <button
                      onClick={() => setQuickTipsTab('delivery')}
                      className={`px-3 py-1 rounded-xl text-xs font-medium cursor-pointer transition ${
                        quickTipsTab === 'delivery' ? 'bg-[#C96442] text-white' : 'text-[#736E65] dark:text-[#9E9A90]'
                      }`}
                    >
                      Vocal Cadence
                    </button>
                    <button
                      onClick={() => setShowQuickTips(false)}
                      className="p-1 rounded-lg text-[#736E65] hover:text-[#1C1917] cursor-pointer ml-2"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="pt-4 text-xs leading-relaxed space-y-2">
                  {quickTipsTab === 'psychology' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="p-3 bg-white dark:bg-[#1B1A18] rounded-2xl border border-[#E8D0C5] dark:border-[#383630]">
                        <div className="font-semibold text-[#C96442]">1. Never say "Hi guys welcome back"</div>
                        <p className="text-[11px] text-[#736E65] dark:text-[#9E9A90] mt-1">
                          Intro pleasantries lose 35% of viewers before second 5. Start immediately on the verb or warning.
                        </p>
                      </div>
                      <div className="p-3 bg-white dark:bg-[#1B1A18] rounded-2xl border border-[#E8D0C5] dark:border-[#383630]">
                        <div className="font-semibold text-[#C96442]">2. Match the Thumbnail Promise</div>
                        <p className="text-[11px] text-[#736E65] dark:text-[#9E9A90] mt-1">
                          If your thumbnail shows a damaged pin, that exact pin must be on camera in frame 1.
                        </p>
                      </div>
                      <div className="p-3 bg-white dark:bg-[#1B1A18] rounded-2xl border border-[#E8D0C5] dark:border-[#383630]">
                        <div className="font-semibold text-[#C96442]">3. Concrete Timeline Anchor</div>
                        <p className="text-[11px] text-[#736E65] dark:text-[#9E9A90] mt-1">
                          Say "Over the next 6 minutes" to give the viewer an explicit boundary for their time investment.
                        </p>
                      </div>
                    </div>
                  )}

                  {quickTipsTab === 'retention' && (
                    <div className="p-3 bg-white dark:bg-[#1B1A18] rounded-2xl border border-[#E8D0C5] dark:border-[#383630]">
                      <div className="font-semibold text-[#C96442] mb-1">How to Keep Viewers Through Minute 4:</div>
                      <p className="text-[11px] text-[#736E65] dark:text-[#9E9A90]">
                        Plant a secondary question early: "I will show you the step-by-step fix, but first we have to address why the factory manual gets the torque spec wrong, which we'll cover right after step 2."
                      </p>
                    </div>
                  )}

                  {quickTipsTab === 'delivery' && (
                    <div className="p-3 bg-white dark:bg-[#1B1A18] rounded-2xl border border-[#E8D0C5] dark:border-[#383630]">
                      <div className="font-semibold text-[#C96442] mb-1">Pacing and Tone:</div>
                      <p className="text-[11px] text-[#736E65] dark:text-[#9E9A90]">
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
                <div className={`p-6 rounded-3xl border shadow-xs space-y-4 ${
                  isDarkMode ? 'bg-[#242320] border-[#383630]' : 'bg-white border-[#E8E5DC]'
                }`}>
                  <div className="flex items-center justify-between pb-2 border-b border-[#E8E5DC] dark:border-[#302F2A]">
                    <div>
                      <h3 className="font-serif text-lg font-semibold">1. Three CTR-Optimized Title Variations</h3>
                      <p className="text-xs text-[#736E65] dark:text-[#9E9A90]">
                        Engineered for high CTR on mobile YouTube home feed (45–65 characters).
                      </p>
                    </div>
                  </div>

                  {/* Title 1: Curiosity Debunk (Recommended) */}
                  <div className="p-4 rounded-2xl bg-[#FAF0EB] dark:bg-[#2F241F] border border-[#E8D0C5] dark:border-[#4A342B] space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#C96442] flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Curiosity Debunk (Algorithm Breakout — Recommended)</span>
                      </span>
                      <button
                        onClick={() => handleCopy(latestBrief?.titles?.title_2_curiosity || topOpp?.sample_titles?.[0] || `The ${selectedNiche} Fix Most People Get Completely Wrong`, 't1')}
                        className="text-xs text-[#736E65] dark:text-[#9E9A90] hover:text-[#C96442] flex items-center gap-1 cursor-pointer font-medium"
                      >
                        {copiedKey === 't1' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedKey === 't1' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <div className="font-serif text-base font-semibold text-[#1C1917] dark:text-white">
                      "{latestBrief?.titles?.title_2_curiosity || topOpp?.sample_titles?.[0] || `The ${selectedNiche} Fix Most People Get Completely Wrong`}"
                    </div>
                    <div className="text-[11px] text-[#736E65] dark:text-[#9E9A90] flex items-center justify-between">
                      <span><strong>Why it clicks:</strong> Challenges common knowledge and triggers fear of doing it wrong.</span>
                      <span className="font-mono text-[10px]">52 chars</span>
                    </div>
                  </div>

                  {/* Title 2: Search SEO Floor */}
                  <div className="p-4 rounded-2xl bg-[#F5F3EC] dark:bg-[#2B2A26] border border-[#E8E5DC] dark:border-[#383630] space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#1C1917] dark:text-white flex items-center gap-1.5">
                        <Search className="w-3.5 h-3.5 text-blue-500" />
                        <span>Search Match (SEO Floor for Evergreen Views)</span>
                      </span>
                      <button
                        onClick={() => handleCopy(latestBrief?.titles?.title_1_search_match || topOpp?.sample_titles?.[1] || `How to Properly Service ${topOpp?.cluster_label} (Step by Step)`, 't2')}
                        className="text-xs text-[#736E65] dark:text-[#9E9A90] hover:text-[#C96442] flex items-center gap-1 cursor-pointer font-medium"
                      >
                        {copiedKey === 't2' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedKey === 't2' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <div className="font-serif text-sm font-semibold text-[#1C1917] dark:text-white">
                      "{latestBrief?.titles?.title_1_search_match || topOpp?.sample_titles?.[1] || `How to Properly Service ${topOpp?.cluster_label} (Step by Step)`}"
                    </div>
                    <div className="text-[11px] text-[#736E65] dark:text-[#9E9A90] flex items-center justify-between">
                      <span><strong>Why it clicks:</strong> Captures high-intent search queries month after month.</span>
                      <span className="font-mono text-[10px]">48 chars</span>
                    </div>
                  </div>

                  {/* Title 3: Value / ROI */}
                  <div className="p-4 rounded-2xl bg-[#F5F3EC] dark:bg-[#2B2A26] border border-[#E8E5DC] dark:border-[#383630] space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#1C1917] dark:text-white flex items-center gap-1.5">
                        <Target className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Value / Outcome Angle (High ROI)</span>
                      </span>
                      <button
                        onClick={() => handleCopy(latestBrief?.titles?.title_3_value || `I Saved $850 Fixing ${topOpp?.cluster_label} in 20 Minutes`, 't3')}
                        className="text-xs text-[#736E65] dark:text-[#9E9A90] hover:text-[#C96442] flex items-center gap-1 cursor-pointer font-medium"
                      >
                        {copiedKey === 't3' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedKey === 't3' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <div className="font-serif text-sm font-semibold text-[#1C1917] dark:text-white">
                      "{latestBrief?.titles?.title_3_value || `I Saved $850 Fixing ${topOpp?.cluster_label} in 20 Minutes`}"
                    </div>
                    <div className="text-[11px] text-[#736E65] dark:text-[#9E9A90] flex items-center justify-between">
                      <span><strong>Why it clicks:</strong> Tangible dollar savings and low time requirement.</span>
                      <span className="font-mono text-[10px]">49 chars</span>
                    </div>
                  </div>
                </div>

                {/* SECTION 2: VERBATIM HOOK SCRIPT WITH 4 PSYCHOLOGY ANGLES */}
                <div className={`p-6 rounded-3xl border shadow-xs space-y-4 ${
                  isDarkMode ? 'bg-[#242320] border-[#383630]' : 'bg-white border-[#E8E5DC]'
                }`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#E8E5DC] dark:border-[#302F2A]">
                    <div>
                      <h3 className="font-serif text-lg font-semibold">2. Opening 20-Second Spoken Hook Script</h3>
                      <p className="text-xs text-[#736E65] dark:text-[#9E9A90]">
                        Choose the psychological angle that best fits your channel tone.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowTeleprompter(true)}
                        className="text-xs text-[#C96442] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Video className="w-3.5 h-3.5" />
                        <span>Prompter View</span>
                      </button>
                      <button
                        onClick={() => handleCopy(selectedHookData.script, 'hook_active', 'Hook copied')}
                        className="text-xs bg-[#F5F3EC] dark:bg-[#2B2A26] border border-[#E8E5DC] dark:border-[#383630] px-3 py-1.5 rounded-xl font-medium flex items-center gap-1 cursor-pointer hover:border-[#C96442]"
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
                        className={`p-2.5 rounded-2xl border text-left transition cursor-pointer ${
                          activeHookStyle === angle
                            ? 'bg-[#C96442] text-white border-[#C96442] shadow-xs'
                            : 'bg-[#F5F3EC] dark:bg-[#2B2A26] border-[#E8E5DC] dark:border-[#383630] text-[#736E65] dark:text-[#9E9A90] hover:text-[#1C1917] dark:hover:text-white'
                        }`}
                      >
                        <div className="text-[10px] font-mono uppercase font-bold tracking-tight">{hookVariations[angle].badge}</div>
                        <div className="text-xs font-semibold mt-0.5 truncate">{hookVariations[angle].label.split('&')[0]}</div>
                      </button>
                    ))}
                  </div>

                  {/* Active Script Display */}
                  <div className="p-5 rounded-2xl bg-[#FAF0EB] dark:bg-[#2F241F] border border-[#E8D0C5] dark:border-[#4A342B] space-y-3">
                    <div className="flex items-center justify-between text-xs text-[#C96442]">
                      <span className="font-semibold uppercase tracking-wider font-mono text-[10px]">
                        Speaking Cadence: ~140 WPM • Timing: 0:00 – 0:20
                      </span>
                      <span className="text-[11px] font-medium">{selectedHookData.label}</span>
                    </div>

                    <div className="font-serif text-base sm:text-lg leading-relaxed text-[#1C1917] dark:text-white italic">
                      "{selectedHookData.script}"
                    </div>

                    <div className="pt-2 border-t border-[#E8D0C5] dark:border-[#4A342B] text-xs text-[#736E65] dark:text-[#9E9A90] space-y-1">
                      <div><strong>Director Delivery Notes:</strong> {selectedHookData.delivery}</div>
                      <div><strong>Psychological Mechanism:</strong> {selectedHookData.whyItWorks}</div>
                    </div>
                  </div>
                </div>

                {/* SECTION 3: MINUTE-BY-MINUTE RETENTION PACING */}
                <div className={`p-6 rounded-3xl border shadow-xs space-y-4 ${
                  isDarkMode ? 'bg-[#242320] border-[#383630]' : 'bg-white border-[#E8E5DC]'
                }`}>
                  <div className="flex items-center justify-between pb-2 border-b border-[#E8E5DC] dark:border-[#302F2A]">
                    <div>
                      <h3 className="font-serif text-lg font-semibold">3. Video Outline & Retention Resets</h3>
                      <p className="text-xs text-[#736E65] dark:text-[#9E9A90]">
                        Minute-by-minute beats designed to prevent the 2:00 viewer drop-off.
                      </p>
                    </div>
                    <span className="text-xs font-mono text-[#C96442]">Target Duration: 6–8 mins</span>
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
                        className="p-3.5 rounded-2xl bg-[#F5F3EC] dark:bg-[#2B2A26] border border-[#E8E5DC] dark:border-[#383630] flex items-start gap-3.5"
                      >
                        <div className="font-mono text-xs font-bold text-[#C96442] shrink-0 w-24 pt-0.5">
                          {beat.time}
                        </div>
                        <div className="flex-1 space-y-0.5">
                          <div className="text-xs font-semibold text-[#1C1917] dark:text-white">
                            {beat.beat}
                          </div>
                          <div className="text-xs text-[#736E65] dark:text-[#9E9A90] leading-relaxed">
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
                <div className={`p-6 rounded-3xl border shadow-xs space-y-4 ${
                  isDarkMode ? 'bg-[#242320] border-[#383630]' : 'bg-white border-[#E8E5DC]'
                }`}>
                  <div className="flex items-center justify-between pb-2 border-b border-[#E8E5DC] dark:border-[#302F2A]">
                    <div>
                      <h3 className="font-serif text-lg font-semibold">4. Thumbnail Art Direction</h3>
                      <p className="text-xs text-[#736E65] dark:text-[#9E9A90]">
                        Visual composition for maximum mobile click-through rate.
                      </p>
                    </div>
                    <Eye className="w-4 h-4 text-[#C96442]" />
                  </div>

                  {/* Thumbnail Concept Mockup Box */}
                  <div className="p-4 rounded-2xl bg-[#FAF0EB] dark:bg-[#2F241F] border border-[#E8D0C5] dark:border-[#4A342B] space-y-3">
                    <div className="aspect-video rounded-xl bg-[#1C1917] text-white p-4 flex flex-col justify-between relative overflow-hidden shadow-inner">
                      <div className="flex items-center justify-between z-10">
                        <span className="text-[10px] font-mono uppercase bg-red-600 px-2 py-0.5 rounded font-bold text-white tracking-wider">
                          High Contrast
                        </span>
                        <span className="text-[10px] font-mono text-zinc-400">1280 × 720</span>
                      </div>

                      <div className="z-10 text-center my-auto space-y-1">
                        <div className="text-xl sm:text-2xl font-black font-sans tracking-tight text-amber-300 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
                          "{latestBrief?.thumbnail_direction?.text_overlay || 'STOP DOING THIS!'}"
                        </div>
                        <div className="text-[11px] text-zinc-300 max-w-xs mx-auto drop-shadow-md">
                          {latestBrief?.thumbnail_direction?.primary_image || 'Split comparison: Seized stuck slide pin vs properly greased floating pin'}
                        </div>
                      </div>

                      <div className="z-10 flex items-center justify-between text-[10px] font-mono text-zinc-400 border-t border-zinc-800/80 pt-1">
                        <span>Red Warning Arrow</span>
                        <span>Facial Reaction (Skeptical)</span>
                      </div>

                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none" />
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-white dark:bg-[#1B1A18] border border-[#E8D0C5] dark:border-[#383630]">
                        <div className="text-[10px] font-mono uppercase text-[#736E65] dark:text-[#9E9A90]">Color Palette</div>
                        <div className="font-semibold text-xs mt-0.5">{latestBrief?.thumbnail_direction?.color_signal || 'High-Sat Amber & Red'}</div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white dark:bg-[#1B1A18] border border-[#E8D0C5] dark:border-[#383630]">
                        <div className="text-[10px] font-mono uppercase text-[#736E65] dark:text-[#9E9A90]">Focal Point</div>
                        <div className="font-semibold text-xs mt-0.5">{latestBrief?.thumbnail_direction?.focal_point || 'Hands with Caliper Pin'}</div>
                      </div>
                    </div>

                    {/* Ready-to-copy AI Image Prompt */}
                    <div className="p-3 rounded-xl bg-white dark:bg-[#1B1A18] border border-[#E8D0C5] dark:border-[#383630] space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono text-[10px] uppercase font-bold text-[#C96442]">AI Generation Prompt (Midjourney / Flux)</span>
                        <button
                          onClick={() => handleCopy(generatedThumbnailPrompt, 'thumb_prompt', 'Thumbnail prompt copied!')}
                          className="text-[11px] text-[#736E65] hover:text-[#C96442] flex items-center gap-1 cursor-pointer font-medium"
                        >
                          {copiedKey === 'thumb_prompt' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedKey === 'thumb_prompt' ? 'Copied' : 'Copy Prompt'}</span>
                        </button>
                      </div>
                      <p className="text-[11px] font-mono text-[#736E65] dark:text-[#9E9A90] leading-relaxed line-clamp-3">
                        {generatedThumbnailPrompt}
                      </p>
                    </div>
                  </div>
                </div>

                {/* SECTION 5: PRE-FLIGHT SHOOT CHECKLIST */}
                <div className={`p-6 rounded-3xl border shadow-xs space-y-4 ${
                  isDarkMode ? 'bg-[#242320] border-[#383630]' : 'bg-white border-[#E8E5DC]'
                }`}>
                  <div className="flex items-center justify-between pb-2 border-b border-[#E8E5DC] dark:border-[#302F2A]">
                    <div>
                      <h3 className="font-serif text-lg font-semibold">5. Pre-Flight Shoot Checklist</h3>
                      <p className="text-xs text-[#736E65] dark:text-[#9E9A90]">
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
                        className={`p-3 rounded-2xl border transition cursor-pointer flex items-center gap-3 ${
                          checkedItems[item.key]
                            ? 'bg-[#FAF0EB] dark:bg-[#2F241F] border-[#E8D0C5] dark:border-[#4A342B]'
                            : 'bg-[#F5F3EC] dark:bg-[#2B2A26] border-[#E8E5DC] dark:border-[#383630] opacity-80'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-lg flex items-center justify-center transition ${
                          checkedItems[item.key]
                            ? 'bg-[#C96442] text-white'
                            : 'bg-white dark:bg-[#1B1A18] border border-[#E8E5DC] dark:border-[#383630]'
                        }`}>
                          {checkedItems[item.key] && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                        <span className={`text-xs ${checkedItems[item.key] ? 'font-medium text-[#1C1917] dark:text-white' : 'text-[#736E65] dark:text-[#9E9A90]'}`}>
                          {item.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* SECTION 6: CONVENIENT EXPORT & PRINT */}
                <div className={`p-5 rounded-3xl border shadow-xs space-y-3 ${
                  isDarkMode ? 'bg-[#242320] border-[#383630]' : 'bg-white border-[#E8E5DC]'
                }`}>
                  <div className="text-xs font-semibold text-[#1C1917] dark:text-white">
                    Export & Share Production Blueprint
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        const fullPlan = `# AutoSignal Production Brief: ${topOpp?.cluster_label}\n\n## Title Candidates\n1. ${latestBrief?.titles?.title_2_curiosity || topOpp?.sample_titles?.[0]}\n2. ${latestBrief?.titles?.title_1_search_match || topOpp?.sample_titles?.[1]}\n3. ${latestBrief?.titles?.title_3_value}\n\n## Opening Hook Script\n${selectedHookData.script}\n\n## Thumbnail Concept\nOverlay: ${latestBrief?.thumbnail_direction?.text_overlay}\nDescription: ${latestBrief?.thumbnail_direction?.primary_image}\n\n## Pacing Outline\n${(latestBrief?.pacing_outline || []).map(b => `- ${b.time}: ${b.beat} (${b.action})`).join('\n')}`;
                        handleCopy(fullPlan, 'export_markdown', 'Full plan copied as Markdown!');
                      }}
                      className="p-2.5 rounded-xl bg-[#F5F3EC] dark:bg-[#2B2A26] border border-[#E8E5DC] dark:border-[#383630] text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer hover:border-[#C96442]"
                    >
                      <FileText className="w-3.5 h-3.5 text-[#C96442]" />
                      <span>Copy All (Markdown)</span>
                    </button>

                    <button
                      onClick={() => window.print()}
                      className="p-2.5 rounded-xl bg-[#F5F3EC] dark:bg-[#2B2A26] border border-[#E8E5DC] dark:border-[#383630] text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer hover:border-[#C96442]"
                    >
                      <Printer className="w-3.5 h-3.5 text-[#736E65]" />
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
        {appMode === 'video-studio' && (
          <div className="p-4 md:p-8 max-w-7xl w-full mx-auto space-y-6 animate-fade-in">
            {/* Cinematic Studio Header Banner */}
            <div className="p-6 md:p-8 rounded-3xl bg-gradient-to-br from-[#121110] via-[#1A1816] to-[#251A18] text-white border border-[#3A332C] shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-[#C96442]/10 rounded-full blur-3xl pointer-events-none" />

              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2 max-w-2xl">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      <Film className="w-3.5 h-3.5 text-purple-400" />
                      <span>AI VIDEO ENGINE V1</span>
                    </span>
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                      <span>Studio Ready</span>
                    </span>
                  </div>

                  <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-white">
                    AI Video Studio & Viral Shorts Generator
                  </h1>
                  <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                    Convert YouTube outlier intelligence directly into high-retention video formats. Create viral Shorts, faceless AI explainers, and split-screen reaction videos with kinetic captions and SEO packaging.
                  </p>
                </div>

                {/* Aspect Ratio & Platform Preset Toggle */}
                <div className="bg-[#121211]/80 backdrop-blur-md p-3.5 rounded-2xl border border-[#3A332C] space-y-2 shrink-0">
                  <div className="text-[10px] font-mono uppercase text-zinc-400 font-bold flex items-center justify-between">
                    <span>Aspect Ratio</span>
                    <span className="text-amber-400">{videoAspectRatio === '9:16' ? 'Vertical 1080×1920' : 'Landscape 1920×1080'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-[#1F1E1B] p-1 rounded-xl border border-[#302F2A]">
                    <button
                      onClick={() => setVideoAspectRatio('9:16')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        videoAspectRatio === '9:16'
                          ? 'bg-[#C96442] text-white shadow-xs'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>9:16 Shorts/Reels</span>
                    </button>
                    <button
                      onClick={() => setVideoAspectRatio('16:9')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        videoAspectRatio === '16:9'
                          ? 'bg-[#C96442] text-white shadow-xs'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      <Monitor className="w-3.5 h-3.5" />
                      <span>16:9 YouTube</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Studio Workspace Mode Selector */}
              <div className="mt-8 pt-6 border-t border-[#3A332C] flex flex-wrap items-center justify-between gap-3 relative z-10">
                <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[#141312] border border-[#3A332C]">
                  <button
                    onClick={() => setStudioSubMode('prompt_generator')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                      studioSubMode === 'prompt_generator'
                        ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Neural AI Prompt Studio</span>
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      <Lock className="w-2.5 h-2.5" />
                      <span>UNAVAILABLE</span>
                    </span>
                  </button>

                  <button
                    onClick={() => setStudioSubMode('clipper')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer ${
                      studioSubMode === 'clipper'
                        ? 'bg-[#C96442] text-white shadow-md'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    <span>Outlier Clipper & Remixer</span>
                    <span className="text-[10px] font-mono text-zinc-300 opacity-80">(5 Steps)</span>
                  </button>
                </div>

                <div className="text-xs text-zinc-400 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <span>Prompt Synthesis Active • Video Generation Paused (Closed Alpha)</span>
                </div>
              </div>

              {/* YouTube Upload-Style Horizontal Step Stepper (Shown when in Clipper Mode) */}
              {studioSubMode === 'clipper' && (
                <div className="mt-6 pt-5 border-t border-[#3A332C]/60 relative z-10">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
                    {[
                      { num: 1, title: 'Format & Style', subtitle: videoFormat === 'clipper' ? 'Viral Clipper' : videoFormat === 'faceless' ? 'Faceless AI' : 'Split-Screen' },
                      { num: 2, title: 'Video Source', subtitle: selectedOutlierVideo ? 'Outlier Picked' : 'Topic Input' },
                      { num: 3, title: 'Captions & Voice', subtitle: `${captionStyle} • ${voiceoverTone}` },
                      { num: 4, title: 'Details & SEO', subtitle: 'Title & Thumbnail' },
                      { num: 5, title: 'Review & Render', subtitle: 'Live Mockup' }
                    ].map(s => {
                      const isActive = videoStudioStep === s.num;
                      const isDone = videoStudioStep > s.num;
                      return (
                        <button
                          key={s.num}
                          onClick={() => setVideoStudioStep(s.num as any)}
                          className={`text-left p-2.5 sm:p-3 rounded-2xl border transition-all cursor-pointer relative min-w-0 ${
                            isActive
                              ? 'bg-purple-900/30 border-purple-500 shadow-md shadow-purple-950/50'
                              : isDone
                              ? 'bg-[#1C1A18] border-emerald-500/40 text-zinc-300'
                              : 'bg-[#181716] border-[#2C2A26] text-zinc-500'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                              isActive
                                ? 'bg-purple-500 text-white'
                                : isDone
                                ? 'bg-emerald-500 text-white'
                                : 'bg-zinc-800 text-zinc-400'
                            }`}>
                              {isDone ? <Check className="w-3 h-3 stroke-[3]" /> : s.num}
                            </span>
                            <span className={`text-xs font-semibold truncate ${isActive ? 'text-white' : ''}`}>
                              {s.title}
                            </span>
                          </div>
                          <div className="text-[10px] text-zinc-400 mt-1 truncate pl-7">
                            {s.subtitle}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ─── NEURAL AI VIDEO PROMPT STUDIO (UNAVAILABLE FOR NOW) ────────── */}
            {studioSubMode === 'prompt_generator' && (
              <div className="space-y-6">
                {/* Engine Status & Closed Alpha Banner */}
                <div className="p-5 rounded-3xl bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-purple-500/10 border border-amber-500/30 shadow-sm relative overflow-hidden">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/40 mt-0.5">
                        <Lock className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-amber-300">
                            AI Video Generation Engine: Unavailable For Now
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold uppercase tracking-wider">
                            Closed Alpha
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                            Quota Paused
                          </span>
                        </div>
                        <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-[#B0ABA0]' : 'text-[#605C55]'}`}>
                          Diffusion rendering clusters for Google Veo 2, Runway Gen-3 Alpha, and OpenAI Sora are currently in private invite-only testing. The complete visual prompt engineering workspace, camera trajectory director, and negative prompt tokenizer below are fully functional for crafting and testing prompts.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => {
                          showToast('⚠️ AI Video Generation is currently paused for closed alpha testing. Prompt saved!', 'error');
                        }}
                        className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
                      >
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Alpha Status Details</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Main Console Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* LEFT COLUMN: PROMPT INPUT & OPTICAL DIRECTORS (8 COLS) */}
                  <div className="lg:col-span-8 space-y-6">
                    {/* 1. Model Architecture Selector */}
                    <div className={`p-5 rounded-3xl border transition-all space-y-3 ${
                      isDarkMode ? 'bg-[#242320] border-[#383630]' : 'bg-white border-[#E8E5DC]'
                    }`}>
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold uppercase tracking-wider text-[#736E65] dark:text-[#9E9A90] flex items-center gap-2">
                          <Cpu className="w-3.5 h-3.5 text-purple-400" />
                          <span>Target Video Diffusion Engine</span>
                        </label>
                        <span className="text-[10px] font-mono text-zinc-400">Select architecture</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {[
                          {
                            id: 'veo-2',
                            name: 'Google Veo 2',
                            badge: 'Cinematic 60fps',
                            desc: 'Spatio-temporal diffusion transformer with high physical accuracy and film lighting.',
                            specs: '1080p • 60fps • 16-bit raw'
                          },
                          {
                            id: 'gen-3',
                            name: 'Runway Gen-3 Alpha',
                            badge: 'Kinetic Motion',
                            desc: 'Ultra-fast motion dynamics, fluid simulations, and high-energy particle physics.',
                            specs: '1080p • 30fps • 10s loop'
                          },
                          {
                            id: 'sora-1',
                            name: 'OpenAI Sora v1.2',
                            badge: 'World Physics',
                            desc: 'Deep world modeling, consistent geometry across continuous multi-angle cuts.',
                            specs: '1080p • 24fps • Spatial depth'
                          },
                          {
                            id: 'dream-1.5',
                            name: 'Luma Dream Machine',
                            badge: 'Rapid Render',
                            desc: 'High-speed camera pans, realistic surface reflections, and dynamic lens flares.',
                            specs: '720p/1080p • Rapid queue'
                          }
                        ].map(m => {
                          const isSelected = aiVideoModel === m.id;
                          return (
                            <div
                              key={m.id}
                              onClick={() => {
                                setAiVideoModel(m.id);
                                showToast(`Selected model: ${m.name} (Closed Alpha)`, 'info');
                              }}
                              className={`p-3.5 rounded-2xl border transition-all cursor-pointer relative space-y-2 ${
                                isSelected
                                  ? 'border-purple-500 bg-purple-500/10 shadow-md ring-2 ring-purple-500/20'
                                  : isDarkMode
                                  ? 'bg-[#1B1A18] border-[#383630] hover:border-zinc-500'
                                  : 'bg-[#F9F8F5] border-[#E8E5DC] hover:border-zinc-400'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-xs flex items-center gap-1.5">
                                  <span>{m.name}</span>
                                  {isSelected && <Check className="w-3.5 h-3.5 text-purple-400 stroke-[3]" />}
                                </span>
                                <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 font-semibold flex items-center gap-1">
                                  <Lock className="w-2.5 h-2.5" />
                                  <span>{m.badge}</span>
                                </span>
                              </div>
                              <p className={`text-[11px] leading-relaxed ${isDarkMode ? 'text-[#9E9A90]' : 'text-[#736E65]'}`}>
                                {m.desc}
                              </p>
                              <div className="text-[10px] font-mono text-zinc-500 pt-1 border-t border-zinc-500/15">
                                {m.specs}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* 2. Visual Prompt Input Console */}
                    <div className={`p-5 rounded-3xl border transition-all space-y-4 ${
                      isDarkMode ? 'bg-[#242320] border-[#383630]' : 'bg-white border-[#E8E5DC]'
                    }`}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <label className="text-xs font-bold uppercase tracking-wider text-[#736E65] dark:text-[#9E9A90] flex items-center gap-2">
                            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                            <span>Visual & Optical Scene Prompt</span>
                          </label>
                          <p className={`text-[11px] mt-0.5 ${isDarkMode ? 'text-[#9E9A90]' : 'text-[#736E65]'}`}>
                            Detail subjects, actions, lighting atmosphere, lens focal length, and camera speed.
                          </p>
                        </div>

                        {/* Character and token counter */}
                        <div className="text-[11px] font-mono text-zinc-400 flex items-center gap-2 self-start sm:self-auto">
                          <span>{aiVideoPrompt.length} chars</span>
                          <span>•</span>
                          <span className="text-purple-400">~{Math.round(aiVideoPrompt.length / 4)} tokens</span>
                        </div>
                      </div>

                      {/* Main Textarea */}
                      <div className="relative">
                        <textarea
                          rows={4}
                          value={aiVideoPrompt}
                          onChange={e => setAiVideoPrompt(e.target.value)}
                          placeholder="Describe the cinematic scene in detail (e.g. 'Cinematic 8K macro push-in: High-precision diagnostic inspection of glowing red hot brake rotor disc components, atmospheric workshop haze, hyper-realistic reflections, 60fps slow motion, Unreal Engine 5 photorealism...')"
                          className="w-full p-4 rounded-2xl border bg-white dark:bg-[#1B1A18] border-[#E8E5DC] dark:border-[#383630] text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-purple-500 font-sans resize-y"
                        />
                      </div>

                      {/* Prompt Quick Actions */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => {
                              const enhancements = ', photorealistic 8K render, cinematic volumetric lighting, 35mm anamorphic lens, high-fidelity color grading, raytraced reflections, hyper-detailed textures, 60fps smooth motion';
                              if (!aiVideoPrompt.includes('photorealistic 8K')) {
                                setAiVideoPrompt(prev => prev.trim() + enhancements);
                                showToast('✨ Prompt enhanced with cinematic parameters!', 'success');
                              } else {
                                showToast('Prompt already contains cinematic parameters', 'info');
                              }
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600/15 hover:bg-purple-600/25 border border-purple-500/30 text-purple-300 text-xs font-semibold transition cursor-pointer"
                          >
                            <Wand2 className="w-3.5 h-3.5 text-purple-400" />
                            <span>Auto-Enhance Prompt</span>
                          </button>

                          <button
                            onClick={() => handleCopy(aiVideoPrompt, 'copy_prompt', 'AI Video Prompt copied!')}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-400/30 hover:border-zinc-400 text-xs font-semibold transition cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5 text-[#736E65]" />
                            <span>Copy Prompt</span>
                          </button>

                          <button
                            onClick={() => setAiVideoPrompt('')}
                            className="px-3 py-1.5 rounded-xl border border-zinc-400/20 text-xs text-zinc-500 hover:text-zinc-300 transition cursor-pointer"
                          >
                            Clear
                          </button>
                        </div>

                        <button
                          onClick={() => setShowNegativePrompt(!showNegativePrompt)}
                          className="text-xs text-purple-400 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <span>{showNegativePrompt ? 'Hide Negative Prompt' : '+ Add Negative Prompt'}</span>
                        </button>
                      </div>

                      {/* Tested Viral Outlier Inspiration Chips */}
                      <div className="space-y-2 pt-2 border-t border-zinc-500/15">
                        <div className="text-[11px] font-semibold text-[#736E65] dark:text-[#9E9A90]">
                          Tested Outlier Prompt Recipes (Click to load):
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            {
                              label: '🏎️ Automotive Diagnostic Macro',
                              prompt: 'Cinematic 8K macro push-in: High-precision diagnostic inspection of glowing red hot brake rotor disc components, atmospheric automotive workshop haze, dynamic anamorphic lens flare, photorealistic liquid brake fluid drop in ultra 120fps slow motion.',
                              motion: 'push_in',
                              strength: 7
                            },
                            {
                              label: '⚡ FinTech 3D Glassmorphism',
                              prompt: '3D isometric glassmorphism visualization of a digital financial liquidity network, glowing cyber neon data streams pulsing through transparent crystalline nodes, volumetric cinematic lighting, sleek dark studio environment, 60fps smooth pan.',
                              motion: 'pan_horizontal',
                              strength: 5
                            },
                            {
                              label: '🎙️ Dark Acoustic Podcast Studio',
                              prompt: 'Cinematic three-point lighting shot in a dark acoustic podcast studio, Shure SM7B microphone on boom arm in crisp foreground focus, warm 3200K tungsten ambient backlight, shallow depth of field, 35mm film grain, 24fps documentary look.',
                              motion: 'static_tripod',
                              strength: 3
                            },
                            {
                              label: '🔬 Bioluminescent Nature Macro',
                              prompt: 'Microscopic 8K macro time-lapse of bioluminescent deep sea spores reacting to an electrical pulse, vibrant turquoise and violet iridescent pigments, fluid camera orbit, National Geographic documentary cinematic grade.',
                              motion: 'orbit_360',
                              strength: 6
                            },
                            {
                              label: '🧗 Mountain FPV Drone Dive',
                              prompt: 'First-person FPV drone dive accelerating down a sheer mountain cliff at golden hour, aggressive motion blur on rocks, wind turbulence camera shake, ultra wide 14mm lens, high dynamic range 60fps.',
                              motion: 'crane_down',
                              strength: 9
                            }
                          ].map((p, idx) => (
                            <button
                              key={idx}
                              onClick={() => {
                                setAiVideoPrompt(p.prompt);
                                setAiCameraMotion(p.motion);
                                setAiMotionStrength(p.strength);
                                showToast(`Loaded preset: ${p.label}`, 'success');
                              }}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-medium border bg-[#F5F3EC] dark:bg-[#1B1A18] border-[#E8E5DC] dark:border-[#383630] hover:border-purple-500 hover:text-purple-400 transition cursor-pointer"
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Collapsible Negative Prompt Panel */}
                      {showNegativePrompt && (
                        <div className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800 space-y-2 animate-fade-in">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-semibold text-rose-400 flex items-center gap-1.5">
                              <span>Negative Exclusions (Artifact & Glitch Prevention)</span>
                            </label>
                            <span className="text-[10px] font-mono text-zinc-500">Excluded tokens</span>
                          </div>
                          <textarea
                            rows={2}
                            value={aiVideoNegativePrompt}
                            onChange={e => setAiVideoNegativePrompt(e.target.value)}
                            placeholder="blurry, distorted hands, morphing limbs, jitter, low quality, watermarks, frame skips, pixelation"
                            className="w-full p-3 rounded-xl border bg-black/40 border-zinc-700 text-xs text-zinc-300 font-mono resize-none focus:outline-none focus:ring-1 focus:ring-rose-500"
                          />
                          <p className="text-[10px] text-zinc-500">
                            Prevents unwanted AI video synthesis artifacts like limb warping, jittering edges, and low-res compression blocks.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* 3. Camera Trajectory & Kinetic Motion Director */}
                    <div className={`p-5 rounded-3xl border transition-all space-y-4 ${
                      isDarkMode ? 'bg-[#242320] border-[#383630]' : 'bg-white border-[#E8E5DC]'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="text-xs font-bold uppercase tracking-wider text-[#736E65] dark:text-[#9E9A90] flex items-center gap-2">
                            <Camera className="w-3.5 h-3.5 text-purple-400" />
                            <span>Camera Motion & Vector Trajectory</span>
                          </label>
                          <p className={`text-[11px] mt-0.5 ${isDarkMode ? 'text-[#9E9A90]' : 'text-[#736E65]'}`}>
                            Specify optical physics and camera path throughout the video generation.
                          </p>
                        </div>
                        <span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full font-bold">
                          6-DOF DIRECTOR
                        </span>
                      </div>

                      {/* 6 Camera Motion Vectors */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        {[
                          { id: 'push_in', label: 'Dolly Push-in', desc: 'Slow cinematic advance toward focal subject' },
                          { id: 'pull_out', label: 'Dolly Reverse', desc: 'Dramatic reveal pulling back from detail' },
                          { id: 'pan_horizontal', label: 'Panoramic Survey', desc: 'Wide sweeping horizontal tracking' },
                          { id: 'orbit_360', label: '360° Orbital Arc', desc: 'Fluid circular orbit around subject' },
                          { id: 'crane_down', label: 'Pedestal / Crane', desc: 'Vertical descending boom movement' },
                          { id: 'static_tripod', label: 'Static Macro', desc: 'Locked tripod with zero camera drift' }
                        ].map(c => {
                          const isSelected = aiCameraMotion === c.id;
                          return (
                            <button
                              key={c.id}
                              onClick={() => setAiCameraMotion(c.id)}
                              className={`p-3 rounded-2xl border text-left transition cursor-pointer space-y-1 ${
                                isSelected
                                  ? 'border-purple-500 bg-purple-500/15 shadow-sm ring-1 ring-purple-500/30'
                                  : isDarkMode
                                  ? 'bg-[#1B1A18] border-[#383630] hover:border-zinc-500'
                                  : 'bg-[#F9F8F5] border-[#E8E5DC] hover:border-zinc-400'
                              }`}
                            >
                              <div className="text-xs font-semibold flex items-center justify-between">
                                <span>{c.label}</span>
                                {isSelected && <span className="w-2 h-2 rounded-full bg-purple-400" />}
                              </div>
                              <div className={`text-[10px] leading-tight ${isDarkMode ? 'text-[#9E9A90]' : 'text-[#736E65]'}`}>
                                {c.desc}
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {/* Motion Strength Slider */}
                      <div className="space-y-2 pt-2 border-t border-zinc-500/15">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-[#736E65] dark:text-[#9E9A90]">
                            Kinetic Motion Strength: <span className="text-purple-400 font-mono font-bold">{aiMotionStrength} / 10</span>
                          </span>
                          <span className="text-[11px] font-mono text-zinc-400">
                            {aiMotionStrength >= 8 ? 'High-Velocity Dynamic' : aiMotionStrength >= 5 ? 'Balanced Cinematic' : 'Subtle Static'}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={1}
                          max={10}
                          value={aiMotionStrength}
                          onChange={e => setAiMotionStrength(parseInt(e.target.value, 10))}
                          className="w-full accent-purple-500 cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] font-mono text-zinc-500">
                          <span>1 (Subtle Micro-drift)</span>
                          <span>5 (Standard Cinematic Pacing)</span>
                          <span>10 (Aggressive FPV Action)</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT COLUMN: RENDER SPECS & GENERATION ACTIONS (4 COLS) */}
                  <div className="lg:col-span-4 space-y-6">
                    {/* Render Hardware & Format Spec Card */}
                    <div className={`p-5 rounded-3xl border transition-all space-y-4 ${
                      isDarkMode ? 'bg-[#242320] border-[#383630]' : 'bg-white border-[#E8E5DC]'
                    }`}>
                      <div className="border-b border-zinc-500/15 pb-3">
                        <h3 className="font-semibold text-xs uppercase tracking-wider text-[#736E65] dark:text-[#9E9A90] flex items-center gap-2">
                          <SlidersHorizontal className="w-3.5 h-3.5 text-purple-400" />
                          <span>Output Dimensions & Specs</span>
                        </h3>
                      </div>

                      {/* Aspect Ratio */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold">Aspect Ratio</label>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { id: '9:16', label: '9:16 Shorts', desc: '1080×1920' },
                            { id: '16:9', label: '16:9 YouTube', desc: '1920×1080' }
                          ].map(ar => (
                            <button
                              key={ar.id}
                              onClick={() => setVideoAspectRatio(ar.id as any)}
                              className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                                videoAspectRatio === ar.id
                                  ? 'bg-[#C96442] text-white border-[#C96442] font-semibold'
                                  : isDarkMode ? 'bg-[#1B1A18] border-[#383630]' : 'bg-[#F9F8F5] border-[#E8E5DC]'
                              }`}
                            >
                              <div className="text-xs font-bold">{ar.label}</div>
                              <div className="text-[10px] opacity-75">{ar.desc}</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Resolution */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold">Resolution</label>
                        <div className="grid grid-cols-2 gap-2">
                          {(['1080p', '4k'] as const).map(res => (
                            <button
                              key={res}
                              onClick={() => setAiVideoResolution(res)}
                              className={`p-2 rounded-xl border text-center text-xs transition cursor-pointer ${
                                aiVideoResolution === res
                                  ? 'bg-purple-600 text-white border-purple-600 font-semibold'
                                  : isDarkMode ? 'bg-[#1B1A18] border-[#383630]' : 'bg-[#F9F8F5] border-[#E8E5DC]'
                              }`}
                            >
                              <span className="uppercase font-bold">{res}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Framerate */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold">Framerate (FPS)</label>
                        <div className="grid grid-cols-3 gap-2">
                          {([24, 30, 60] as const).map(fps => (
                            <button
                              key={fps}
                              onClick={() => setAiVideoFps(fps)}
                              className={`p-2 rounded-xl border text-center text-xs transition cursor-pointer ${
                                aiVideoFps === fps
                                  ? 'bg-purple-600 text-white border-purple-600 font-semibold'
                                  : isDarkMode ? 'bg-[#1B1A18] border-[#383630]' : 'bg-[#F9F8F5] border-[#E8E5DC]'
                              }`}
                            >
                              <span className="font-bold">{fps} fps</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Random Seed Controller */}
                      <div className="space-y-1.5 pt-2 border-t border-zinc-500/15">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold">Random Generation Seed</label>
                          <button
                            onClick={() => {
                              const newSeed = String(Math.floor(1000000 + Math.random() * 9000000));
                              setAiVideoSeed(newSeed);
                              showToast(`Randomized seed: ${newSeed}`, 'info');
                            }}
                            className="text-[11px] text-purple-400 hover:underline cursor-pointer flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Randomize</span>
                          </button>
                        </div>
                        <input
                          type="text"
                          value={aiVideoSeed}
                          onChange={e => setAiVideoSeed(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border bg-white dark:bg-[#1B1A18] border-[#E8E5DC] dark:border-[#383630] font-mono text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
                        />
                      </div>
                    </div>

                    {/* THE ACTION CONSOLE: UNAVAILABLE STATE IMPLEMENTATION */}
                    <div className="p-5 rounded-3xl bg-gradient-to-br from-[#1A1816] to-[#251A18] border border-[#3A332C] text-white shadow-xl space-y-4">
                      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                        <span className="text-xs font-mono uppercase font-bold text-amber-400 flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5" />
                          <span>Generation Console</span>
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold uppercase border border-amber-500/30">
                          Unavailable
                        </span>
                      </div>

                      <p className="text-xs text-zinc-300 leading-relaxed">
                        Direct video rendering with <span className="text-purple-300 font-bold">{aiVideoModel.toUpperCase()}</span> is currently disabled in this environment. You can copy the engineered prompt, download the JSON production spec, or test the 5-step outlier clipper.
                      </p>

                      {/* Primary Generate Button (Explicitly marked Unavailable) */}
                      <button
                        onClick={() => {
                          showToast('⚠️ AI Video Generation is currently unavailable (Closed Alpha). The prompt engine is fully available for crafting and copying!', 'error');
                        }}
                        className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-zinc-300 font-semibold text-xs shadow-md transition active:scale-[0.98] cursor-not-allowed group"
                      >
                        <Lock className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                        <span className="text-white font-bold">Generate Video with {aiVideoModel.toUpperCase()} (Unavailable for now)</span>
                      </button>

                      {/* Secondary Actions that work completely */}
                      <div className="space-y-2 pt-2 border-t border-zinc-800">
                        {/* Copy Master Prompt */}
                        <button
                          onClick={() => {
                            const fullSpec = `MODEL: ${aiVideoModel.toUpperCase()}\nPROMPT:\n${aiVideoPrompt}\n\nNEGATIVE PROMPT:\n${aiVideoNegativePrompt}\n\nCAMERA MOTION: ${aiCameraMotion} (Motion Strength: ${aiMotionStrength}/10)\nASPECT RATIO: ${videoAspectRatio} | RESOLUTION: ${aiVideoResolution} | FPS: ${aiVideoFps} | SEED: ${aiVideoSeed}`;
                            handleCopy(fullSpec, 'copy_master_prompt', 'Master Prompt & Spec copied to clipboard!');
                          }}
                          className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-semibold text-zinc-200 transition cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5 text-purple-400" />
                          <span>Copy Full Prompt & Motion Spec</span>
                        </button>

                        {/* Export JSON Spec */}
                        <button
                          onClick={() => {
                            const promptBundle = {
                              engine: 'AutoSignal Neural Video Synthesizer',
                              status: 'closed_alpha_preview',
                              model: aiVideoModel,
                              visual_prompt: aiVideoPrompt,
                              negative_prompt: aiVideoNegativePrompt,
                              camera: {
                                motion_vector: aiCameraMotion,
                                motion_strength: aiMotionStrength,
                              },
                              render_spec: {
                                aspect_ratio: videoAspectRatio,
                                resolution: aiVideoResolution,
                                fps: aiVideoFps,
                                seed: aiVideoSeed,
                              },
                              exported_at: new Date().toISOString()
                            };
                            const blob = new Blob([JSON.stringify(promptBundle, null, 2)], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `ai_video_prompt_${aiVideoModel}_${Date.now()}.json`;
                            a.click();
                            URL.revokeObjectURL(url);
                            showToast('Downloaded AI Video Prompt Spec (.JSON)!', 'success');
                          }}
                          className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-semibold text-zinc-200 transition cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5 text-[#C96442]" />
                          <span>Export Prompt Spec (.JSON)</span>
                        </button>

                        {/* Switch to Clipper */}
                        <button
                          onClick={() => setStudioSubMode('clipper')}
                          className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-xs font-semibold text-purple-300 transition cursor-pointer"
                        >
                          <Scissors className="w-3.5 h-3.5" />
                          <span>Switch to Outlier Clipper (5 Steps)</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ─── 5-STEP OUTLIER CLIPPER & REMIXER WIZARD ────────────────────── */}
            {studioSubMode === 'clipper' && (
              <div className={`p-6 md:p-8 rounded-3xl border shadow-sm transition-all ${
                isDarkMode ? 'bg-[#242320] border-[#383630]' : 'bg-white border-[#E8E5DC]'
              }`}>
                {/* ─── STEP 1: FORMAT & AI PRODUCTION STYLE ─────────────────────── */}
                {videoStudioStep === 1 && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="font-serif text-xl font-bold">Step 1: Choose Video Format & AI Production Style</h2>
                      <p className={`text-xs mt-1 ${isDarkMode ? 'text-[#9E9A90]' : 'text-[#736E65]'}`}>
                        Select how AutoSignal synthesizes video assets from outlier research.
                      </p>
                    </div>

                  {/* 3 Major Format Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Format A: Viral Outlier Clipper */}
                    <div
                      onClick={() => setVideoFormat('clipper')}
                      className={`p-5 rounded-2xl border transition-all cursor-pointer space-y-3 relative ${
                        videoFormat === 'clipper'
                          ? 'border-purple-500 bg-purple-500/10 shadow-md ring-2 ring-purple-500/20'
                          : isDarkMode ? 'bg-[#1B1A18] border-[#383630] hover:border-zinc-500' : 'bg-[#F9F8F5] border-[#E8E5DC] hover:border-zinc-400'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold">
                          <Scissors className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-semibold">
                          Recommended
                        </span>
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm">Viral Outlier Clipper</h3>
                        <p className={`text-xs mt-1 leading-relaxed ${isDarkMode ? 'text-[#9E9A90]' : 'text-[#736E65]'}`}>
                          Automatically extracts high-velocity retention spikes from long-form YouTube outliers. Adds 3 hook variations, dynamic zooms, and fast cuts.
                        </p>
                      </div>
                      <div className="pt-2 border-t border-zinc-500/20 text-[11px] font-mono text-purple-400 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Highest RPM & Organic Discovery</span>
                      </div>
                    </div>

                    {/* Format B: Faceless AI Explainer */}
                    <div
                      onClick={() => setVideoFormat('faceless')}
                      className={`p-5 rounded-2xl border transition-all cursor-pointer space-y-3 relative ${
                        videoFormat === 'faceless'
                          ? 'border-indigo-500 bg-indigo-500/10 shadow-md ring-2 ring-indigo-500/20'
                          : isDarkMode ? 'bg-[#1B1A18] border-[#383630] hover:border-zinc-500' : 'bg-[#F9F8F5] border-[#E8E5DC] hover:border-zinc-400'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
                          <Wand2 className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-semibold">
                          100% Automated
                        </span>
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm">Faceless AI Explainer</h3>
                        <p className={`text-xs mt-1 leading-relaxed ${isDarkMode ? 'text-[#9E9A90]' : 'text-[#736E65]'}`}>
                          Generates full script, synthetic voiceover narration, matches relevant stock B-roll, and renders kinetic subtitle tracks automatically.
                        </p>
                      </div>
                      <div className="pt-2 border-t border-zinc-500/20 text-[11px] font-mono text-indigo-400 flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Zero Camera or Microphone Needed</span>
                      </div>
                    </div>

                    {/* Format C: Split-Screen Reaction */}
                    <div
                      onClick={() => setVideoFormat('splitscreen')}
                      className={`p-5 rounded-2xl border transition-all cursor-pointer space-y-3 relative ${
                        videoFormat === 'splitscreen'
                          ? 'border-[#C96442] bg-[#C96442]/10 shadow-md ring-2 ring-[#C96442]/20'
                          : isDarkMode ? 'bg-[#1B1A18] border-[#383630] hover:border-zinc-500' : 'bg-[#F9F8F5] border-[#E8E5DC] hover:border-zinc-400'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="w-10 h-10 rounded-xl bg-[#C96442]/20 text-[#C96442] flex items-center justify-center font-bold">
                          <Layers className="w-5 h-5" />
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#C96442]/20 text-[#C96442] font-semibold">
                          Viral Retention
                        </span>
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm">Split-Screen Reaction & Gameplay</h3>
                        <p className={`text-xs mt-1 leading-relaxed ${isDarkMode ? 'text-[#9E9A90]' : 'text-[#736E65]'}`}>
                          Top half: Expert hook, breakdown or camera reaction. Bottom half: Engaging kinetic motion or satisfying visual loops for 85%+ retention.
                        </p>
                      </div>
                      <div className="pt-2 border-t border-zinc-500/20 text-[11px] font-mono text-[#C96442] flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>TikTok & Shorts Algorithm Favorite</span>
                      </div>
                    </div>
                  </div>

                  {/* Pacing & Target Duration Controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-zinc-500/20">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold">Editing Pacing Profile</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: 'fast', label: 'Fast (1.5s cuts)', desc: 'High energy, ADHD pacing' },
                          { id: 'dynamic', label: 'Balanced (2.8s cuts)', desc: 'Tutorial & breakdown' },
                          { id: 'documentary', label: 'Deep (4.5s cuts)', desc: 'Cinematic essay' }
                        ].map(p => (
                          <button
                            key={p.id}
                            onClick={() => setVideoPacing(p.id as any)}
                            className={`p-2.5 rounded-xl border text-left text-xs transition cursor-pointer ${
                              videoPacing === p.id
                                ? 'bg-purple-600 text-white border-purple-600 font-semibold'
                                : isDarkMode ? 'bg-[#1B1A18] border-[#383630]' : 'bg-[#F9F8F5] border-[#E8E5DC]'
                            }`}
                          >
                            <div className="font-medium truncate">{p.label}</div>
                            <div className="text-[10px] opacity-75 truncate">{p.desc}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold">Target Video Duration</label>
                      <div className="grid grid-cols-4 gap-2">
                        {['30s Short', '60s Viral Short', '90s In-Depth', '3-5m Video'].map(d => (
                          <button
                            key={d}
                            onClick={() => setVideoDuration(d)}
                            className={`p-2.5 rounded-xl border text-center text-xs transition cursor-pointer ${
                              videoDuration === d
                                ? 'bg-[#C96442] text-white border-[#C96442] font-semibold'
                                : isDarkMode ? 'bg-[#1B1A18] border-[#383630]' : 'bg-[#F9F8F5] border-[#E8E5DC]'
                            }`}
                          >
                            <span className="truncate">{d}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Stepper Navigation */}
                  <div className="flex items-center justify-end pt-4 border-t border-zinc-500/20">
                    <button
                      onClick={() => setVideoStudioStep(2)}
                      className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#C96442] hover:bg-[#B55232] text-white text-xs font-semibold shadow-xs transition active:scale-[0.98] cursor-pointer"
                    >
                      <span>Continue to Video Source</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* ─── STEP 2: VIDEO SOURCE & OUTLIER SELECTION ─────────────────── */}
              {videoStudioStep === 2 && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h2 className="font-serif text-xl font-bold">Step 2: Select Video Source or YouTube Outlier</h2>
                      <p className={`text-xs mt-1 ${isDarkMode ? 'text-[#9E9A90]' : 'text-[#736E65]'}`}>
                        Pick an identified breakout outlier from {currentNicheMeta?.label || selectedNiche} or enter a custom link.
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 p-1 rounded-xl border bg-[#F5F3EC] dark:bg-[#1B1A18] border-[#E8E5DC] dark:border-[#383630]">
                      <button
                        onClick={() => setVideoSourceType('outlier')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                          videoSourceType === 'outlier' ? 'bg-[#C96442] text-white' : 'text-[#736E65] dark:text-[#9E9A90]'
                        }`}
                      >
                        Detected Outliers
                      </button>
                      <button
                        onClick={() => setVideoSourceType('custom')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                          videoSourceType === 'custom' ? 'bg-[#C96442] text-white' : 'text-[#736E65] dark:text-[#9E9A90]'
                        }`}
                      >
                        Custom YouTube URL
                      </button>
                      <button
                        onClick={() => {
                          setVideoSourceType('ai_prompt');
                          setStudioSubMode('prompt_generator');
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                          videoSourceType === 'ai_prompt' ? 'bg-purple-600 text-white' : 'text-[#736E65] dark:text-[#9E9A90]'
                        }`}
                      >
                        <Lock className="w-3 h-3 text-amber-400" />
                        <span>AI Prompt Studio</span>
                        <span className="text-[9px] font-mono px-1 rounded bg-amber-500/20 text-amber-400 font-bold">ALPHA</span>
                      </button>
                    </div>
                  </div>

                  {videoSourceType === 'outlier' ? (
                    <div className="space-y-3">
                      <div className="text-xs font-semibold text-[#736E65] dark:text-[#9E9A90] flex items-center justify-between">
                        <span>Click an Outlier Video to Generate AI Video Assets</span>
                        <span className="font-mono text-[#C96442]">{videosList.length} Breakouts Found</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
                        {videosList.map((v, idx) => {
                          const isSelected = selectedOutlierVideo?.video_id === v.video_id;
                          return (
                            <div
                              key={idx}
                              onClick={() => {
                                setSelectedOutlierVideo(v);
                                showToast(`Selected outlier: "${v.title}"`, 'success');
                              }}
                              className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 relative ${
                                isSelected
                                  ? 'border-purple-500 bg-purple-500/10 shadow-md ring-2 ring-purple-500/20'
                                  : isDarkMode ? 'bg-[#1B1A18] border-[#383630] hover:border-zinc-500' : 'bg-[#F9F8F5] border-[#E8E5DC] hover:border-zinc-400'
                              }`}
                            >
                              <div className="w-20 h-14 rounded-xl bg-zinc-800 shrink-0 overflow-hidden relative">
                                <img
                                  src={v.thumbnail_url}
                                  alt=""
                                  className="w-full h-full object-cover"
                                  onError={(e: any) => { e.target.style.display = 'none'; }}
                                />
                                <div className="absolute bottom-1 right-1 px-1 py-0.2 rounded bg-black/80 text-[9px] font-mono font-bold text-white">
                                  {v.outperformance_ratio}x
                                </div>
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-xs leading-snug line-clamp-2">
                                  {v.title}
                                </div>
                                <div className="text-[11px] text-[#736E65] dark:text-[#9E9A90] mt-1 flex items-center gap-2">
                                  <span>{v.channel_title}</span>
                                  <span>•</span>
                                  <span className="text-purple-400 font-mono font-bold">{v.views_per_hour?.toLocaleString()} VPH</span>
                                </div>
                              </div>

                              {isSelected && (
                                <div className="w-5 h-5 rounded-full bg-purple-500 text-white flex items-center justify-center shrink-0">
                                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 rounded-2xl border bg-[#F9F8F5] dark:bg-[#1B1A18] border-[#E8E5DC] dark:border-[#383630] space-y-4">
                      <div>
                        <label className="text-xs font-semibold">YouTube Video URL or Topic Prompt</label>
                        <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-[#9E9A90]' : 'text-[#736E65]'}`}>
                          Paste any YouTube link to auto-extract timestamps and transcribe hooks.
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="https://www.youtube.com/watch?v=... or enter custom topic"
                          value={customVideoUrl}
                          onChange={e => setCustomVideoUrl(e.target.value)}
                          className="flex-1 px-4 py-2.5 rounded-xl border bg-white dark:bg-[#242320] border-[#E8E5DC] dark:border-[#383630] text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                        <button
                          onClick={() => {
                            if (!customVideoUrl) {
                              showToast('Please enter a YouTube URL or topic prompt', 'error');
                              return;
                            }
                            showToast('Video metadata analyzed & transcribed!', 'success');
                          }}
                          className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold cursor-pointer"
                        >
                          Analyze URL
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Stepper Navigation */}
                  <div className="flex items-center justify-between pt-4 border-t border-zinc-500/20">
                    <button
                      onClick={() => setVideoStudioStep(1)}
                      className="px-4 py-2.5 rounded-xl border border-zinc-400/30 text-xs font-semibold cursor-pointer"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => setVideoStudioStep(3)}
                      className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#C96442] hover:bg-[#B55232] text-white text-xs font-semibold shadow-xs transition active:scale-[0.98] cursor-pointer"
                    >
                      <span>Continue to Captions & Voice</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* ─── STEP 3: CAPTIONS, VOICEOVER & B-ROLL PACING ──────────────── */}
              {videoStudioStep === 3 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="font-serif text-xl font-bold">Step 3: Subtitle Styling & AI Voiceover</h2>
                    <p className={`text-xs mt-1 ${isDarkMode ? 'text-[#9E9A90]' : 'text-[#736E65]'}`}>
                      Customize the kinetic subtitles overlay, spoken cadence, and background soundtrack.
                    </p>
                  </div>

                  {/* Kinetic Subtitles Typography Cards */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold">Subtitles Typography & Animation</label>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      {[
                        { id: 'hormozi', name: 'Hormozi Pop', preview: 'NEVER DO THIS', style: 'text-yellow-400 font-black tracking-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]' },
                        { id: 'minimal', name: 'Minimalist Chic', preview: 'Step-by-step fix', style: 'text-white font-medium bg-black/60 px-2 py-0.5 rounded' },
                        { id: 'neon', name: 'Neon Karaoke', preview: 'THE SECRET TRICK', style: 'text-cyan-400 font-extrabold tracking-wide drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]' },
                        { id: 'red', name: 'Cyber Red Alert', preview: 'CRITICAL MISTAKE', style: 'text-red-500 font-black uppercase tracking-wider' }
                      ].map(cap => (
                        <div
                          key={cap.id}
                          onClick={() => setCaptionStyle(cap.id as any)}
                          className={`p-3.5 rounded-2xl border transition-all cursor-pointer text-center space-y-2 ${
                            captionStyle === cap.id
                              ? 'border-purple-500 bg-purple-500/10 shadow-md ring-2 ring-purple-500/20'
                              : isDarkMode ? 'bg-[#1B1A18] border-[#383630]' : 'bg-[#F9F8F5] border-[#E8E5DC]'
                          }`}
                        >
                          <div className="text-[10px] font-mono uppercase text-[#736E65] dark:text-[#9E9A90] font-bold">
                            {cap.name}
                          </div>
                          <div className="h-12 rounded-xl bg-black flex items-center justify-center p-2">
                            <span className={`text-sm ${cap.style}`}>{cap.preview}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* AI Voiceover Narrator */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold">AI Voiceover Narrator Tone</label>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      {[
                        { id: 'marcus', name: 'Marcus', desc: 'Deep Authority', tone: 'Low pitch, firm, mechanic/tech tone' },
                        { id: 'elena', name: 'Elena', desc: 'Crisp & Engaging', tone: 'Fast articulation, finance/clarity' },
                        { id: 'kai', name: 'Kai', desc: 'Fast Casual', tone: 'Youthful creator, gaming/lifestyle' },
                        { id: 'sarah', name: 'Sarah', desc: 'Storyteller', tone: 'Warm, documentary pacing' }
                      ].map(v => (
                        <div
                          key={v.id}
                          onClick={() => setVoiceoverTone(v.id as any)}
                          className={`p-3.5 rounded-2xl border transition-all cursor-pointer space-y-1 ${
                            voiceoverTone === v.id
                              ? 'border-indigo-500 bg-indigo-500/10 shadow-md ring-2 ring-indigo-500/20'
                              : isDarkMode ? 'bg-[#1B1A18] border-[#383630]' : 'bg-[#F9F8F5] border-[#E8E5DC]'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-xs">{v.name}</span>
                            <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">
                              {v.desc}
                            </span>
                          </div>
                          <p className={`text-[11px] ${isDarkMode ? 'text-[#9E9A90]' : 'text-[#736E65]'}`}>
                            {v.tone}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Background Audio */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold">Background Soundtrack Layer</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { id: 'lofi', label: 'Cyber Lo-Fi Chill', bpm: '85 BPM' },
                        { id: 'tension', label: 'Suspense Pulse', bpm: '110 BPM' },
                        { id: 'phonk', label: 'High-Energy Drift Phonk', bpm: '135 BPM' },
                        { id: 'ambient', label: 'Subtle Ambience', bpm: 'Muted 60 BPM' }
                      ].map(m => (
                        <button
                          key={m.id}
                          onClick={() => setBgMusic(m.id as any)}
                          className={`p-3 rounded-xl border text-left text-xs transition cursor-pointer ${
                            bgMusic === m.id
                              ? 'bg-[#C96442] text-white border-[#C96442] font-semibold'
                              : isDarkMode ? 'bg-[#1B1A18] border-[#383630]' : 'bg-[#F9F8F5] border-[#E8E5DC]'
                          }`}
                        >
                          <div className="font-medium truncate">{m.label}</div>
                          <div className="text-[10px] opacity-75">{m.bpm}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Stepper Navigation */}
                  <div className="flex items-center justify-between pt-4 border-t border-zinc-500/20">
                    <button
                      onClick={() => setVideoStudioStep(2)}
                      className="px-4 py-2.5 rounded-xl border border-zinc-400/30 text-xs font-semibold cursor-pointer"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => setVideoStudioStep(4)}
                      className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#C96442] hover:bg-[#B55232] text-white text-xs font-semibold shadow-xs transition active:scale-[0.98] cursor-pointer"
                    >
                      <span>Continue to Details & SEO</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* ─── STEP 4: YOUTUBE DETAILS & METADATA PACKAGING ─────────────── */}
              {videoStudioStep === 4 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="font-serif text-xl font-bold">Step 4: Title, Description & Thumbnail Packaging</h2>
                    <p className={`text-xs mt-1 ${isDarkMode ? 'text-[#9E9A90]' : 'text-[#736E65]'}`}>
                      Format video metadata for maximum CTR and YouTube search visibility.
                    </p>
                  </div>

                  {/* Title Candidate Selector */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold">Select YouTube Video Title Candidate</label>
                    <div className="space-y-2">
                      {[
                        { idx: 0, tag: 'Curiosity & Debunking', title: currentBrief?.titles?.title_2_curiosity || `Why Most Videos on ${currentTopic} Are Completely Wrong` },
                        { idx: 1, tag: 'High-Intent Search SEO', title: currentBrief?.titles?.title_1_search_match || `How to Fix ${currentTopic} (Complete Step-by-Step)` },
                        { idx: 2, tag: 'Value & Time-Saved', title: currentBrief?.titles?.title_3_value || `${currentTopic}: The Secret Technique That Saves You $500` }
                      ].map(t => (
                        <div
                          key={t.idx}
                          onClick={() => setSelectedTitleIdx(t.idx)}
                          className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                            selectedTitleIdx === t.idx
                              ? 'border-[#C96442] bg-[#FAF0EB] dark:bg-[#2F241F] shadow-sm'
                              : isDarkMode ? 'bg-[#1B1A18] border-[#383630]' : 'bg-[#F9F8F5] border-[#E8E5DC]'
                          }`}
                        >
                          <div className="space-y-0.5">
                            <span className="text-[10px] font-mono uppercase text-[#C96442] font-bold">
                              {t.tag}
                            </span>
                            <div className="font-semibold text-xs text-[#1C1917] dark:text-white">
                              {t.title}
                            </div>
                          </div>
                          <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                            selectedTitleIdx === t.idx ? 'border-[#C96442] bg-[#C96442] text-white' : 'border-zinc-400'
                          }`}>
                            {selectedTitleIdx === t.idx && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Description with Auto-Generated Timestamps */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold">Video Description & Chapter Timestamps</label>
                      <button
                        onClick={() => {
                          const descText = `${currentTopic}: The complete retention breakdown.\n\nCHAPTERS:\n0:00 - The Costly Mistake Nobody Tests\n0:25 - The Diagnostic Procedure\n1:15 - The 30-Second Fix\n2:45 - Prevention & Pro Advice\n\nSubscribe for more weekly ${currentNicheMeta?.label || selectedNiche} breakdowns!\n\n#shorts #${selectedNiche} #viral`;
                          handleCopy(descText, 'desc_copy', 'Description copied!');
                        }}
                        className="text-[11px] font-mono text-[#C96442] flex items-center gap-1 hover:underline cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy Description</span>
                      </button>
                    </div>

                    <textarea
                      rows={4}
                      readOnly
                      value={`${currentTopic}: The complete retention breakdown.\n\nCHAPTERS:\n0:00 - The Costly Mistake Nobody Tests\n0:25 - The Diagnostic Procedure\n1:15 - The 30-Second Fix\n2:45 - Prevention & Pro Advice\n\nSubscribe for more weekly ${currentNicheMeta?.label || selectedNiche} breakdowns!\n\n#shorts #${selectedNiche} #viral #algorithm`}
                      className="w-full p-3.5 rounded-2xl border bg-white dark:bg-[#1B1A18] border-[#E8E5DC] dark:border-[#383630] font-mono text-xs leading-relaxed resize-none focus:outline-none text-[#736E65] dark:text-[#9E9A90]"
                    />
                  </div>

                  {/* Viral Hashtags */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold">Recommended Algorithm Tags</label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {['#shorts', `#${selectedNiche}`, '#viral', '#tutorial', '#breakdown', '#howTo', '#lifehack'].map(tag => (
                        <span key={tag} className="text-xs font-mono px-2.5 py-1 rounded-xl bg-[#F5F3EC] dark:bg-[#1B1A18] border border-[#E8E5DC] dark:border-[#383630] text-[#C96442] font-medium">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Stepper Navigation */}
                  <div className="flex items-center justify-between pt-4 border-t border-zinc-500/20">
                    <button
                      onClick={() => setVideoStudioStep(3)}
                      className="px-4 py-2.5 rounded-xl border border-zinc-400/30 text-xs font-semibold cursor-pointer"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => setVideoStudioStep(5)}
                      className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#C96442] hover:bg-[#B55232] text-white text-xs font-semibold shadow-xs transition active:scale-[0.98] cursor-pointer"
                    >
                      <span>Continue to Live Review & Render</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* ─── STEP 5: REVIEW, PLAYER MOCKUP & RENDER ACTION ────────────── */}
              {videoStudioStep === 5 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="font-serif text-xl font-bold">Step 5: Review & Render AI Video Assets</h2>
                    <p className={`text-xs mt-1 ${isDarkMode ? 'text-[#9E9A90]' : 'text-[#736E65]'}`}>
                      Interactive video preview with kinetic subtitles, audio waveforms, and rendering queue.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    {/* LEFT COLUMN: INTERACTIVE VIDEO MOCKUP PLAYER */}
                    <div className="lg:col-span-6 flex flex-col items-center justify-center p-6 rounded-3xl bg-black border border-zinc-800 shadow-2xl relative overflow-hidden">
                      {/* Player Container */}
                      <div className={`transition-all duration-300 relative rounded-2xl overflow-hidden shadow-2xl border border-zinc-700 bg-zinc-950 flex flex-col justify-between ${
                        videoAspectRatio === '9:16' ? 'w-[280px] h-[520px]' : 'w-full max-w-lg aspect-video'
                      }`}>
                        {/* Video Mock Canvas Content */}
                        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-zinc-900/40 to-black/90 pointer-events-none" />

                        {/* Top Bar inside Player */}
                        <div className="relative z-10 p-3 flex items-center justify-between text-white text-xs">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                            <span className="font-mono text-[10px] text-zinc-300">AUTO-CLIP 1080p</span>
                          </div>
                          <span className="font-mono text-[10px] text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded">
                            {videoDuration}
                          </span>
                        </div>

                        {/* Center Kinetic Subtitles Display */}
                        <div className="relative z-10 p-4 text-center my-auto space-y-3">
                          <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                            [0:{String(Math.floor((videoMockProgress / 100) * 59)).padStart(2, '0')} Spoken Hook]
                          </div>

                          <div className={`text-lg sm:text-xl transition-all duration-150 ${
                            captionStyle === 'hormozi'
                              ? 'text-yellow-400 font-black tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]'
                              : captionStyle === 'neon'
                              ? 'text-cyan-300 font-extrabold drop-shadow-[0_0_12px_rgba(34,211,238,0.9)]'
                              : captionStyle === 'red'
                              ? 'text-red-500 font-black uppercase'
                              : 'text-white font-medium bg-black/70 px-3 py-1 rounded-xl'
                          }`}>
                            "{currentTopic.toUpperCase()} IS A TRAP!"
                          </div>

                          <div className="text-xs text-zinc-300 max-w-[200px] mx-auto line-clamp-2">
                            {currentBrief?.hook_script || 'Stop doing this one mistake before you break your components.'}
                          </div>
                        </div>

                        {/* Bottom Player Overlay & Controls */}
                        <div className="relative z-10 p-3 space-y-2 bg-gradient-to-t from-black via-black/80 to-transparent">
                          {/* Scrubber Progress Bar */}
                          <div
                            onClick={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const clickX = e.clientX - rect.left;
                              const pct = Math.round((clickX / rect.width) * 100);
                              setVideoMockProgress(Math.max(0, Math.min(100, pct)));
                            }}
                            className="w-full h-1.5 rounded-full bg-zinc-800 cursor-pointer overflow-hidden relative"
                          >
                            <div
                              className="h-full bg-gradient-to-r from-purple-500 to-[#C96442] transition-all duration-100"
                              style={{ width: `${videoMockProgress}%` }}
                            />
                          </div>

                          {/* Controls Row */}
                          <div className="flex items-center justify-between text-white text-xs pt-1">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setIsPlayingVideoMock(!isPlayingVideoMock)}
                                className="w-7 h-7 rounded-full bg-white text-black flex items-center justify-center hover:bg-zinc-200 transition cursor-pointer"
                              >
                                {isPlayingVideoMock ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
                              </button>
                              <span className="font-mono text-[10px] text-zinc-300">
                                0:{String(Math.floor((videoMockProgress / 100) * 59)).padStart(2, '0')} / 0:59
                              </span>
                            </div>

                            <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono">
                              <span>{captionStyle.toUpperCase()}</span>
                              <span>•</span>
                              <span>{voiceoverTone.toUpperCase()}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Mock Player Footer Tag */}
                      <p className="text-[11px] text-zinc-500 font-mono mt-3 text-center">
                        Interactive Player Preview • Word-by-Word Kinetic Subtitles Active
                      </p>
                    </div>

                    {/* RIGHT COLUMN: RENDER & EXPORT ACTIONS */}
                    <div className="lg:col-span-6 space-y-4">
                      {/* Configuration Summary Card */}
                      <div className={`p-5 rounded-2xl border space-y-3 ${
                        isDarkMode ? 'bg-[#1B1A18] border-[#383630]' : 'bg-[#F9F8F5] border-[#E8E5DC]'
                      }`}>
                        <div className="flex items-center justify-between border-b border-zinc-500/20 pb-2">
                          <span className="font-semibold text-xs">Video Production Bundle</span>
                          <span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full font-bold">
                            READY TO EXPORT
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-[10px] font-mono text-[#736E65] dark:text-[#9E9A90] uppercase">Format</span>
                            <div className="font-semibold capitalize mt-0.5">{videoFormat} Short ({videoAspectRatio})</div>
                          </div>
                          <div>
                            <span className="text-[10px] font-mono text-[#736E65] dark:text-[#9E9A90] uppercase">Subtitles</span>
                            <div className="font-semibold capitalize mt-0.5">{captionStyle} Pop</div>
                          </div>
                          <div>
                            <span className="text-[10px] font-mono text-[#736E65] dark:text-[#9E9A90] uppercase">AI Voice</span>
                            <div className="font-semibold capitalize mt-0.5">{voiceoverTone} (140 WPM)</div>
                          </div>
                          <div>
                            <span className="text-[10px] font-mono text-[#736E65] dark:text-[#9E9A90] uppercase">Soundtrack</span>
                            <div className="font-semibold capitalize mt-0.5">{bgMusic} Beat</div>
                          </div>
                        </div>
                      </div>

                      {/* ACTION 1: THE COMING SOON GENERATE BUTTON */}
                      <div className="p-5 rounded-2xl bg-gradient-to-br from-purple-900/30 via-indigo-900/20 to-[#C96442]/20 border border-purple-500/40 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-purple-300 uppercase font-mono tracking-wider">
                            Full Video Render Pipeline
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-400 text-stone-900 font-black uppercase">
                            COMING SOON
                          </span>
                        </div>

                        <p className="text-xs text-zinc-300 leading-relaxed">
                          Click below to inspect the upcoming neural video synthesis engine (powered by Google Veo & Runway integration). Full MP4 rendering is currently in active development.
                        </p>

                        <button
                          onClick={() => setShowComingSoonModal(true)}
                          className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-[#C96442] hover:opacity-95 text-white text-xs font-bold shadow-lg transition active:scale-[0.98] cursor-pointer"
                        >
                          <Film className="w-4 h-4" />
                          <span>Generate AI Video (Coming Soon)</span>
                        </button>
                      </div>

                      {/* ACTION 2: DOWNLOAD PRODUCTION PACKAGE (.JSON) */}
                      <button
                        onClick={() => {
                          const bundle = {
                            project: `AutoSignal Video Package: ${currentTopic}`,
                            generated_at: new Date().toISOString(),
                            format: videoFormat,
                            aspect_ratio: videoAspectRatio,
                            pacing: videoPacing,
                            captions_style: captionStyle,
                            voiceover: voiceoverTone,
                            music: bgMusic,
                            duration: videoDuration,
                            selected_title: currentBrief?.titles?.title_2_curiosity || currentTopic,
                            all_titles: currentBrief?.titles,
                            spoken_hook_script: currentBrief?.hook_script,
                            pacing_outline: currentBrief?.pacing_outline,
                            thumbnail_prompt: generatedThumbnailPrompt,
                            source_outlier: selectedOutlierVideo
                          };

                          const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `video_package_${selectedNiche}_${Date.now()}.json`;
                          a.click();
                          URL.revokeObjectURL(url);
                          showToast('Downloaded Video Production Package (.JSON)!', 'success');
                        }}
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border bg-[#F5F3EC] dark:bg-[#1B1A18] border-[#E8E5DC] dark:border-[#383630] hover:border-[#C96442] text-xs font-semibold transition cursor-pointer"
                      >
                        <Download className="w-4 h-4 text-[#C96442]" />
                        <span>Download Full Metadata & Script Package (.JSON)</span>
                      </button>

                      {/* ACTION 3: COPY SPOKEN VOICE SCRIPT */}
                      <button
                        onClick={() => {
                          const script = `HOOK SCRIPT:\n${currentBrief?.hook_script || selectedHookData.script}\n\nFULL TIMESTAMPS:\n${(currentBrief?.pacing_outline || []).map(b => `${b.time}: ${b.beat} - ${b.action}`).join('\n')}`;
                          handleCopy(script, 'copy_video_script', 'Spoken script copied to clipboard!');
                        }}
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border bg-[#F5F3EC] dark:bg-[#1B1A18] border-[#E8E5DC] dark:border-[#383630] hover:border-[#C96442] text-xs font-semibold transition cursor-pointer"
                      >
                        <Copy className="w-4 h-4 text-[#736E65]" />
                        <span>Copy Full Voiceover Script to Clipboard</span>
                      </button>
                    </div>
                  </div>

                  {/* Stepper Navigation */}
                  <div className="flex items-center justify-between pt-4 border-t border-zinc-500/20">
                    <button
                      onClick={() => setVideoStudioStep(4)}
                      className="px-4 py-2.5 rounded-xl border border-zinc-400/30 text-xs font-semibold cursor-pointer"
                    >
                      Back to Details
                    </button>
                    <button
                      onClick={() => setVideoStudioStep(1)}
                      className="flex items-center gap-1.5 text-xs text-[#736E65] dark:text-[#9E9A90] hover:underline cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Start Over / New Video</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
            )}
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* VIEW 4: PIPELINE & CODE (DEEP DIVE 7-STEP PYTHON ENGINE & ARTIFACTS)  */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        {appMode === 'deepdive' && (
          <div className="p-4 md:p-8 max-w-7xl w-full mx-auto space-y-6">
            {/* Subtabs for Deep Dive */}
            <div className={`p-2 rounded-2xl border flex flex-wrap items-center gap-1 ${
              isDarkMode ? 'bg-[#242320] border-[#383630]' : 'bg-[#F2EFE9] border-[#E2DDD3]'
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
                        ? 'bg-white dark:bg-[#1B1A18] text-[#1C1917] dark:text-white shadow-xs font-semibold'
                        : 'text-[#736E65] dark:text-[#9E9A90] hover:text-[#1C1917] dark:hover:text-white'
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
                <div className={`p-6 rounded-3xl border shadow-xs ${
                  isDarkMode ? 'bg-[#242320] border-[#383630]' : 'bg-white border-[#E8E5DC]'
                }`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h2 className="font-serif text-xl font-bold flex items-center gap-2">
                        <span>Sequential Pipeline Execution Engine</span>
                        <span className="text-[10px] font-mono bg-[#FAF0EB] text-[#C96442] dark:bg-[#2F241F] px-2 py-0.5 rounded-full border border-[#E8D0C5] dark:border-[#4A342B]">
                          {selectedNiche.toUpperCase()}
                        </span>
                      </h2>
                      <p className="text-xs text-[#736E65] dark:text-[#9E9A90] mt-1 max-w-2xl">
                        Runs the 7 original Python scripts in <code className="font-mono text-[#C96442]">autosignal/</code> sequentially. Each script validates output JSON artifacts and updates cache state in real time.
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {isAutoRunning ? (
                        <button
                          onClick={stopSequentialAutoRun}
                          className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold px-5 py-2.5 rounded-2xl transition cursor-pointer"
                        >
                          <Pause className="w-3.5 h-3.5 fill-current" />
                          <span>Stop Pipeline</span>
                        </button>
                      ) : (
                        <button
                          onClick={startSequentialAutoRun}
                          className="flex items-center gap-2 bg-[#C96442] hover:bg-[#B55232] text-white text-xs font-semibold px-6 py-2.5 rounded-2xl shadow-xs transition active:scale-[0.98] cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Run All 7 Steps Sequentially</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar & Timer */}
                  <div className="mt-6 pt-5 border-t border-[#E8E5DC] dark:border-[#302F2A] space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[#1C1917] dark:text-white">
                        {isAutoRunning
                          ? `Running Step ${autoRunStepIndex + 1} of ${pipelineSteps.length}: ${pipelineSteps[autoRunStepIndex]?.name}`
                          : autoRunProgress === 100
                          ? 'All stages executed successfully'
                          : 'Ready to execute'}
                      </span>
                      <span className="font-mono text-[#736E65] dark:text-[#9E9A90]">
                        {autoRunProgress}% • Elapsed: {elapsedTime}s
                      </span>
                    </div>

                    <div className="w-full bg-[#F5F3EC] dark:bg-[#2B2A26] h-2.5 rounded-full overflow-hidden border border-[#E8E5DC] dark:border-[#383630]">
                      <div
                        className="h-full bg-[#C96442] transition-all duration-300"
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
                        className={`rounded-2xl border transition overflow-hidden ${
                          isDarkMode ? 'bg-[#242320] border-[#383630]' : 'bg-white border-[#E8E5DC]'
                        }`}
                      >
                        <div
                          onClick={() => toggleStepCard(step.id)}
                          className="p-4 flex items-center justify-between gap-4 cursor-pointer hover:bg-[#F5F3EC]/50 dark:hover:bg-[#2B2A26]/50 select-none"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-mono font-bold text-xs shrink-0 ${
                              isRunning
                                ? 'bg-[#C96442] text-white animate-pulse'
                                : isDone
                                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                                : 'bg-[#F5F3EC] dark:bg-[#2B2A26] text-[#736E65]'
                            }`}>
                              {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : isDone ? '✓' : `0${idx + 1}`}
                            </div>

                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-semibold">{step.name}</span>
                                <span className="font-mono text-[10px] text-[#736E65] dark:text-[#9E9A90] bg-[#F5F3EC] dark:bg-[#2B2A26] px-2 py-0.5 rounded border border-[#E8E5DC] dark:border-[#383630]">
                                  {step.script}
                                </span>
                                {isDone && (
                                  <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.2 rounded-full border border-emerald-500/30">
                                    Done
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-[#736E65] dark:text-[#9E9A90] mt-0.5">{step.description}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRunSingleStep(step.id);
                              }}
                              disabled={isAutoRunning}
                              className="text-xs bg-[#F5F3EC] dark:bg-[#2B2A26] hover:bg-[#EAE6DD] text-[#1C1917] dark:text-white px-2.5 py-1 rounded-xl border border-[#E8E5DC] dark:border-[#383630] transition cursor-pointer"
                            >
                              Run Step
                            </button>
                            <ChevronDown className={`w-4 h-4 text-[#736E65] transition-transform ${res?.expanded ? 'rotate-180' : ''}`} />
                          </div>
                        </div>

                        {/* Expanded Details */}
                        {res?.expanded && (
                          <div className="px-5 pb-5 pt-2 border-t border-[#E8E5DC] dark:border-[#302F2A] space-y-3 bg-[#FAF9F5] dark:bg-[#1B1A18]/50">
                            <div className="rounded-xl overflow-hidden border border-[#E8E5DC] dark:border-[#383630] bg-[#141413] text-[#EDEAE2]">
                              <div className="px-3 py-1.5 bg-[#201F1D] border-b border-[#302F2A] flex items-center justify-between text-[10px] font-mono text-[#9E9A90]">
                                <span className="flex items-center gap-1.5">
                                  <Terminal className="w-3 h-3 text-[#C96442]" />
                                  <span>python3 autosignal/{step.script} {selectedNiche}</span>
                                </span>
                                <span>Exit: 0</span>
                              </div>
                              <pre className="p-3 text-[11px] font-mono text-zinc-300 overflow-x-auto max-h-36 whitespace-pre-wrap">
                                {res?.stdout || `Stage executed successfully. Artifact verified at data/${selectedNiche}/${step.outputFiles[0]}`}
                              </pre>
                            </div>

                            <div className="flex items-center justify-between text-xs">
                              <button
                                onClick={() => handleViewPythonCode(step.script)}
                                className="text-[#C96442] hover:underline flex items-center gap-1 cursor-pointer font-medium"
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
                                className="text-[#736E65] dark:text-[#9E9A90] hover:text-[#1C1917] dark:hover:text-white flex items-center gap-1 cursor-pointer"
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
                <div className={`p-5 rounded-3xl border shadow-xs ${
                  isDarkMode ? 'bg-[#242320] border-[#383630]' : 'bg-white border-[#E8E5DC]'
                }`}>
                  <h3 className="font-serif text-base font-semibold">Live Python Console Output</h3>
                  <div className="mt-3 rounded-2xl bg-[#141413] text-[#EDEAE2] p-4 font-mono text-xs max-h-80 overflow-y-auto space-y-2 border border-[#383630]">
                    {consoleLogs.map((log, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-[#736E65] text-[10px] shrink-0 pt-0.5">[{log.time}]</span>
                        <pre className="whitespace-pre-wrap font-mono text-xs flex-1 text-zinc-300">
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
                <div className={`p-4 rounded-3xl border shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                  isDarkMode ? 'bg-[#242320] border-[#383630]' : 'bg-white border-[#E8E5DC]'
                }`}>
                  {/* Search Bar + Live Search Trigger */}
                  <div className="flex items-center gap-2 flex-1 max-w-xl bg-[#F5F3EC] dark:bg-[#2B2A26] px-3.5 py-1.5 rounded-2xl border border-[#E8E5DC] dark:border-[#383630]">
                    <Search className="w-4 h-4 text-[#736E65] shrink-0" />
                    <input
                      type="text"
                      placeholder="Search live YouTube & database (e.g. brake pins, local llm, crypto)..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleLiveYoutubeSearch();
                      }}
                      className="bg-transparent border-none text-xs text-[#1C1917] dark:text-white placeholder-[#736E65] focus:outline-none w-full"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => {
                          setSearchQuery('');
                          setLiveSearchResult(null);
                        }}
                        className="text-[#736E65] hover:text-[#1C1917] dark:hover:text-white p-0.5 shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => handleLiveYoutubeSearch()}
                      disabled={isSearchingLive}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#C96442] hover:bg-[#B55232] text-white text-xs font-semibold transition cursor-pointer shrink-0 disabled:opacity-50 shadow-xs"
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
                            ? 'bg-[#C96442] text-white'
                            : 'bg-[#F5F3EC] dark:bg-[#2B2A26] text-[#736E65] dark:text-[#9E9A90]'
                        }`}
                      >
                        {f === 'outliers' ? `≥3x Outliers (${strongOutliersCount})` : f}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Live YouTube Search & DB Persisted Banner */}
                {liveSearchResult && (
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-[#1C1A18] to-purple-950/40 border border-emerald-500/40 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md animate-fade-in">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                        <CheckCheck className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-2">
                          <span>{liveSearchResult.isLive ? 'Live YouTube Data API v3' : 'Outlier Synthesis Engine'}</span>
                          <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                            SAVED TO DATABASE
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-300 mt-0.5">
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
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#C96442] hover:bg-[#B55232] text-white text-xs font-semibold transition cursor-pointer shadow-xs"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>View Masterclass Brief</span>
                      </button>

                      <button
                        onClick={() => {
                          setCurrentTopic(liveSearchResult.query);
                          setAppMode('video-studio');
                          setVideoStudioStep(1);
                          showToast(`Opened AI Video Studio for "${liveSearchResult.query}"`, 'info');
                        }}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-purple-400 bg-purple-500/20 text-purple-200 hover:bg-purple-500/30 text-xs font-semibold transition cursor-pointer"
                      >
                        <Film className="w-3.5 h-3.5" />
                        <span>Clip in Video Studio</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Instant Search Actions Banner (when user types) */}
                {!liveSearchResult && searchQuery.trim().length > 1 && (
                  <div className="p-4 rounded-2xl bg-[#FAF0EB] dark:bg-[#2F241F] border border-[#E8D0C5] dark:border-[#4A342B] flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-xl bg-[#C96442]/15 text-[#C96442] flex items-center justify-center shrink-0">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-[#1C1917] dark:text-white">
                          Target Query: <span className="text-[#C96442] underline">"{searchQuery}"</span>
                        </div>
                        <div className="text-[11px] text-[#736E65] dark:text-[#9E9A90]">
                          Generate an on-demand AI blueprint or query live YouTube metrics for this topic.
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleLiveYoutubeSearch(searchQuery)}
                        disabled={isSearchingLive}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition cursor-pointer shadow-xs"
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
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#C96442] hover:bg-[#B55232] text-white text-xs font-semibold transition cursor-pointer shadow-xs"
                      >
                        {generatingBrief ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        <span>Generate Brief</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Empty State when no videos match */}
                {filteredVideos.length === 0 && (
                  <div className={`p-8 rounded-3xl border text-center space-y-4 ${
                    isDarkMode ? 'bg-[#242320] border-[#383630]' : 'bg-white border-[#E8E5DC]'
                  }`}>
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
                      <Search className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-serif text-base font-semibold">
                        No cached videos matching "{searchQuery}"
                      </h3>
                      <p className="text-xs text-[#736E65] dark:text-[#9E9A90] max-w-md mx-auto">
                        This query hasn't been crawled yet. Click the button below to query the YouTube Data API live, compute outperformance ratios, and save the videos directly to your database.
                      </p>
                    </div>
                    <button
                      onClick={() => handleLiveYoutubeSearch(searchQuery)}
                      disabled={isSearchingLive}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[#C96442] hover:bg-[#B55232] text-white text-xs font-semibold shadow-xs transition cursor-pointer"
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
                        className={`rounded-3xl border overflow-hidden shadow-xs hover:border-[#C96442] transition flex flex-col ${
                          isDarkMode ? 'bg-[#242320] border-[#383630]' : 'bg-white border-[#E8E5DC]'
                        }`}
                      >
                        <div className="relative aspect-video bg-zinc-950 overflow-hidden">
                          <img
                            src={video.thumbnail_url}
                            alt={video.title}
                            className="w-full h-full object-cover opacity-85 hover:scale-105 transition duration-300"
                          />
                          <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                            {isOutlier && (
                              <span className="bg-[#C96442] text-white text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg shadow-sm">
                                {video.outperformance_ratio}× BREAKOUT
                              </span>
                            )}
                            <span className="bg-black/80 text-white text-[10px] font-mono px-2 py-0.5 rounded-lg backdrop-blur-xs">
                              {video.views_per_hour} VPH
                            </span>
                          </div>
                        </div>

                        <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                          <div>
                            <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#736E65] dark:text-[#9E9A90] mb-1">
                              <span className="text-[#C96442] font-semibold">{video.subniche || 'General'}</span>
                              <span>•</span>
                              <span>{video.hours_since_publish}h ago</span>
                            </div>
                            <h4 className="text-xs font-semibold line-clamp-2 leading-relaxed">
                              {video.title}
                            </h4>
                            <div className="text-[11px] text-[#736E65] dark:text-[#9E9A90] mt-1">
                              {video.channel_title} • {video.channel_subscriber_count?.toLocaleString()} subs
                            </div>
                          </div>

                          <div className="pt-2 border-t border-[#E8E5DC] dark:border-[#383630] flex items-center justify-between text-xs">
                            <button
                              onClick={() => setJsonModal({ open: true, title: `Video: ${video.video_id}`, data: video })}
                              className="text-[#736E65] dark:text-[#9E9A90] hover:text-[#1C1917] dark:hover:text-white flex items-center gap-1 cursor-pointer"
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
                                  setVideoStudioStep(1);
                                  showToast(`Loaded "${video.title}" into AI Video Studio`, 'info');
                                }}
                                className="text-purple-600 dark:text-purple-400 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
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
                                className="text-[#C96442] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                                title="Deconstruct outlier hook & generate full Masterclass Brief"
                              >
                                <Sparkles className="w-3.5 h-3.5" />
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
                    className={`p-5 rounded-3xl border shadow-xs space-y-3 ${
                      isDarkMode ? 'bg-[#242320] border-[#383630]' : 'bg-white border-[#E8E5DC]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-mono text-[#C96442] uppercase font-bold">Cluster #{cluster.cluster_rank || i + 1}</div>
                        <h3 className="font-serif text-base font-semibold mt-0.5">{cluster.cluster_label}</h3>
                      </div>
                      <div className="bg-[#FAF0EB] dark:bg-[#2F241F] text-[#C96442] px-2.5 py-1 rounded-xl font-mono text-xs font-bold border border-[#E8D0C5] dark:border-[#4A342B]">
                        {cluster.cluster_score10 ? `${cluster.cluster_score10}/10` : '9.0/10'}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs py-2 border-y border-[#E8E5DC] dark:border-[#302F2A]">
                      <div>
                        <div className="text-[10px] text-[#736E65] dark:text-[#9E9A90] font-mono">Search Gap</div>
                        <div className="font-semibold text-xs font-mono">{Math.round((cluster.search_gap || 0.85) * 100)}%</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[#736E65] dark:text-[#9E9A90] font-mono">Avg Velocity</div>
                        <div className="font-semibold text-xs font-mono">{cluster.avg_vph?.toLocaleString()} VPH</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[#736E65] dark:text-[#9E9A90] font-mono">Outperformance</div>
                        <div className="font-semibold text-xs font-mono text-[#C96442]">{cluster.avg_outperformance}×</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1">
                      <button
                        onClick={() => setJsonModal({ open: true, title: `Cluster: ${cluster.cluster_label}`, data: cluster })}
                        className="text-[#736E65] dark:text-[#9E9A90] hover:text-[#1C1917] dark:hover:text-white flex items-center gap-1 cursor-pointer"
                      >
                        <Database className="w-3.5 h-3.5" />
                        <span>Cluster Artifact</span>
                      </button>
                      <button
                        onClick={() => {
                          setAppMode('creator');
                          showToast(`Briefing topic: ${cluster.cluster_label}`, 'info');
                        }}
                        className="text-[#C96442] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
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
                    className={`p-5 rounded-3xl border shadow-xs space-y-3 ${
                      isDarkMode ? 'bg-[#242320] border-[#383630]' : 'bg-white border-[#E8E5DC]'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-serif text-sm font-bold text-[#C96442]">#{opp.rank || idx + 1}</span>
                          <h3 className="font-serif text-base font-semibold">{opp.cluster_label}</h3>
                          <span className="text-[10px] font-mono uppercase bg-[#FAF0EB] dark:bg-[#2F241F] text-[#C96442] px-2 py-0.5 rounded-full border border-[#E8D0C5] dark:border-[#4A342B]">
                            {opp.window || 'IMMEDIATE'}
                          </span>
                        </div>
                        <p className="text-xs text-[#736E65] dark:text-[#9E9A90] mt-1">
                          Angle: {opp.recommended_angle}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <div className="text-[10px] font-mono text-[#736E65] uppercase">Score</div>
                          <div className="font-serif text-lg font-bold text-[#C96442]">{opp.final_score}/10</div>
                        </div>
                        <button
                          onClick={() => {
                            handleGenerateBrief(opp);
                            setAppMode('creator');
                          }}
                          className="bg-[#C96442] hover:bg-[#B55232] text-white text-xs font-semibold px-4 py-2 rounded-xl transition cursor-pointer"
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
              <div className={`p-6 rounded-3xl border shadow-xs space-y-4 ${
                isDarkMode ? 'bg-[#242320] border-[#383630]' : 'bg-white border-[#E8E5DC]'
              }`}>
                <div className="border-b border-[#E8E5DC] dark:border-[#302F2A] pb-3">
                  <h3 className="font-serif text-base font-semibold">Admission Gate Audit Log</h3>
                  <p className="text-xs text-[#736E65] dark:text-[#9E9A90]">
                    Videos rejected by the 7 quality gates in metadata_fetch.py and merge_json.py.
                  </p>
                </div>

                <div className="divide-y divide-[#E8E5DC] dark:divide-[#302F2A]">
                  {data?.discardedVideos && data.discardedVideos.length > 0 ? (
                    data.discardedVideos.map((item, idx) => (
                      <div key={idx} className="py-3 flex items-start justify-between gap-4 text-xs">
                        <div>
                          <div className="font-medium text-[#1C1917] dark:text-white">{item.title}</div>
                          <div className="text-[11px] font-mono text-[#736E65] dark:text-[#9E9A90] mt-0.5">ID: {item.video_id}</div>
                        </div>
                        <span className="font-mono text-[11px] text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-lg border border-rose-500/30 shrink-0">
                          {item.discard_reason}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="py-6 text-center text-xs text-[#736E65] dark:text-[#9E9A90]">
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
        <div className="fixed inset-0 z-50 bg-[#141413] text-[#FAF9F5] flex flex-col p-6 animate-fade-in">
          {/* Prompter Controls Header */}
          <div className="max-w-4xl w-full mx-auto flex items-center justify-between pb-4 border-b border-[#302F2A] shrink-0">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
              <span className="font-mono text-xs uppercase tracking-wider font-bold text-[#C96442]">
                Studio Teleprompter
              </span>
              <span className="text-xs text-zinc-400 hidden sm:inline">• {currentTopic}</span>
            </div>

            <div className="flex items-center gap-3">
              {/* Play / Pause */}
              <button
                onClick={() => setIsPrompterPlaying(!isPrompterPlaying)}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  isPrompterPlaying
                    ? 'bg-amber-500 text-black'
                    : 'bg-[#C96442] text-white hover:bg-[#B55232]'
                }`}
              >
                {isPrompterPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                <span>{isPrompterPlaying ? 'Pause Scroll' : 'Start Auto-Scroll'}</span>
              </button>

              {/* Speed Slider */}
              <div className="hidden sm:flex items-center gap-2 bg-[#201F1D] px-3 py-1.5 rounded-xl border border-[#302F2A] text-xs">
                <span className="text-[10px] text-zinc-400 font-mono">Speed:</span>
                <input
                  type="range"
                  min="80"
                  max="220"
                  value={teleprompterSpeed}
                  onChange={e => setTeleprompterSpeed(Number(e.target.value))}
                  className="w-20 accent-[#C96442] cursor-pointer"
                />
                <span className="font-mono text-[10px] text-[#C96442]">{teleprompterSpeed} WPM</span>
              </div>

              {/* Font Size Slider */}
              <div className="hidden sm:flex items-center gap-2 bg-[#201F1D] px-3 py-1.5 rounded-xl border border-[#302F2A] text-xs">
                <span className="text-[10px] text-zinc-400 font-mono">Size:</span>
                <button
                  onClick={() => setTeleprompterFontSize(Math.max(18, teleprompterFontSize - 2))}
                  className="px-1.5 py-0.5 rounded bg-zinc-800 text-xs font-bold"
                >
                  A-
                </button>
                <button
                  onClick={() => setTeleprompterFontSize(Math.min(42, teleprompterFontSize + 2))}
                  className="px-1.5 py-0.5 rounded bg-zinc-800 text-xs font-bold"
                >
                  A+
                </button>
              </div>

              <button
                onClick={() => setShowTeleprompter(false)}
                className="w-8 h-8 rounded-xl bg-[#201F1D] hover:bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition cursor-pointer"
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
            <div className="text-zinc-500 font-mono text-sm uppercase tracking-wider text-center">
              [LOOK DIRECTLY INTO LENS • 3... 2... 1...]
            </div>

            <div className="font-serif leading-relaxed text-zinc-100 whitespace-pre-wrap text-center max-w-2xl mx-auto">
              {teleprompterFullText}
            </div>

            <div className="text-zinc-500 font-mono text-sm uppercase tracking-wider text-center pt-16">
              [END OF RECORDING • CUT CAMERA]
            </div>
          </div>
        </div>
      )}

      {/* Python Code Viewer Modal */}
      {codeModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6">
          <div className={`w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh] border ${
            isDarkMode ? 'bg-[#242320] border-[#383630]' : 'bg-white border-[#E8E5DC]'
          }`}>
            <div className="p-4 border-b border-[#E8E5DC] dark:border-[#383630] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-[#C96442]" />
                <span className="font-mono text-xs font-bold">autosignal/{codeModal.filename}</span>
              </div>
              <button
                onClick={() => setCodeModal(null)}
                className="w-7 h-7 rounded-xl bg-[#F5F3EC] dark:bg-[#2B2A26] flex items-center justify-center text-[#736E65] hover:text-[#1C1917] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-auto bg-[#141413] text-zinc-200 font-mono text-xs">
              <pre className="whitespace-pre">{codeModal.code}</pre>
            </div>
          </div>
        </div>
      )}

      {/* JSON Viewer Modal */}
      {jsonModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6">
          <div className={`w-full max-w-3xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh] border ${
            isDarkMode ? 'bg-[#242320] border-[#383630]' : 'bg-white border-[#E8E5DC]'
          }`}>
            <div className="p-4 border-b border-[#E8E5DC] dark:border-[#383630] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-500" />
                <span className="font-mono text-xs font-bold">{jsonModal.title}</span>
              </div>
              <button
                onClick={() => setJsonModal(null)}
                className="w-7 h-7 rounded-xl bg-[#F5F3EC] dark:bg-[#2B2A26] flex items-center justify-center text-[#736E65] hover:text-[#1C1917] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-auto bg-[#141413] text-emerald-400 font-mono text-xs">
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
          <div className={`w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] border ${
            isDarkMode ? 'bg-[#1E1D1A] border-[#383630]' : 'bg-white border-[#E8E5DC]'
          }`}>
            {/* Modal Header */}
            <div className="p-5 border-b border-[#E8E5DC] dark:border-[#383630] flex items-center justify-between shrink-0 bg-[#F5F3EC]/50 dark:bg-[#242320]/50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-[#FAF0EB] dark:bg-[#2F241F] text-[#C96442] flex items-center justify-center border border-[#E8D0C5] dark:border-[#4A342B]">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-serif text-lg font-bold text-[#1C1917] dark:text-white">
                    Studio Settings & Niches
                  </h3>
                  <p className="text-xs text-[#736E65] dark:text-[#9E9A90]">
                    Switch between all 20 content categories, configure API keys, and tune scanner gates
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowSettingsModal(false)}
                className="w-8 h-8 rounded-xl bg-[#F5F3EC] dark:bg-[#2B2A26] flex items-center justify-center text-[#736E65] hover:text-[#1C1917] dark:hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Tab Navigation */}
            <div className="px-5 pt-3 pb-2 border-b border-[#E8E5DC] dark:border-[#383630] flex items-center gap-2 shrink-0 bg-[#FAF9F5] dark:bg-[#1B1A18]">
              <button
                onClick={() => setSettingsTab('niches')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  settingsTab === 'niches'
                    ? 'bg-[#C96442] text-white shadow-xs'
                    : 'text-[#736E65] dark:text-[#9E9A90] hover:bg-[#EAE6DC] dark:hover:bg-[#282723]'
                }`}
              >
                <Flame className="w-3.5 h-3.5" />
                <span>All 20 Niches ({niches.length})</span>
              </button>

              <button
                onClick={() => setSettingsTab('keys')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  settingsTab === 'keys'
                    ? 'bg-[#C96442] text-white shadow-xs'
                    : 'text-[#736E65] dark:text-[#9E9A90] hover:bg-[#EAE6DC] dark:hover:bg-[#282723]'
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
                    ? 'bg-[#C96442] text-white shadow-xs'
                    : 'text-[#736E65] dark:text-[#9E9A90] hover:bg-[#EAE6DC] dark:hover:bg-[#282723]'
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
                    <div className="flex items-center gap-2 flex-1 bg-[#F5F3EC] dark:bg-[#242320] px-3.5 py-2 rounded-2xl border border-[#E8E5DC] dark:border-[#383630]">
                      <Search className="w-4 h-4 text-[#736E65]" />
                      <input
                        type="text"
                        placeholder="Search among all 20 niches (e.g. woodworking, gaming, crypto)..."
                        value={nicheSearch}
                        onChange={e => setNicheSearch(e.target.value)}
                        className="bg-transparent border-none text-xs text-[#1C1917] dark:text-white placeholder-[#736E65] focus:outline-none w-full"
                      />
                      {nicheSearch && (
                        <button onClick={() => setNicheSearch('')} className="text-[#736E65]">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="text-xs text-[#736E65] dark:text-[#9E9A90] shrink-0 font-mono">
                      Active: <span className="font-semibold text-[#C96442] uppercase">{selectedNiche}</span>
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
                            ? 'bg-[#1C1917] text-white dark:bg-white dark:text-black font-semibold'
                            : 'bg-[#F5F3EC] dark:bg-[#242320] text-[#736E65] dark:text-[#9E9A90] hover:text-[#1C1917] dark:hover:text-white'
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
                            className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                              isSelected
                                ? 'bg-[#FAF0EB] dark:bg-[#2F241F] border-[#C96442] shadow-sm ring-2 ring-[#C96442]/20'
                                : 'bg-white dark:bg-[#242320] border-[#E8E5DC] dark:border-[#383630] hover:border-[#C96442]/50'
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-xl">{n.icon}</span>
                                  <span className="font-serif text-sm font-bold text-[#1C1917] dark:text-white">
                                    {n.label}
                                  </span>
                                </div>
                                {isSelected ? (
                                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#C96442] text-white font-bold">
                                    ACTIVE
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#F5F3EC] dark:bg-[#1B1A18] text-[#736E65] dark:text-[#9E9A90]">
                                    {n.category?.split(' ')[0] || 'Niche'}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-[#736E65] dark:text-[#9E9A90] line-clamp-2 leading-relaxed">
                                {n.description}
                              </p>
                            </div>

                            <div className="pt-2 border-t border-[#E8E5DC] dark:border-[#302F2A] flex items-center justify-between text-[11px] font-mono text-[#736E65] dark:text-[#9E9A90]">
                              <span>{n.outlierCount || 8} Outliers</span>
                              <span className="text-[#C96442] font-semibold">
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
                <div className="space-y-5">
                  <div className="p-4 rounded-2xl bg-[#FAF0EB] dark:bg-[#2F241F] border border-[#E8D0C5] dark:border-[#4A342B] space-y-1">
                    <div className="text-xs font-semibold text-[#C96442] flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4" />
                      <span>Zero-Config Intelligent Architecture</span>
                    </div>
                    <p className="text-xs text-[#736E65] dark:text-[#EDEAE2] leading-relaxed">
                      AutoSignal operates out of the box with built-in high-fidelity benchmarks across all 20 niches. You do not need any external keys to generate masterclass briefs, teleprompter scripts, or run the sequential pipeline.
                    </p>
                  </div>

                  {/* Gemini API Key Status Card */}
                  <div className={`p-5 rounded-2xl border space-y-3 ${
                    isDarkMode ? 'bg-[#242320] border-[#383630]' : 'bg-white border-[#E8E5DC]'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                          <Sparkles className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-semibold text-xs text-[#1C1917] dark:text-white flex items-center gap-2">
                            <span>Google Gemini AI Engine</span>
                            <span className="text-[10px] font-mono bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              ACTIVE & VERIFIED
                            </span>
                          </div>
                          <div className="text-[11px] text-[#736E65] dark:text-[#9E9A90] font-mono">
                            Model: {apiKeysStatus?.geminiModel || 'gemini-2.5-flash'} • Server-Side Proxy
                          </div>
                        </div>
                      </div>

                      <span className="text-[10px] font-mono font-bold bg-[#FAF0EB] dark:bg-[#2F241F] text-[#C96442] px-2 py-1 rounded-xl">
                        NO KEY NEEDED
                      </span>
                    </div>

                    <p className="text-xs text-[#736E65] dark:text-[#9E9A90] leading-relaxed">
                      Google Gemini 2.5 Flash is injected automatically via AI Studio environment secrets. Masterclass brief generation, 20-second psychological hooks, YouTube titles, and pacing schedules run server-side with zero browser exposure.
                    </p>
                  </div>

                  {/* YouTube Data API v3 Status Card */}
                  <div className={`p-5 rounded-2xl border space-y-4 ${
                    isDarkMode ? 'bg-[#242320] border-[#383630]' : 'bg-white border-[#E8E5DC]'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-red-500/15 text-red-600 dark:text-red-400 flex items-center justify-center">
                          <Video className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-semibold text-xs text-[#1C1917] dark:text-white flex items-center gap-2">
                            <span>YouTube Data API v3 (Optional)</span>
                            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                              apiKeysStatus?.youtubeConfigured
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                            }`}>
                              {apiKeysStatus?.youtubeConfigured ? 'CUSTOM KEY ACTIVE' : 'BENCHMARK ENGINE ACTIVE'}
                            </span>
                          </div>
                          <div className="text-[11px] text-[#736E65] dark:text-[#9E9A90]">
                            Live Google Search crawl & video metadata extraction
                          </div>
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-[#736E65] dark:text-[#9E9A90] leading-relaxed">
                      All 20 niches include pre-indexed benchmark databases. If you wish to fetch live real-time YouTube search results for custom search terms directly from Google's servers, enter your personal YouTube Data API v3 key below:
                    </p>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-[#1C1917] dark:text-white flex items-center gap-1.5">
                        <Key className="w-3.5 h-3.5 text-[#C96442]" />
                        <span>Custom YouTube API Key</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="password"
                          placeholder="AIzaSy..."
                          value={youtubeKeyInput}
                          onChange={e => setYoutubeKeyInput(e.target.value)}
                          className="flex-1 p-2.5 rounded-xl border bg-[#F5F3EC] dark:bg-[#1B1A18] border-[#E8E5DC] dark:border-[#383630] font-mono text-xs text-[#1C1917] dark:text-white focus:outline-none focus:border-[#C96442]"
                        />
                        <button
                          onClick={handleSaveYoutubeApiKey}
                          disabled={savingKey}
                          className="px-4 py-2.5 rounded-xl bg-[#C96442] hover:bg-[#B55232] text-white text-xs font-semibold shadow-xs transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                        >
                          {savingKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          <span>Save Key</span>
                        </button>
                      </div>
                    </div>

                    {/* Step-by-Step Guide on How to Add YouTube API Key */}
                    <div className="p-4 rounded-xl bg-[#F5F3EC] dark:bg-[#1B1A18] border border-[#E8E5DC] dark:border-[#383630] space-y-2.5">
                      <div className="text-xs font-semibold text-[#1C1917] dark:text-white flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5 text-[#C96442]" />
                        <span>How to get your free YouTube Data API v3 Key (3 Minutes):</span>
                      </div>
                      <ol className="text-xs text-[#736E65] dark:text-[#9E9A90] space-y-1.5 list-decimal pl-4 leading-relaxed">
                        <li>
                          Open <span className="text-[#C96442] font-mono font-semibold">console.cloud.google.com</span> and create or select a Google Cloud project.
                        </li>
                        <li>
                          Navigate to <strong>APIs & Services</strong> &gt; <strong>Library</strong>, search for <strong>YouTube Data API v3</strong>, and click <strong>Enable</strong>.
                        </li>
                        <li>
                          Go to <strong>APIs & Services</strong> &gt; <strong>Credentials</strong>, click <strong>+ Create Credentials</strong> &gt; <strong>API key</strong>.
                        </li>
                        <li>
                          Paste the key above (starts with <code className="font-mono text-[#C96442]">AIzaSy...</code>) and click <strong>Save Key</strong>. The app will immediately verify and use it for live video indexing and database saves!
                        </li>
                      </ol>
                    </div>
                  </div>
                </div>
              )}

              {/* ───────────────── TAB 3: SCANNER GATES ───────────────────── */}
              {settingsTab === 'gates' && (
                <div className="space-y-4">
                  <div className={`p-5 rounded-2xl border space-y-4 ${
                    isDarkMode ? 'bg-[#242320] border-[#383630]' : 'bg-white border-[#E8E5DC]'
                  }`}>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span>Outperformance Ratio Admission Gate</span>
                        <span className="font-mono text-[#C96442]">{gateMultiplier.toFixed(1)}× Channel Baseline</span>
                      </div>
                      <p className="text-[11px] text-[#736E65] dark:text-[#9E9A90]">
                        Only videos beating channel historical 90-day baseline by this multiplier pass Step 2 filter.
                      </p>
                      <input
                        type="range"
                        min="2.0"
                        max="8.0"
                        step="0.5"
                        value={gateMultiplier}
                        onChange={e => setGateMultiplier(Number(e.target.value))}
                        className="w-full accent-[#C96442] cursor-pointer"
                      />
                    </div>

                    <div className="space-y-1 pt-3 border-t border-[#E8E5DC] dark:border-[#302F2A]">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span>Minimum Video Duration Filter</span>
                        <span className="font-mono text-[#C96442]">{gateMinDuration}s ({Math.floor(gateMinDuration / 60)} min)</span>
                      </div>
                      <p className="text-[11px] text-[#736E65] dark:text-[#9E9A90]">
                        Filters out ultra-short teaser clips to guarantee substantive topic depth.
                      </p>
                      <input
                        type="range"
                        min="60"
                        max="360"
                        step="30"
                        value={gateMinDuration}
                        onChange={e => setGateMinDuration(Number(e.target.value))}
                        className="w-full accent-[#C96442] cursor-pointer"
                      />
                    </div>

                    <div className="space-y-1 pt-3 border-t border-[#E8E5DC] dark:border-[#302F2A]">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span>Upload Freshness Window</span>
                        <span className="font-mono text-[#C96442]">{gateFreshnessDays} Days</span>
                      </div>
                      <p className="text-[11px] text-[#736E65] dark:text-[#9E9A90]">
                        Breakout discovery horizon. Focuses on newly published breakout spikes.
                      </p>
                      <input
                        type="range"
                        min="7"
                        max="90"
                        step="7"
                        value={gateFreshnessDays}
                        onChange={e => setGateFreshnessDays(Number(e.target.value))}
                        className="w-full accent-[#C96442] cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-[#E8E5DC] dark:border-[#383630] flex items-center justify-between shrink-0 bg-[#FAF9F5] dark:bg-[#1B1A18]">
              <span className="text-xs text-[#736E65] dark:text-[#9E9A90] font-mono">
                AutoSignal Engine v2.5 • 20 Niches Active
              </span>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="px-5 py-2 rounded-xl bg-[#1C1917] text-white dark:bg-white dark:text-black text-xs font-semibold transition cursor-pointer"
              >
                Close Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* AI VIDEO STUDIO - COMING SOON ROADMAP & ARCHITECTURE MODAL             */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {showComingSoonModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 sm:p-6">
          <div className="w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col bg-[#141413] border border-purple-500/40 text-white">
            {/* Header */}
            <div className="p-6 border-b border-zinc-800 bg-gradient-to-r from-purple-950/60 via-zinc-900 to-black flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500 to-[#C96442] flex items-center justify-center text-white shadow-lg">
                  <Film className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-serif text-lg font-bold">
                      Neural AI Video Studio Pipeline
                    </h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-400 text-black font-black uppercase">
                      COMING SOON
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    End-to-End Generative Video Rendering Architecture
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowComingSoonModal(false)}
                className="w-8 h-8 rounded-xl bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Pipeline Stage Roadmap */}
            <div className="p-6 space-y-5 overflow-y-auto max-h-[70vh]">
              <div className="space-y-3">
                <div className="text-xs font-mono uppercase text-zinc-400 font-bold tracking-wider">
                  Video Generation Pipeline Status
                </div>

                <div className="space-y-3">
                  {/* Stage 1 */}
                  <div className="p-3.5 rounded-2xl bg-zinc-900/90 border border-emerald-500/40 flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      ✓
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs text-emerald-300">Stage 1: Script & Kinetic Hooks Extraction</span>
                        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">READY NOW</span>
                      </div>
                      <p className="text-xs text-zinc-400 mt-1">
                        Outlier video deconstruction, curiosity titles, 20-second retention hooks, and chapter pacing schedules are fully working and downloadable.
                      </p>
                    </div>
                  </div>

                  {/* Stage 2 */}
                  <div className="p-3.5 rounded-2xl bg-zinc-900/90 border border-purple-500/40 flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      2
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs text-purple-300">Stage 2: Voiceover & Audio Ducking</span>
                        <span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded">BETA</span>
                      </div>
                      <p className="text-xs text-zinc-400 mt-1">
                        4-tone creator voice synthesis (Marcus, Elena, Kai, Sarah) combined with background lo-fi/phonk ducking soundtrack.
                      </p>
                    </div>
                  </div>

                  {/* Stage 3 */}
                  <div className="p-3.5 rounded-2xl bg-zinc-900/90 border border-amber-500/40 flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      3
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs text-amber-300">Stage 3: Neural B-Roll & Visual Generation</span>
                        <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">COMING SOON</span>
                      </div>
                      <p className="text-xs text-zinc-400 mt-1">
                        Integration with Google Veo 2 and Runway Gen-3 Alpha to synthesize 1080p photorealistic faceless video b-roll aligned to spoken beats.
                      </p>
                    </div>
                  </div>

                  {/* Stage 4 */}
                  <div className="p-3.5 rounded-2xl bg-zinc-900/90 border border-zinc-700 flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-zinc-800 text-zinc-400 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      4
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs text-zinc-300">Stage 4: Remotion / FFmpeg Final MP4 Render</span>
                        <span className="text-[10px] font-mono text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">IN QUEUE</span>
                      </div>
                      <p className="text-xs text-zinc-400 mt-1">
                        Automated video compositing engine outputting 60 FPS vertical MP4 files with bouncing Hormozi captions burned in.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Instant Action */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-900/30 to-[#C96442]/30 border border-purple-500/30 flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-bold text-white">Want the production package right now?</div>
                  <div className="text-[11px] text-zinc-400">Export the JSON bundle containing hooks, outline, and prompts for CapCut / Premiere.</div>
                </div>
                <button
                  onClick={() => {
                    setShowComingSoonModal(false);
                    showToast('Use "Download Full Metadata & Script Package" to export!', 'info');
                  }}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shrink-0 cursor-pointer"
                >
                  Got It
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-zinc-800 bg-zinc-950 flex items-center justify-between text-xs text-zinc-400">
              <span className="font-mono text-[11px]">AutoSignal Generative Video Suite</span>
              <button
                onClick={() => setShowComingSoonModal(false)}
                className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-medium cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
