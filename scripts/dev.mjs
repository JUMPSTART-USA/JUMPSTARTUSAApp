/**
 * One-command dev environment: embedded Postgres → API (watch) → web (Vite).
 *
 *   pnpm dev
 *
 * Each service is skipped when its port is already serving (safe to re-run
 * after a partial crash — it only starts what's missing). Ctrl-C stops
 * everything this process started; services it reused are left alone.
 */
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const SERVICES = [
  {
    label: 'db',
    color: '35',
    port: 5432,
    filter: '@jumpstart/database',
    script: 'db:local',
    readyTimeoutMs: 30_000,
  },
  {
    label: 'api',
    color: '33',
    port: 3001,
    filter: '@jumpstart/api',
    script: 'dev',
    // nest start --watch compiles before listening
    readyTimeoutMs: 90_000,
  },
  {
    label: 'web',
    color: '36',
    port: 5173,
    filter: '@jumpstart/web',
    script: 'dev',
    readyTimeoutMs: 30_000,
  },
];

function portOpenOn(port, host) {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host });
    const done = (up) => {
      sock.destroy();
      resolve(up);
    };
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
    sock.setTimeout(500, () => done(false));
  });
}

// A server may bind only IPv4 or only IPv6 localhost (Vite binds ::1).
async function portOpen(port) {
  const [v4, v6] = await Promise.all([portOpenOn(port, '127.0.0.1'), portOpenOn(port, '::1')]);
  return v4 || v6;
}

async function waitForPort(port, label, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await portOpen(port)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${label} did not start listening on :${port} within ${timeoutMs / 1000}s`);
}

const children = [];

function prefixed(label, color, stream, out) {
  let buf = '';
  stream.on('data', (chunk) => {
    buf += chunk.toString();
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      out.write(`\x1b[${color}m[${label}]\x1b[0m ${buf.slice(0, nl + 1)}`);
      buf = buf.slice(nl + 1);
    }
  });
}

function start(svc) {
  const child = spawn('pnpm', ['--filter', svc.filter, svc.script], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  prefixed(svc.label, svc.color, child.stdout, process.stdout);
  prefixed(svc.label, svc.color, child.stderr, process.stderr);
  child.on('exit', (code, signal) => {
    if (!shuttingDown) {
      // Leave healthy siblings running and exit non-zero: interactively this
      // surfaces the failure; under launchd (KeepAlive) we get relaunched and
      // restart only what's missing.
      console.error(`\x1b[31m[dev]\x1b[0m ${svc.label} exited (${signal ?? `code ${code}`}) — exiting`);
      process.exit(1);
    }
  });
  children.push(child);
  return child;
}

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\n\x1b[2m[dev] stopping…\x1b[0m');
  for (const child of children) {
    if (child.exitCode === null) child.kill('SIGINT');
  }
  // Give the db time to stop postgres cleanly before force-exiting.
  setTimeout(() => process.exit(0), 5_000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

for (const svc of SERVICES) {
  if (await portOpen(svc.port)) {
    console.log(`\x1b[2m[dev] ${svc.label} already running on :${svc.port} — reusing\x1b[0m`);
    continue;
  }
  console.log(`\x1b[2m[dev] starting ${svc.label}…\x1b[0m`);
  start(svc);
  await waitForPort(svc.port, svc.label, svc.readyTimeoutMs);
}

console.log(`
\x1b[1mJUMPSTART USA dev environment ready\x1b[0m
  web  http://localhost:5173
  api  http://localhost:3001/api  (docs at /api/docs)
  db   postgresql://localhost:5432/jumpstart
  demo login: admin@jumpstartusa.org / JumpstartDemo2026!
`);

if (process.env.JUMPSTART_DEV_SUPERVISE === '1') {
  // Under launchd: stay alive even when every service was reused, and watch
  // the ports; exit non-zero when one drops so KeepAlive relaunches us and we
  // restore just the missing service.
  setInterval(async () => {
    for (const svc of SERVICES) {
      if (!(await portOpen(svc.port))) {
        console.error(`[dev] ${svc.label} is no longer serving :${svc.port} — exiting for supervisor restart`);
        process.exit(1);
      }
    }
  }, 15_000);
}
