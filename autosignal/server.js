import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 8787;
const ROOT = path.dirname(fileURLToPath(import.meta.url));

const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'http://localhost:8787',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8787',
  'http://127.0.0.1:3000',
]);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(express.static(ROOT));

const VALID_NICHES = new Set(['automotive', 'finance', 'technology', 'productivity']);

const STANDARD_ARTIFACTS = [
  'top_100_videos.json',
  'top_100_semantic.json',
  'merged_videos.json',
  'merged_videos_semantic.json',
  'video_clusters_semantic.json',
  'channel_metadata.json',
  'opportunities.json',
  'discovered_channels.json',
  'categorized_index.json',
];

const NICHE_LABELS = {
  automotive: 'Automotive Repair',
  finance: 'Finance & Investing',
  technology: 'Technology & Software',
  productivity: 'Productivity & Growth',
};

function normalizeNiche(value) {
  const niche = String(value || 'automotive').trim().toLowerCase();
  return VALID_NICHES.has(niche) ? niche : 'automotive';
}

function nicheDataDir(niche) {
  return path.join(ROOT, 'data', normalizeNiche(niche));
}

function artifactPath(niche, filename) {
  if (!STANDARD_ARTIFACTS.includes(filename)) return null;
  return path.join(nicheDataDir(niche), filename);
}

function buildScriptPresets(niche) {
  const n = normalizeNiche(niche);
  const label = NICHE_LABELS[n] || n;

  return {
    fetch_market: {
      id: 'fetch_market',
      label: `Fetch Top ${label} Videos`,
      description: `Runs metadata_fetch.py for the ${label} niche.`,
      niche: n,
      commands: [['python', ['metadata_fetch.py', n]]],
      outputs: ['top_100_videos.json', 'discovered_channels.json'],
    },
    fetch_channel: {
      id: 'fetch_channel',
      label: `Fetch Reference Channel (${label})`,
      description: 'Runs fetch_channel_metadata.py to refresh channel-level JSON.',
      niche: n,
      commands: [['python', ['fetch_channel_metadata.py', n]]],
      outputs: ['channel_metadata.json'],
    },
    merge_json: {
      id: 'merge_json',
      label: 'Merge JSON Sources',
      description: 'Runs merge_json.py to generate merged_videos.json.',
      niche: n,
      commands: [['python', ['merge_json.py', n]]],
      outputs: ['merged_videos.json'],
    },
    semantic_enrich: {
      id: 'semantic_enrich',
      label: 'Generate Merged Semantic Dataset',
      description: 'Runs semantic_research.py on merged_videos.json.',
      niche: n,
      commands: [['python', ['semantic_research.py', n, 'merged']]],
      outputs: ['merged_videos_semantic.json'],
    },
    semantic_top100: {
      id: 'semantic_top100',
      label: 'Generate Top 100 Semantic Dataset',
      description: 'Runs semantic_research.py on top_100_videos.json.',
      niche: n,
      commands: [['python', ['semantic_research.py', n, 'top100']]],
      outputs: ['top_100_semantic.json'],
    },
    cluster_intelligence: {
      id: 'cluster_intelligence',
      label: 'Generate Topic Cluster Intelligence',
      description: 'Refreshes channel + semantic data, then runs cluster_research.py.',
      niche: n,
      commands: [
        ['python', ['fetch_channel_metadata.py', n]],
        ['python', ['merge_json.py', n]],
        ['python', ['semantic_research.py', n, 'merged']],
        ['python', ['cluster_research.py', n]],
      ],
      outputs: ['video_clusters_semantic.json'],
    },
    full_refresh: {
      id: 'full_refresh',
      label: 'Full Refresh Pipeline',
      description: 'Fetch, merge, semantic-enrich, and cluster for this niche.',
      niche: n,
      commands: [
        ['python', ['metadata_fetch.py', n]],
        ['python', ['fetch_channel_metadata.py', n]],
        ['python', ['merge_json.py', n]],
        ['python', ['semantic_research.py', n, 'merged']],
        ['python', ['semantic_research.py', n, 'top100']],
        ['python', ['cluster_research.py', n]],
      ],
      outputs: [
        'top_100_videos.json',
        'channel_metadata.json',
        'merged_videos.json',
        'merged_videos_semantic.json',
        'top_100_semantic.json',
        'video_clusters_semantic.json',
      ],
    },
    // Legacy aliases (same presets, old ids for backward compatibility)
    fetch_automotive: null,
  };
}

