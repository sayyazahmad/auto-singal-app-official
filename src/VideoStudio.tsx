import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  ChevronLeft,
  Check,
  Clapperboard,
  Copy,
  Download,
  Film,
  LayoutTemplate,
  Link2,
  Mic,
  Music,
  RotateCcw,
  Scissors,
  Trash2,
  Type,
  Upload,
  X
} from 'lucide-react';

// Structural subsets of App's BriefItem / VideoItem, so this file doesn't import from App
interface StudioBrief {
  topic?: string;
  hook_script?: string;
  titles?: { title_1_search_match?: string; title_2_curiosity?: string; title_3_value?: string };
  thumbnail_direction?: { primary_image?: string; text_overlay?: string };
  pacing_outline?: Array<{ time: string; beat: string; action: string }>;
}

interface StudioVideo {
  video_id: string;
  title: string;
  channel_title: string;
  view_count: number;
  outperformance_ratio: number;
  thumbnail_url: string;
}

interface VideoStudioProps {
  brief?: StudioBrief;
  topic: string;
  nicheId: string;
  nicheLabel: string;
  videos: StudioVideo[];
  hookScript: string;
  thumbnailPrompt: string;
  showToast: (message: string, type?: 'success' | 'info' | 'error') => void;
  onCopy: (text: string, key: string, label?: string) => void;
  // Set by other views ("open in Video Studio"); key changes on every request
  openRequest?: { tab: Tab; clipSource?: string; key: number } | null;
}

type Tab = 'create' | 'templates' | 'clips';
type Aspect = '16:9' | '9:16';

// The one video model offered for now. Price is Google's list rate for 720p output.
const VIDEO_MODEL = { id: 'gemini-omni-1.1-flash', name: 'Gemini Omni 1.1 Flash', usdPerSecond: 0.10 };

const CAPTION_STYLES = [
  { id: 'hormozi', name: 'Bold pop', sample: 'NEVER DO THIS', className: 'text-yellow-300 font-extrabold tracking-tight drop-shadow-[0_2px_3px_rgba(0,0,0,0.9)]' },
  { id: 'minimal', name: 'Minimal', sample: 'Step-by-step fix', className: 'text-white font-medium bg-black/60 px-2 py-0.5 rounded' },
  { id: 'neon', name: 'Karaoke', sample: 'THE SECRET TRICK', className: 'text-cyan-300 font-bold drop-shadow-[0_0_6px_rgba(34,211,238,0.8)]' },
  { id: 'red', name: 'Alert', sample: 'CRITICAL MISTAKE', className: 'text-red-500 font-bold uppercase tracking-wide drop-shadow-[0_2px_3px_rgba(0,0,0,0.9)]' }
] as const;

const VOICES = [
  { id: 'marcus', name: 'Marcus', note: 'Deep, firm' },
  { id: 'elena', name: 'Elena', note: 'Crisp, clear' },
  { id: 'kai', name: 'Kai', note: 'Fast, casual' },
  { id: 'sarah', name: 'Sarah', note: 'Warm storyteller' }
] as const;

const MUSIC = [
  { id: 'lofi', name: 'Lo-fi chill', note: '85 BPM' },
  { id: 'tension', name: 'Suspense pulse', note: '110 BPM' },
  { id: 'phonk', name: 'High-energy phonk', note: '135 BPM' },
  { id: 'ambient', name: 'Subtle ambience', note: '60 BPM' }
] as const;

const PACING = [
  { id: 'fast', name: 'Fast', note: '1.5s cuts' },
  { id: 'dynamic', name: 'Balanced', note: '2.8s cuts' },
  { id: 'documentary', name: 'Slow', note: '4.5s cuts' }
] as const;

type TemplateCategory = 'Shorts' | 'Long-form' | 'Story' | 'Education';

// `layout` picks the drawn preview; several templates share a layout at different aspects
const TEMPLATES: Array<{ id: string; name: string; note: string; aspect: Aspect; length: string; category: TemplateCategory; layout: string }> = [
  { id: 'faceless', name: 'Faceless short', note: 'Voiceover, B-roll and big captions', aspect: '9:16', length: '30–60s', category: 'Shorts', layout: 'captions' },
  { id: 'splitscreen', name: 'Split screen', note: 'Your clip on top, gameplay or B-roll below', aspect: '9:16', length: '30–60s', category: 'Shorts', layout: 'split' },
  { id: 'countdown', name: 'Countdown list', note: 'Top 3 or 5 tips on numbered cards', aspect: '9:16', length: '45–60s', category: 'Shorts', layout: 'countdown' },
  { id: 'quote', name: 'Quote card', note: 'One strong line, read out over a slow zoom', aspect: '9:16', length: '15–30s', category: 'Shorts', layout: 'quote' },
  { id: 'beforeafter', name: 'Before / after', note: 'Wipe from the problem to the result', aspect: '9:16', length: '15–45s', category: 'Shorts', layout: 'beforeafter' },
  { id: 'podcast', name: 'Podcast clip', note: 'Two speakers, waveform and live captions', aspect: '9:16', length: '30–90s', category: 'Shorts', layout: 'podcast' },
  { id: 'versus', name: 'This vs that', note: 'Two options side by side, then a verdict', aspect: '9:16', length: '30–60s', category: 'Shorts', layout: 'versus' },
  { id: 'stat', name: 'Stat shock', note: 'Open on one surprising number, then explain it', aspect: '9:16', length: '20–40s', category: 'Shorts', layout: 'stat' },
  { id: 'reaction', name: 'Reaction', note: 'Your face in a corner over the source clip', aspect: '9:16', length: '30–60s', category: 'Shorts', layout: 'pip' },
  { id: 'explainer', name: 'Long-form explainer', note: 'Chapters, B-roll and lower thirds', aspect: '16:9', length: '6–10 min', category: 'Long-form', layout: 'chapters' },
  { id: 'news', name: 'News recap', note: 'Headline lower third and a ticker', aspect: '16:9', length: '3–8 min', category: 'Long-form', layout: 'ticker' },
  { id: 'review', name: 'Product review', note: 'Hero shot, pros and cons, star rating', aspect: '16:9', length: '6–12 min', category: 'Long-form', layout: 'rating' },
  { id: 'top10', name: 'Top 10 countdown', note: 'Ten ranked items with a number card each', aspect: '16:9', length: '8–15 min', category: 'Long-form', layout: 'countdown' },
  { id: 'story', name: 'Story time', note: 'A post-style card read out with captions', aspect: '9:16', length: '45–90s', category: 'Story', layout: 'story' },
  { id: 'dayinlife', name: 'Day in the life', note: 'Time stamps and quick cuts through a day', aspect: '9:16', length: '45–90s', category: 'Story', layout: 'vlog' },
  { id: 'tutorial', name: 'Screen tutorial', note: 'Screen recording with zooms on the cursor', aspect: '16:9', length: '5–15 min', category: 'Education', layout: 'screen' },
  { id: 'howto', name: 'Step-by-step how-to', note: 'Numbered steps that tick off as you go', aspect: '9:16', length: '30–60s', category: 'Education', layout: 'steps' },
  { id: 'timeline', name: 'History timeline', note: 'Dates along a line, one event per beat', aspect: '16:9', length: '5–12 min', category: 'Education', layout: 'timeline' },
  { id: 'myth', name: 'Myth vs fact', note: 'Cross out the myth, then show the fact', aspect: '9:16', length: '20–45s', category: 'Education', layout: 'myth' },
  { id: 'faq', name: 'Q&A answers', note: 'Answer one viewer question per video', aspect: '9:16', length: '30–60s', category: 'Education', layout: 'qa' }
];
const TEMPLATE_CATEGORIES: Array<'All' | TemplateCategory> = ['All', 'Shorts', 'Long-form', 'Story', 'Education'];