function getScriptPresets(niche) {
  const presets = buildScriptPresets(niche);
  if (normalizeNiche(niche) === 'automotive') {
    presets.fetch_automotive = { ...presets.fetch_market, id: 'fetch_automotive', label: 'Fetch Top Automotive Videos' };
  }
  return Object.fromEntries(Object.entries(presets).filter(([, v]) => v));
}

const runJobs = new Map();
const MAX_JOBS = 50;

function cleanupOldJobs() {
  if (runJobs.size <= MAX_JOBS) return;
  const entries = [...runJobs.entries()]
    .sort((a, b) => (a[1].startedAt || '').localeCompare(b[1].startedAt || ''));
  const toRemove = entries.slice(0, entries.length - MAX_JOBS);
  for (const [id] of toRemove) {
    runJobs.delete(id);
  }
}
let activeRunId = null;
let lastRun = null;

function safeDatasetFile(niche, name) {
  return artifactPath(niche, name);
}

async function resolveDatasetPath(niche, name) {
  const candidates = [
    artifactPath(niche, name),
    path.join(ROOT, 'public', normalizeNiche(niche), name),
    path.join(ROOT, name),
    path.join(ROOT, `${normalizeNiche(niche)}_${name}`),
    // Legacy automotive filenames
    name === 'top_100_videos.json' ? path.join(ROOT, 'top_100_automotive_videos.json') : null,
    name === 'channel_metadata.json' ? path.join(ROOT, 'themechanic868_metadata.json') : null,
    name === 'top_100_semantic.json' ? path.join(ROOT, 'top_100_automotive_videos_semantic.json') : null,
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try next candidate path.
    }
  }

  return null;
}

async function getFileMeta(niche, filename) {
  const fullPath = await resolveDatasetPath(niche, filename);
  if (!fullPath) {
    return { filename, niche: normalizeNiche(niche), exists: false };
  }

  try {
    const stat = await fs.stat(fullPath);
    return {
      filename,
      niche: normalizeNiche(niche),
      exists: true,
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
      path: path.relative(ROOT, fullPath),
    };
  } catch {
    return { filename, niche: normalizeNiche(niche), exists: false };
  }
}

function trimLog(logText, maxChars = 120000) {
  if (logText.length <= maxChars) return logText;
  return logText.slice(logText.length - maxChars);
}

function runCommandWithStreaming(job, command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      shell: process.platform === 'win32'
    });

    const commandLine = `${command} ${args.join(' ')}`;
    let stdout = '';
    let stderr = '';

    job.logs = trimLog(`${job.logs}\n$ ${commandLine}\n`);

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      job.logs = trimLog(`${job.logs}${text}`);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      job.logs = trimLog(`${job.logs}${text}`);
    });

    child.on('close', (code) => {
      job.steps.push({
        command: commandLine,
        code,
        stdout,
        stderr,
        ok: code === 0
      });

      if (code !== 0) {
        reject(new Error(`Command failed (${code}): ${commandLine}\n${stderr || stdout}`));
        return;
      }

      resolve();
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

function runQuickCommand(command, args, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      shell: process.platform === 'win32'
    });

    let stdout = '';
    let stderr = '';
    let done = false;

    const finish = (result) => {
      if (done) return;
      done = true;
      resolve(result);
    };

    const timer = setTimeout(() => {
      child.kill();
      finish({ ok: false, code: -1, stdout, stderr: `${stderr}\nTimeout after ${timeoutMs}ms` });
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      finish({ ok: code === 0, code, stdout, stderr });
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      finish({ ok: false, code: -1, stdout, stderr: `${stderr}\n${String(error)}` });
    });
  });
}

function startBackgroundRun(preset) {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const job = {
    runId,
    scriptId: preset.id,
    label: preset.label,
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    logs: '',
    steps: [],
    files: [],
    error: null
  };

  runJobs.set(runId, job);
  cleanupOldJobs();
  activeRunId = runId;

  (async () => {
    try {
      for (const [command, args] of preset.commands) {
        await runCommandWithStreaming(job, command, args);
      }

      job.files = await Promise.all(
        preset.outputs.map((file) => getFileMeta(preset.niche, file))
      );
      job.status = 'completed';
      job.finishedAt = new Date().toISOString();
      lastRun = {
        runId: job.runId,
        scriptId: job.scriptId,
        label: job.label,
        status: job.status,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        files: job.files
      };
    } catch (error) {
      job.status = 'failed';
      job.finishedAt = new Date().toISOString();
      job.error = String(error);
      job.logs = trimLog(`${job.logs}\n${job.error}\n`);
      lastRun = {
        runId: job.runId,
        scriptId: job.scriptId,
        label: job.label,
        status: job.status,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        error: job.error
      };
    } finally {
      activeRunId = null;
    }
  })();

  return job;
}

app.get('/api/health', (_, res) => {
  res.json({ ok: true, running: !!activeRunId, activeRunId });
});

// ── Niche detection endpoint ─────────────────────────────────────────────────
// POST /api/detect-niche { channel_id: "UCxxxxxx" }
// Runs niche_detector.py CLI and returns the detection result as JSON.
app.post('/api/detect-niche', async (req, res) => {
  const { channel_id } = req.body || {};

  if (!channel_id || typeof channel_id !== 'string' || !/^[A-Za-z0-9_-]{10,30}$/.test(channel_id)) {
    res.status(400).json({ error: 'Invalid channel_id' });
    return;
  }

  try {
    const result = await new Promise((resolve, reject) => {
      const proc = spawn('python', ['niche_detector.py', channel_id.replace(/'/g, '')], { cwd: ROOT });

      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', d => { stdout += d.toString(); });
      proc.stderr.on('data', d => { stderr += d.toString(); });
      proc.on('close', code => {
        if (code !== 0) {
          // Non-fatal: return automotive fallback
          resolve({ niche: 'automotive', confidence: 0, display_name: 'Automotive Repair', icon: '🔧', ui_color: '#6c63ff', is_high_confidence: false });
          return;
        }
        try {
          const parsed = JSON.parse(stdout.trim().split('\n').pop());
          resolve(parsed);
        } catch {
          resolve({ niche: 'automotive', confidence: 0, display_name: 'Automotive Repair', icon: '🔧', ui_color: '#6c63ff', is_high_confidence: false });
        }
      });
      proc.on('error', () => {
        resolve({ niche: 'automotive', confidence: 0, display_name: 'Automotive Repair', icon: '🔧', ui_color: '#6c63ff', is_high_confidence: false });
      });
    });

    res.json(result);
  } catch (error) {
    console.error('detect-niche error:', error);
    res.json({ niche: 'automotive', confidence: 0, display_name: 'Automotive Repair', icon: '🔧', ui_color: '#6c63ff', is_high_confidence: false });
  }
});

// GET /api/niche-options — returns all available niches for the UI override dropdown
app.get('/api/niche-options', async (_req, res) => {
  try {
    const result = await new Promise((resolve, reject) => {
      const proc = spawn('python', ['-c', `
import json, sys
sys.path.insert(0, r'${ROOT.replace(/\\/g, '\\\\')}')
from niche_detector import get_niche_options
print(json.dumps(get_niche_options()))
`], { cwd: ROOT });

      let stdout = '';
      proc.stdout.on('data', d => { stdout += d.toString(); });
      proc.on('close', () => {
        try { resolve(JSON.parse(stdout.trim())); }
        catch { resolve([]); }
      });
      proc.on('error', () => resolve([]));
    });
    res.json({ niches: result });
  } catch {
    res.json({ niches: [] });
  }
});



app.get('/api/scripts', (req, res) => {
  const niche = normalizeNiche(req.query.niche);
  const presets = getScriptPresets(niche);
  const activeRun = activeRunId ? runJobs.get(activeRunId) : null;
  res.json({ niche, scripts: Object.values(presets), running: !!activeRun, activeRun, lastRun });
});

app.get('/api/datasets', async (req, res) => {
  const niche = normalizeNiche(req.query.niche);
  const files = await Promise.all(STANDARD_ARTIFACTS.map((file) => getFileMeta(niche, file)));
  res.json({ niche, dataDir: path.relative(ROOT, nicheDataDir(niche)), files });
});

app.get('/api/data/:filename', async (req, res) => {
  const { filename } = req.params;
  const niche = normalizeNiche(req.query.niche);

  if (!safeDatasetFile(niche, filename)) {
    res.status(400).json({ error: 'Unsupported dataset file.' });
    return;
  }

  const fullPath = await resolveDatasetPath(niche, filename);

  if (!fullPath) {
    res.status(404).json({ error: `Dataset not found: ${filename}` });
    return;
  }

  try {
    const raw = await fs.readFile(fullPath, 'utf-8');
    const json = JSON.parse(raw);
    res.json(json);
  } catch (error) {
    console.error(`Failed to read ${filename}:`, error);
    res.status(500).json({ error: `Failed to read ${filename}` });
  }
});

app.post('/api/start-script', async (req, res) => {
  const { scriptId, niche: bodyNiche } = req.body || {};
  const niche = normalizeNiche(bodyNiche);
  const presets = getScriptPresets(niche);
  const preset = presets[scriptId];

  if (!preset) {
    res.status(400).json({ error: 'Unknown scriptId.' });
    return;
  }

  if (activeRunId) {
    res.status(409).json({ error: 'A script run is already in progress.', run: runJobs.get(activeRunId) });
    return;
  }

  const job = startBackgroundRun(preset);
  res.status(202).json({
    ok: true,
    niche,
    runId: job.runId,
    scriptId: job.scriptId,
    label: job.label,
    status: job.status,
    startedAt: job.startedAt
  });
});

app.get('/api/run-status/:runId', (req, res) => {
  const { runId } = req.params;
  const run = runJobs.get(runId);
  if (!run) {
    res.status(404).json({ error: 'Run ID not found.' });
    return;
  }
  res.json(run);
});

app.get('/api/run-status', (_, res) => {
  const activeRun = activeRunId ? runJobs.get(activeRunId) : null;
  res.json({ activeRun, lastRun });
});

app.get('/api/preflight', async (req, res) => {
  const niche = normalizeNiche(req.query.niche);
  const requiredScripts = [
    'metadata_fetch.py',
    'fetch_channel_metadata.py',
    'merge_json.py',
    'semantic_research.py',
    'cluster_research.py',
    'pipeline_paths.py',
  ];

  const scriptChecks = await Promise.all(
    requiredScripts.map(async (filename) => {
      try {
        await fs.access(path.join(ROOT, filename));
        return { filename, exists: true };
      } catch {
        return { filename, exists: false };
      }
    })
  );

  const datasetChecks = await Promise.all(
    STANDARD_ARTIFACTS.map((file) => getFileMeta(niche, file))
  );

  let dataDirExists = false;
  try {
    await fs.access(nicheDataDir(niche));
    dataDirExists = true;
  } catch {
    dataDirExists = false;
  }

  const pythonVersion = await runQuickCommand('python', ['--version']);
  const semanticDeps = await runQuickCommand('python', ['-c', 'import numpy, sklearn, sentence_transformers']);

  res.json({
    ok: true,
    niche,
    dataDir: path.relative(ROOT, nicheDataDir(niche)),
    dataDirExists,
    python: {
      ok: pythonVersion.ok,
      message: (pythonVersion.stdout || pythonVersion.stderr || '').trim()
    },
    semanticDependencies: {
      ok: semanticDeps.ok,
      message: (semanticDeps.stdout || semanticDeps.stderr || '').trim()
    },
    scripts: scriptChecks,
    datasets: datasetChecks,
    checkedAt: new Date().toISOString(),
  });
});

function startServer(startPort) {
  const server = app.listen(startPort, '0.0.0.0', () => {
    console.log(`Script/data API listening on http://0.0.0.0:${startPort}`);
  });

  server.on('error', (error) => {
    if (error && error.code === 'EADDRINUSE') {
      const nextPort = startPort + 1;
      if (nextPort <= 8795) {
        console.warn(`Port ${startPort} in use, retrying on ${nextPort}...`);
        startServer(nextPort);
        return;
      }
    }

    console.error('Failed to start API server:', error);
    process.exit(1);
  });
}

startServer(PORT);