const CLIP_EFFECTS = [
  { id: 'zoom', name: 'Punch-in zooms' },
  { id: 'emoji', name: 'Emoji highlights' },
  { id: 'progress', name: 'Progress bar' },
  { id: 'titlecard', name: 'Hook title card' }
];

interface PromptDraft {
  id: string;
  prompt: string;
  aspect: Aspect;
  seconds: number;
  outputs: number;
  createdAt: string;
}

interface ClipDraft {
  id: string;
  source: string;
  clipSeconds: number;
  clipCount: number;
  aspect: string;
  captionStyle: string;
  effects: string[];
  createdAt: string;
}

// Drafts are a per-browser convenience; storage can be unavailable (private mode), so never depend on it
function loadDrafts<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

function saveDrafts<T>(key: string, drafts: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(drafts));
  } catch {
    // ignore
  }
}

function Chip({ active, onClick, children, title }: { active?: boolean; onClick?: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition cursor-pointer whitespace-nowrap ${
        active
          ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900'
          : 'bg-ink-100 text-ink-600 hover:bg-ink-150 dark:bg-ink-800 dark:text-ink-300 dark:hover:bg-ink-700'
      }`}
    >
      {children}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-semibold text-ink-500 dark:text-ink-400 mb-2">{children}</div>;
}

// A drawn frame standing in for a template's layout. Inner sizes use em, so `large` just scales the font.
function TemplatePreview({ layout, aspect, large = false, caption }: { layout: string; aspect: Aspect; large?: boolean; caption?: React.ReactNode }) {
  const frame = large
    ? aspect === '9:16' ? 'aspect-[9/16] w-full max-w-[260px]' : 'aspect-video w-full'
    : aspect === '9:16' ? 'aspect-[9/16] w-24' : 'aspect-video w-44';
  const line = (w: string, opacity = 0.4) => <div className="h-[0.45em] rounded-full bg-white" style={{ width: w, opacity }} />;
  return (
    <div className={`${frame} rounded-lg bg-ink-900 overflow-hidden relative mx-auto`} style={{ fontSize: large ? 18 : 8 }}>
      {layout === 'captions' && (
        <>
          <div className="absolute inset-0 bg-gradient-to-b from-brand-800/60 to-ink-950" />
          {!caption && <div className="absolute inset-x-[8%] top-1/2 -translate-y-1/2 text-center text-[1.15em] font-extrabold text-yellow-300 leading-tight">STOP DOING<br />THIS</div>}
          <div className="absolute bottom-[6%] inset-x-[12%] h-[0.3em] rounded-full bg-white/30" />
        </>
      )}
      {layout === 'split' && (
        <>
          <div className="absolute inset-x-0 top-0 h-1/2 bg-brand-800/70 border-b border-white/20" />
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-ink-700" />
          {!caption && <div className="absolute inset-x-[8%] top-1/2 -translate-y-1/2 text-center text-[1em] font-bold text-white bg-black/50 rounded">captions</div>}
        </>
      )}
      {layout === 'countdown' && (
        <>
          <div className="absolute inset-0 bg-ink-850" />
          <div className="absolute top-[12%] inset-x-0 text-center text-[2.6em] font-extrabold text-brand-300">#3</div>
          <div className="absolute bottom-[12%] inset-x-[10%] space-y-[0.5em]">{line('100%')}{line('65%', 0.25)}</div>
        </>
      )}
      {layout === 'chapters' && (
        <>
          <div className="absolute inset-0 bg-gradient-to-br from-brand-900/70 to-ink-950" />
          <div className="absolute bottom-[12%] left-[5%] px-[0.6em] py-[0.25em] rounded bg-white/90 text-[0.9em] font-bold text-ink-900">Chapter 2 · The fix</div>
          <div className="absolute bottom-0 inset-x-0 h-[0.25em] bg-white/20"><div className="h-full w-2/5 bg-brand-400" /></div>
        </>
      )}
      {layout === 'quote' && (
        <>
          <div className="absolute inset-0 bg-ink-950" />
          <div className="absolute top-[12%] left-[10%] text-[3em] leading-none font-bold text-brand-300">“</div>
          <div className="absolute top-[38%] inset-x-[10%] space-y-[0.5em]">{line('100%', 0.7)}{line('90%', 0.7)}{line('60%', 0.7)}</div>
          <div className="absolute bottom-[14%] left-[10%] text-[0.9em] text-white/60">— Creator name</div>
        </>
      )}
      {layout === 'beforeafter' && (
        <>
          <div className="absolute inset-y-0 left-0 w-1/2 bg-ink-700" />
          <div className="absolute inset-y-0 right-0 w-1/2 bg-brand-700" />
          <div className="absolute inset-y-0 left-1/2 w-[0.2em] -translate-x-1/2 bg-white" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1.4em] h-[1.4em] rounded-full bg-white" />
          <div className="absolute top-[8%] left-[6%] text-[0.9em] font-bold text-white/80">BEFORE</div>
          <div className="absolute top-[8%] right-[6%] text-[0.9em] font-bold text-white">AFTER</div>
        </>
      )}
      {layout === 'podcast' && (
        <>
          <div className="absolute inset-0 bg-ink-850" />
          <div className="absolute top-[14%] inset-x-0 flex justify-center gap-[1em]">
            <div className="w-[3em] h-[3em] rounded-full bg-brand-600 ring-[0.25em] ring-brand-300/50" />
            <div className="w-[3em] h-[3em] rounded-full bg-ink-600" />
          </div>
          <div className="absolute bottom-[16%] inset-x-[10%] h-[3em] flex items-center justify-between">
            {[30, 60, 90, 50, 75, 40, 85, 55, 35, 70, 45].map((h, i) => <div key={i} className="w-[0.35em] rounded-full bg-brand-300" style={{ height: `${h}%` }} />)}
          </div>
        </>
      )}
      {layout === 'story' && (
        <>
          <div className="absolute inset-0 bg-gradient-to-b from-ink-700 to-ink-950" />
          <div className="absolute top-[22%] inset-x-[8%] rounded-[0.6em] bg-white p-[0.7em] space-y-[0.45em]">
            <div className="flex items-center gap-[0.4em]"><div className="w-[1.2em] h-[1.2em] rounded-full bg-orange-500" /><div className="h-[0.4em] w-[45%] rounded-full bg-ink-300" /></div>
            <div className="h-[0.4em] rounded-full bg-ink-800" />
            <div className="h-[0.4em] w-[80%] rounded-full bg-ink-800" />
            <div className="h-[0.4em] w-[60%] rounded-full bg-ink-300" />
          </div>
        </>
      )}
      {layout === 'ticker' && (
        <>
          <div className="absolute inset-0 bg-gradient-to-br from-ink-700 to-ink-900" />
          <div className="absolute bottom-[20%] left-0 right-[25%] bg-white/95 px-[0.6em] py-[0.35em] flex items-center gap-[0.5em]">
            <span className="bg-red-600 text-white text-[0.8em] font-bold px-[0.4em] rounded-sm">NEWS</span>
            <div className="h-[0.45em] flex-1 rounded-full bg-ink-800" />
          </div>
          <div className="absolute bottom-0 inset-x-0 h-[1.3em] bg-brand-700 flex items-center px-[0.5em] gap-[0.6em]">{line('30%', 0.7)}{line('25%', 0.5)}{line('20%', 0.5)}</div>
        </>
      )}
      {layout === 'screen' && (
        <>
          <div className="absolute inset-0 bg-ink-700" />
          <div className="absolute inset-[8%] rounded-[0.4em] bg-ink-100 overflow-hidden">
            <div className="h-[1.1em] bg-ink-300 flex items-center gap-[0.25em] px-[0.4em]">{['bg-red-400', 'bg-amber-400', 'bg-green-500'].map(c => <div key={c} className={`w-[0.45em] h-[0.45em] rounded-full ${c}`} />)}</div>
            <div className="p-[0.6em] space-y-[0.4em]"><div className="h-[0.45em] w-[70%] rounded-full bg-ink-400" /><div className="h-[0.45em] w-[50%] rounded-full bg-ink-300" /><div className="h-[1.6em] w-[40%] rounded bg-brand-600" /></div>
          </div>
          <svg viewBox="0 0 10 14" className="absolute left-[52%] top-[56%] w-[1.3em] h-[1.8em]"><path d="M0 0 L0 11 L3 8 L5 13 L7 12 L5 7 L9 7 Z" fill="white" stroke="black" strokeWidth="0.8" /></svg>
        </>
      )}
      {layout === 'versus' && (
        <>
          <div className="absolute inset-y-0 left-0 w-1/2 bg-brand-800" />
          <div className="absolute inset-y-0 right-0 w-1/2 bg-ink-700" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[2.4em] h-[2.4em] rounded-full bg-white flex items-center justify-center text-[1em] font-extrabold text-ink-900">VS</div>
          <div className="absolute bottom-[10%] left-[8%] text-[0.9em] font-bold text-white">A</div>
          <div className="absolute bottom-[10%] right-[8%] text-[0.9em] font-bold text-white">B</div>
        </>
      )}
      {layout === 'steps' && (
        <>
          <div className="absolute inset-0 bg-ink-850" />
          <div className="absolute inset-x-[10%] top-[18%] space-y-[0.9em]">
            {[true, true, false].map((done, i) => (
              <div key={i} className="flex items-center gap-[0.5em]">
                <div className={`w-[1.2em] h-[1.2em] rounded-[0.25em] flex items-center justify-center ${done ? 'bg-brand-500' : 'border-[0.15em] border-white/40'}`}>{done && <Check className="w-[0.9em] h-[0.9em] text-white" />}</div>
                <div className={`h-[0.45em] flex-1 rounded-full ${done ? 'bg-white/40' : 'bg-white/80'}`} />
              </div>
            ))}
          </div>
        </>
      )}
      {layout === 'stat' && (
        <>
          <div className="absolute inset-0 bg-gradient-to-b from-ink-850 to-ink-950" />
          <div className="absolute top-[26%] inset-x-0 text-center text-[2.8em] font-extrabold text-white">73%</div>
          <div className="absolute top-[52%] inset-x-[14%] text-center text-[0.8em] text-white/60">of people get this wrong</div>
          <div className="absolute bottom-[18%] inset-x-[14%] h-[0.5em] rounded-full bg-white/15"><div className="h-full w-[73%] rounded-full bg-brand-400" /></div>
        </>
      )}
      {layout === 'pip' && (
        <>
          <div className="absolute inset-0 bg-gradient-to-br from-brand-900 to-ink-800" />
          {!caption && <div className="absolute top-[40%] inset-x-[8%] text-center text-[1em] font-bold text-white">source clip</div>}
          <div className="absolute bottom-[6%] right-[7%] w-[38%] aspect-square rounded-[0.6em] bg-ink-600 ring-[0.2em] ring-white flex items-end justify-center overflow-hidden">
            <div className="w-[55%] aspect-square rounded-full bg-ink-400 translate-y-[30%]" />
          </div>
        </>
      )}
      {layout === 'timeline' && (
        <>
          <div className="absolute inset-0 bg-ink-850" />
          <div className="absolute top-1/2 inset-x-[6%] h-[0.2em] bg-white/30" />
          {['1900', '1950', '1990', '2020'].map((yr, i) => (
            <div key={yr} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center" style={{ left: `${14 + i * 24}%` }}>
              <div className={`w-[0.9em] h-[0.9em] rounded-full ${i === 2 ? 'bg-brand-400' : 'bg-white/70'}`} />
              <div className="text-[0.8em] text-white/70 mt-[0.4em]">{yr}</div>
            </div>
          ))}
        </>
      )}
      {layout === 'myth' && (
        <>
          <div className="absolute inset-0 bg-ink-850" />
          <div className="absolute top-[20%] inset-x-[10%] space-y-[1.2em]">
            <div><span className="text-[0.8em] font-bold text-red-400">MYTH</span><div className="relative mt-[0.3em]">{line('100%', 0.5)}<div className="absolute inset-x-0 top-1/2 h-[0.15em] bg-red-400" /></div></div>
            <div><span className="text-[0.8em] font-bold text-brand-300">FACT</span><div className="mt-[0.3em] space-y-[0.35em]">{line('100%', 0.8)}{line('70%', 0.8)}</div></div>
          </div>
        </>
      )}
      {layout === 'rating' && (
        <>
          <div className="absolute inset-0 bg-gradient-to-br from-ink-800 to-ink-950" />
          <div className="absolute left-[8%] top-1/2 -translate-y-1/2 w-[30%] aspect-square rounded-[0.5em] bg-ink-600" />
          <div className="absolute left-[44%] top-[30%] right-[8%] space-y-[0.5em]">
            <div className="flex gap-[0.2em] text-[1.1em] text-yellow-300">★★★★<span className="text-white/30">★</span></div>
            {line('90%', 0.6)}{line('70%', 0.35)}
          </div>
        </>
      )}
      {layout === 'vlog' && (
        <>
          <div className="absolute inset-0 bg-gradient-to-b from-brand-900/80 to-ink-900" />
          <div className="absolute top-[6%] left-[8%] px-[0.5em] py-[0.15em] rounded-full bg-black/50 text-[0.85em] font-semibold text-white">7:30 AM</div>
          {!caption && <div className="absolute bottom-[14%] inset-x-[8%] text-center text-[0.95em] font-bold text-white">first coffee, then the gym</div>}
        </>
      )}
      {layout === 'qa' && (
        <>
          <div className="absolute inset-0 bg-ink-850" />
          <div className="absolute top-[12%] left-[8%] right-[18%] rounded-[0.7em] rounded-bl-none bg-white px-[0.7em] py-[0.5em]">
            <span className="text-[0.85em] font-bold text-ink-900">Q:</span>
            <div className="h-[0.4em] mt-[0.3em] rounded-full bg-ink-700" /><div className="h-[0.4em] w-[60%] mt-[0.3em] rounded-full bg-ink-400" />
          </div>
          <div className="absolute bottom-[16%] inset-x-[10%] space-y-[0.45em]">{line('100%', 0.6)}{line('85%', 0.6)}{line('55%', 0.6)}</div>
        </>
      )}
      {caption && <div className="absolute inset-x-[6%] top-1/2 -translate-y-1/2 text-center">{caption}</div>}
    </div>
  );
}

export default function VideoStudio({ brief, topic, nicheId, nicheLabel, videos, hookScript, thumbnailPrompt, showToast, onCopy, openRequest }: VideoStudioProps) {
  const [tab, setTab] = useState<Tab>('create');

  // ── Create ──
  const [prompt, setPrompt] = useState('');
  const [aspect, setAspect] = useState<Aspect>('9:16');
  const [seconds, setSeconds] = useState(8);
  const [outputs, setOutputs] = useState(1);
  const [promptDrafts, setPromptDrafts] = useState<PromptDraft[]>(() => loadDrafts<PromptDraft>('studio_prompt_drafts'));
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const estimatedCost = VIDEO_MODEL.usdPerSecond * seconds * outputs;

  // ── Templates ──
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [templateCategory, setTemplateCategory] = useState<'All' | TemplateCategory>('All');
  const [script, setScript] = useState('');
  const [pacing, setPacing] = useState<string>('fast');
  const [captionStyle, setCaptionStyle] = useState<string>('hormozi');
  const [voice, setVoice] = useState<string>('marcus');
  const [music, setMusic] = useState<string>('lofi');
  const [titleIdx, setTitleIdx] = useState(0);

  // ── Clips ──
  const [clipSource, setClipSource] = useState('');
  const [clipFileName, setClipFileName] = useState('');
  const [clipSeconds, setClipSeconds] = useState(30);
  const [clipCount, setClipCount] = useState(5);
  const [clipAspect, setClipAspect] = useState('9:16');
  const [clipCaption, setClipCaption] = useState<string>('hormozi');
  const [clipEffects, setClipEffects] = useState<string[]>(['zoom', 'titlecard']);
  const [clipDrafts, setClipDrafts] = useState<ClipDraft[]>(() => loadDrafts<ClipDraft>('studio_clip_drafts'));

  useEffect(() => {
    if (!openRequest) return;
    setTab(openRequest.tab);
    if (openRequest.clipSource) {
      setClipFileName('');
      setClipSource(openRequest.clipSource);
    }
  }, [openRequest?.key]);

  useEffect(() => saveDrafts('studio_prompt_drafts', promptDrafts), [promptDrafts]);
  useEffect(() => saveDrafts('studio_clip_drafts', clipDrafts), [clipDrafts]);

  // Grow the prompt box with its content, Flow/ChatGPT style
  useEffect(() => {
    const el = promptRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [prompt]);

  const titles = [
    brief?.titles?.title_2_curiosity,
    brief?.titles?.title_1_search_match,
    brief?.titles?.title_3_value
  ].filter((t): t is string => Boolean(t));

  const defaultScript = useMemo(() => {
    const outline = (brief?.pacing_outline || []).map(b => `[${b.time}] ${b.beat}: ${b.action}`).join('\n');
    return `${hookScript}${outline ? `\n\n${outline}` : ''}`;
  }, [hookScript, brief]);

  const suggestions = useMemo(() => {
    const list: string[] = [];
    if (brief?.thumbnail_direction?.primary_image) list.push(brief.thumbnail_direction.primary_image);
    list.push(`Slow cinematic B-roll for a video about ${topic.toLowerCase()}, natural light, shallow depth of field`);
    videos.slice(0, 2).forEach(v => list.push(`An opening shot that captures the feel of "${v.title}"`));
    return list.slice(0, 4);
  }, [brief, topic, videos]);

  const handleGenerate = () => {
    const text = prompt.trim();
    if (!text) {
      showToast('Describe the video first', 'error');
      promptRef.current?.focus();
      return;
    }
    const draft: PromptDraft = { id: `p_${Date.now().toString(36)}`, prompt: text, aspect, seconds, outputs, createdAt: new Date().toISOString() };
    setPromptDrafts(prev => [draft, ...prev]);
    setPrompt('');
    showToast(`Saved as a draft. Video generation isn't connected yet (this run would cost about $${estimatedCost.toFixed(2)}).`, 'info');
  };

  const handleFindClips = () => {
    const source = clipFileName || clipSource.trim();
    if (!source) {
      showToast('Paste a YouTube link, upload a video or pick an outlier first', 'error');
      return;
    }
    const draft: ClipDraft = {
      id: `c_${Date.now().toString(36)}`,
      source,
      clipSeconds,
      clipCount,
      aspect: clipAspect,
      captionStyle: clipCaption,
      effects: clipEffects,
      createdAt: new Date().toISOString()
    };
    setClipDrafts(prev => [draft, ...prev]);
    showToast("Clip job saved. The clipping engine isn't connected yet.", 'info');
  };

  const openTemplate = (id: string) => {
    setTemplateId(id);
    if (!script) setScript(defaultScript);
  };

  const downloadPackage = () => {
    const template = TEMPLATES.find(t => t.id === templateId);
    const bundle = {
      project: `AutoSignal Video Package: ${topic}`,
      generated_at: new Date().toISOString(),
      niche: nicheId,
      template: template?.id,
      aspect_ratio: template?.aspect,
      pacing,
      captions_style: captionStyle,
      voiceover: voice,
      music,
      selected_title: titles[titleIdx] || topic,
      all_titles: brief?.titles,
      voiceover_script: script || defaultScript,
      pacing_outline: brief?.pacing_outline,
      thumbnail_prompt: thumbnailPrompt
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `video_package_${nicheId}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Downloaded the video package (.json)', 'success');
  };

  const activeCaption = CAPTION_STYLES.find(c => c.id === captionStyle) || CAPTION_STYLES[0];
  const activeTemplate = TEMPLATES.find(t => t.id === templateId);

  return (
    <div className="max-w-6xl w-full mx-auto px-4 md:px-8 pt-8 pb-40 animate-fade-in">
      {/* Header + section switcher */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900 dark:text-white">Video Studio</h1>
          <p className="text-sm text-ink-500 dark:text-ink-400 mt-1">
            {tab === 'create' && 'Describe a shot and generate it with Gemini.'}
            {tab === 'templates' && `Turn your ${nicheLabel.toLowerCase()} brief into a ready-to-edit video.`}
            {tab === 'clips' && 'Cut a long video into captioned shorts.'}
          </p>
        </div>
        <div className="inline-flex p-1 rounded-full bg-ink-100 dark:bg-ink-850 self-start sm:self-auto">
          {([
            { id: 'create', label: 'Create', icon: Clapperboard },
            { id: 'templates', label: 'Templates', icon: LayoutTemplate },
            { id: 'clips', label: 'Clips', icon: Scissors }
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition cursor-pointer ${
                tab === t.id
                  ? 'bg-white text-ink-900 dark:bg-ink-700 dark:text-white shadow-sm'
                  : 'text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-white'
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ───────────────────────── CREATE ───────────────────────── */}
      {tab === 'create' && (
        <>
          {promptDrafts.length === 0 ? (
            <div className="min-h-[45vh] flex flex-col items-center justify-center text-center">
              <h2 className="text-3xl font-semibold text-ink-900 dark:text-white">What do you want to make?</h2>
              <p className="text-sm text-ink-500 dark:text-ink-400 mt-2 max-w-md">
                Start from one of these ideas from your {nicheLabel.toLowerCase()} research, or write your own below.
              </p>
              <div className="mt-8 grid sm:grid-cols-2 gap-3 max-w-3xl w-full text-left">
                {suggestions.map(s => (
                  <button
                    key={s}
                    onClick={() => { setPrompt(s); promptRef.current?.focus(); }}
                    className="p-4 rounded-xl bg-ink-100 dark:bg-ink-850 hover:bg-ink-150 dark:hover:bg-ink-800 text-sm text-ink-700 dark:text-ink-200 leading-snug transition cursor-pointer line-clamp-3"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {promptDrafts.map(d => (
                <div key={d.id} className="group">
                  <div className={`${d.aspect === '9:16' ? 'aspect-[9/16]' : 'aspect-video'} rounded-xl bg-ink-900 dark:bg-ink-850 relative overflow-hidden flex items-center justify-center`}>
                    <div className="text-center px-4">
                      <Film className="w-6 h-6 text-ink-500 mx-auto" />
                      <div className="text-xs text-ink-400 mt-2">Draft, not generated</div>
                    </div>
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button title="Copy prompt" onClick={() => onCopy(d.prompt, d.id, 'Prompt copied')} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"><Copy className="w-3.5 h-3.5" /></button>
                      <button title="Use again" onClick={() => { setPrompt(d.prompt); setAspect(d.aspect); setSeconds(d.seconds); setOutputs(d.outputs); promptRef.current?.focus(); }} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"><RotateCcw className="w-3.5 h-3.5" /></button>
                      <button title="Delete" onClick={() => setPromptDrafts(prev => prev.filter(x => x.id !== d.id))} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <p className="text-sm text-ink-700 dark:text-ink-200 mt-2 line-clamp-2">{d.prompt}</p>
                  <div className="text-xs text-ink-500 dark:text-ink-400 mt-1">{d.aspect} · {d.seconds}s · {d.outputs > 1 ? `${d.outputs} versions` : '1 version'}</div>
                </div>
              ))}
            </div>
          )}

          {/* Prompt bar */}
          <div className="sticky bottom-4 mt-10 z-20">
            <div className="max-w-3xl mx-auto rounded-2xl bg-white dark:bg-ink-850 border border-ink-200 dark:border-ink-700 shadow-lg p-3">
              <textarea
                ref={promptRef}
                rows={2}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleGenerate();
                  }
                }}
                placeholder="Describe the video you want to create..."
                className="w-full resize-none bg-transparent px-2 py-1.5 text-[15px] text-ink-900 dark:text-white placeholder:text-ink-400 focus:outline-none"
              />
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span
                  title={`About $${VIDEO_MODEL.usdPerSecond.toFixed(2)} per second at 720p. Needs a paid (billing-enabled) Gemini API key.`}
                  className="px-3 py-1.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                >
                  {VIDEO_MODEL.name}
                </span>
                <div className="w-px h-5 bg-ink-200 dark:bg-ink-700 mx-1" />
                {(['9:16', '16:9'] as Aspect[]).map(a => (
                  <Chip key={a} active={aspect === a} onClick={() => setAspect(a)}>{a}</Chip>
                ))}
                <div className="w-px h-5 bg-ink-200 dark:bg-ink-700 mx-1" />
                {[4, 6, 8].map(s => (
                  <Chip key={s} active={seconds === s} onClick={() => setSeconds(s)}>{s}s</Chip>
                ))}
                <div className="w-px h-5 bg-ink-200 dark:bg-ink-700 mx-1" />
                {[1, 2].map(n => (
                  <Chip key={n} active={outputs === n} onClick={() => setOutputs(n)} title="Versions to generate">×{n}</Chip>
                ))}
                <div className="ml-auto flex items-center gap-3">
                  <span className="text-xs text-ink-500 dark:text-ink-400" title="Estimate at 720p">≈ ${estimatedCost.toFixed(2)}</span>
                  <button
                    onClick={handleGenerate}
                    disabled={!prompt.trim()}
                    title="Generate"
                    className="w-9 h-9 rounded-full bg-brand-600 hover:bg-brand-700 disabled:bg-ink-200 dark:disabled:bg-ink-700 text-white flex items-center justify-center transition cursor-pointer disabled:cursor-not-allowed"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
            <p className="text-center text-xs text-ink-500 dark:text-ink-400 mt-2">
              Generation isn't connected yet. Prompts are saved as drafts in this browser.
            </p>
          </div>
        </>
      )}

      {/* ───────────────────────── TEMPLATES ───────────────────────── */}
      {tab === 'templates' && !activeTemplate && (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-6">
            {TEMPLATE_CATEGORIES.map(c => (
              <Chip key={c} active={templateCategory === c} onClick={() => setTemplateCategory(c)}>
                {c}{c !== 'All' && <span className="opacity-60 ml-1">{TEMPLATES.filter(t => t.category === c).length}</span>}
              </Chip>
            ))}
            <span className="text-xs text-ink-500 dark:text-ink-400 ml-auto">Fills in from your brief: "{topic}"</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8">
            {TEMPLATES.filter(t => templateCategory === 'All' || t.category === templateCategory).map(t => (
              <button key={t.id} onClick={() => openTemplate(t.id)} className="group text-left cursor-pointer">
                <div className="h-48 rounded-xl bg-ink-100 dark:bg-ink-850 group-hover:bg-ink-150 dark:group-hover:bg-ink-800 transition flex items-center justify-center">
                  <TemplatePreview layout={t.layout} aspect={t.aspect} />
                </div>
                <div className="mt-3 text-sm font-semibold text-ink-900 dark:text-white">{t.name}</div>
                <div className="text-xs text-ink-500 dark:text-ink-400 mt-0.5 line-clamp-2">{t.note}</div>
                <div className="text-xs text-ink-500 dark:text-ink-400 mt-1">{t.category} · {t.aspect} · {t.length}</div>
              </button>
            ))}
          </div>
        </>
      )}

      {tab === 'templates' && activeTemplate && (
        <>
          <button onClick={() => setTemplateId(null)} className="flex items-center gap-1 text-sm text-ink-500 dark:text-ink-400 hover:text-ink-900 dark:hover:text-white cursor-pointer">
            <ChevronLeft className="w-4 h-4" />All templates
          </button>
          <h2 className="text-xl font-semibold text-ink-900 dark:text-white mt-3">{activeTemplate.name}</h2>
          <p className="text-sm text-ink-500 dark:text-ink-400 mt-1">{activeTemplate.note} · {activeTemplate.aspect} · {activeTemplate.length}</p>
          {activeTemplate && (
            <div className="mt-8 grid lg:grid-cols-[280px_1fr] gap-10">
              {/* Live preview */}
              <div className="lg:sticky lg:top-24 self-start">
                <TemplatePreview
                  layout={activeTemplate.layout}
                  aspect={activeTemplate.aspect}
                  large
                  caption={<span className={`text-lg leading-tight ${activeCaption.className}`}>{activeCaption.sample}</span>}
                />
                <div className="text-xs text-ink-500 dark:text-ink-400 mt-3 text-center">
                  {VOICES.find(v => v.id === voice)?.name} voice · {MUSIC.find(m => m.id === music)?.name}
                </div>
                <div className="text-xs text-ink-700 dark:text-ink-200 mt-1 text-center line-clamp-2">{titles[titleIdx] || topic}</div>
              </div>

              <div className="space-y-10">
                {/* 1. Script */}
                <section>
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-semibold text-ink-900 dark:text-white">1. Script</h3>
                    <button onClick={() => setScript(defaultScript)} className="text-xs text-brand-600 dark:text-brand-300 hover:underline cursor-pointer">Reset to brief</button>
                  </div>
                  <p className="text-xs text-ink-500 dark:text-ink-400 mt-1 mb-3">From your current brief. Edit it freely.</p>
                  <textarea
                    value={script}
                    onChange={e => setScript(e.target.value)}
                    rows={8}
                    className="w-full p-4 rounded-xl bg-ink-100 dark:bg-ink-850 text-sm leading-relaxed text-ink-900 dark:text-ink-100 focus:outline-none focus:ring-2 focus:ring-brand-600/40"
                  />
                  {titles.length > 0 && (
                    <div className="mt-4">
                      <SectionLabel>Title</SectionLabel>
                      <div className="space-y-2">
                        {titles.map((t, i) => (
                          <button
                            key={t}
                            onClick={() => setTitleIdx(i)}
                            className={`w-full flex items-center gap-3 text-left p-3 rounded-lg text-sm transition cursor-pointer ${
                              titleIdx === i ? 'bg-brand-50 dark:bg-brand-950 text-ink-900 dark:text-white' : 'hover:bg-ink-100 dark:hover:bg-ink-850 text-ink-700 dark:text-ink-300'
                            }`}
                          >
                            <span className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${titleIdx === i ? 'border-brand-600 bg-brand-600' : 'border-ink-300 dark:border-ink-600'}`}>
                              {titleIdx === i && <Check className="w-3 h-3 text-white" />}
                            </span>
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                {/* 2. Look */}
                <section>
                  <h3 className="text-base font-semibold text-ink-900 dark:text-white mb-4 flex items-center gap-2"><Type className="w-4 h-4 text-ink-400" />2. Captions & pacing</h3>
                  <SectionLabel>Caption style</SectionLabel>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {CAPTION_STYLES.map(c => (
                      <button
                        key={c.id}
                        onClick={() => setCaptionStyle(c.id)}
                        className={`rounded-xl overflow-hidden text-left transition cursor-pointer ${captionStyle === c.id ? 'ring-2 ring-brand-600' : 'hover:opacity-90'}`}
                      >
                        <div className="h-16 bg-ink-900 flex items-center justify-center px-2">
                          <span className={`text-xs ${c.className}`}>{c.sample}</span>
                        </div>
                        <div className="px-3 py-2 text-xs font-medium bg-ink-100 dark:bg-ink-850 text-ink-700 dark:text-ink-200">{c.name}</div>
                      </button>
                    ))}
                  </div>
                  <div className="mt-5">
                    <SectionLabel>Pacing</SectionLabel>
                    <div className="flex flex-wrap gap-2">
                      {PACING.map(p => (
                        <Chip key={p.id} active={pacing === p.id} onClick={() => setPacing(p.id)}>{p.name} · {p.note}</Chip>
                      ))}
                    </div>
                  </div>
                </section>

                {/* 3. Sound */}
                <section>
                  <h3 className="text-base font-semibold text-ink-900 dark:text-white mb-4 flex items-center gap-2"><Mic className="w-4 h-4 text-ink-400" />3. Voice & music</h3>
                  <SectionLabel>Voice</SectionLabel>
                  <div className="flex flex-wrap gap-2">
                    {VOICES.map(v => (
                      <Chip key={v.id} active={voice === v.id} onClick={() => setVoice(v.id)}>{v.name} · {v.note}</Chip>
                    ))}
                  </div>
                  <div className="mt-5">
                    <SectionLabel>Music</SectionLabel>
                    <div className="flex flex-wrap gap-2">
                      {MUSIC.map(m => (
                        <Chip key={m.id} active={music === m.id} onClick={() => setMusic(m.id)}>
                          <span className="inline-flex items-center gap-1"><Music className="w-3 h-3" />{m.name} · {m.note}</span>
                        </Chip>
                      ))}
                    </div>
                  </div>
                </section>

                {/* 4. Export */}
                <section className="pt-6 border-t border-ink-200 dark:border-ink-800">
                  <h3 className="text-base font-semibold text-ink-900 dark:text-white mb-4">4. Export</h3>
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => showToast("Rendering isn't connected yet. Download the package or copy the script for now.", 'info')}
                      className="px-5 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition cursor-pointer flex items-center gap-2"
                    >
                      <Film className="w-4 h-4" />Render video
                    </button>
                    <button onClick={downloadPackage} className="px-4 py-2.5 rounded-lg bg-ink-100 dark:bg-ink-850 hover:bg-ink-150 dark:hover:bg-ink-800 text-sm font-medium text-ink-800 dark:text-ink-100 transition cursor-pointer flex items-center gap-2">
                      <Download className="w-4 h-4" />Download package (.json)
                    </button>
                    <button onClick={() => onCopy(script || defaultScript, 'template_script', 'Voiceover script copied')} className="px-4 py-2.5 rounded-lg bg-ink-100 dark:bg-ink-850 hover:bg-ink-150 dark:hover:bg-ink-800 text-sm font-medium text-ink-800 dark:text-ink-100 transition cursor-pointer flex items-center gap-2">
                      <Copy className="w-4 h-4" />Copy voiceover script
                    </button>
                  </div>
                  <p className="text-xs text-ink-500 dark:text-ink-400 mt-3">Rendering isn't connected yet; the package has everything an editor needs.</p>
                </section>
              </div>
            </div>
          )}
        </>
      )}

      {/* ───────────────────────── CLIPS ───────────────────────── */}
      {tab === 'clips' && (
        <>
          {/* Source bar */}
          <div className="max-w-3xl mx-auto rounded-2xl bg-white dark:bg-ink-850 border border-ink-200 dark:border-ink-700 shadow-sm p-3">
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-ink-400 ml-2 shrink-0" />
              {clipFileName ? (
                <div className="flex-1 flex items-center gap-2 text-sm text-ink-900 dark:text-white py-2">
                  <Film className="w-4 h-4 text-brand-600 dark:text-brand-300" />
                  <span className="truncate">{clipFileName}</span>
                  <button onClick={() => setClipFileName('')} title="Remove file" className="p-1 rounded hover:bg-ink-100 dark:hover:bg-ink-800 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
                </div>
              ) : (
                <input
                  value={clipSource}
                  onChange={e => setClipSource(e.target.value)}
                  placeholder="Paste a YouTube link..."
                  className="flex-1 bg-transparent py-2 text-[15px] text-ink-900 dark:text-white placeholder:text-ink-400 focus:outline-none"
                />
              )}
              <label className="px-3 py-2 rounded-lg text-sm font-medium text-ink-600 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-800 cursor-pointer flex items-center gap-1.5 shrink-0">
                <Upload className="w-4 h-4" />Upload
                <input type="file" accept="video/*" className="hidden" onChange={e => setClipFileName(e.target.files?.[0]?.name || '')} />
              </label>
              <button
                onClick={handleFindClips}
                className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition cursor-pointer shrink-0"
              >
                Find clips
              </button>
            </div>
          </div>

          {/* Settings */}
          <div className="max-w-3xl mx-auto mt-6 grid sm:grid-cols-2 gap-x-8 gap-y-5">
            <div>
              <SectionLabel>Clip length</SectionLabel>
              <div className="flex gap-2">{[15, 30, 60].map(s => <Chip key={s} active={clipSeconds === s} onClick={() => setClipSeconds(s)}>{s}s</Chip>)}</div>
            </div>
            <div>
              <SectionLabel>Number of clips</SectionLabel>
              <div className="flex gap-2">{[3, 5, 8].map(n => <Chip key={n} active={clipCount === n} onClick={() => setClipCount(n)}>{n}</Chip>)}</div>
            </div>
            <div>
              <SectionLabel>Format</SectionLabel>
              <div className="flex gap-2">{['9:16', '1:1', '16:9'].map(a => <Chip key={a} active={clipAspect === a} onClick={() => setClipAspect(a)}>{a}</Chip>)}</div>
            </div>
            <div>
              <SectionLabel>Effects</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {CLIP_EFFECTS.map(fx => (
                  <Chip
                    key={fx.id}
                    active={clipEffects.includes(fx.id)}
                    onClick={() => setClipEffects(prev => prev.includes(fx.id) ? prev.filter(x => x !== fx.id) : [...prev, fx.id])}
                  >
                    {fx.name}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2">
              <SectionLabel>Subtitles</SectionLabel>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {CAPTION_STYLES.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setClipCaption(c.id)}
                    className={`rounded-xl overflow-hidden text-left transition cursor-pointer ${clipCaption === c.id ? 'ring-2 ring-brand-600' : 'hover:opacity-90'}`}
                  >
                    <div className="h-14 bg-ink-900 flex items-center justify-center px-2"><span className={`text-xs ${c.className}`}>{c.sample}</span></div>
                    <div className="px-3 py-2 text-xs font-medium bg-ink-100 dark:bg-ink-850 text-ink-700 dark:text-ink-200">{c.name}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Outliers as quick sources */}
          {videos.length > 0 && (
            <div className="mt-12">
              <h3 className="text-base font-semibold text-ink-900 dark:text-white">From your research</h3>
              <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5 mb-4">Top outliers in {nicheLabel}. Pick one to use its link.</p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {videos.slice(0, 8).map(v => {
                  const link = `https://www.youtube.com/watch?v=${v.video_id}`;
                  const selected = clipSource === link && !clipFileName;
                  return (
                    <button
                      key={v.video_id}
                      onClick={() => { setClipFileName(''); setClipSource(link); }}
                      className={`text-left rounded-xl transition cursor-pointer ${selected ? 'ring-2 ring-brand-600 ring-offset-2 ring-offset-ink-50 dark:ring-offset-ink-900' : ''}`}
                    >
                      <div className="aspect-video rounded-xl overflow-hidden bg-ink-200 dark:bg-ink-800">
                        <img src={v.thumbnail_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                      </div>
                      <div className="text-sm text-ink-800 dark:text-ink-100 mt-2 line-clamp-2">{v.title}</div>
                      <div className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">{v.channel_title} · {v.outperformance_ratio}x · {v.view_count.toLocaleString()} views</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Saved clip jobs */}
          <div className="mt-12">
            <h3 className="text-base font-semibold text-ink-900 dark:text-white mb-4">Clip jobs</h3>
            {clipDrafts.length === 0 ? (
              <p className="text-sm text-ink-500 dark:text-ink-400">No clip jobs yet. Add a source above and click Find clips.</p>
            ) : (
              <div className="divide-y divide-ink-200 dark:divide-ink-800">
                {clipDrafts.map(d => (
                  <div key={d.id} className="flex items-center gap-4 py-3">
                    <Scissors className="w-4 h-4 text-ink-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-ink-900 dark:text-white truncate">{d.source}</div>
                      <div className="text-xs text-ink-500 dark:text-ink-400">
                        {d.clipCount} × {d.clipSeconds}s · {d.aspect} · {CAPTION_STYLES.find(c => c.id === d.captionStyle)?.name} subtitles
                        {d.effects.length > 0 && ` · ${d.effects.map(e => CLIP_EFFECTS.find(x => x.id === e)?.name).join(', ')}`}
                      </div>
                    </div>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200 shrink-0">Not processed</span>
                    <button title="Delete" onClick={() => setClipDrafts(prev => prev.filter(x => x.id !== d.id))} className="p-1.5 rounded-lg hover:bg-ink-100 dark:hover:bg-ink-800 text-ink-500 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
