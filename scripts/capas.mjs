// Tira as imagens de capa dos projetos (1280×800) com o Chrome sem janela, pelo protocolo
// de depuração (CDP). Uso: node scripts/capas.mjs   (gera capas/*.png)
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORTA = 9333;
const SAIDA = new URL('../capas/', import.meta.url);
mkdirSync(SAIDA, { recursive: true });

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// o que fazer em cada site antes da foto (JS rodado na página)
const PROJETOS = [
  {
    nome: 'riviera',
    url: 'https://lucasdaufenbach.github.io/riviera-maya/',
    passos: [
      [6000, `document.querySelectorAll('#tela-cheia').forEach(e=>e.remove()); const s=document.querySelectorAll('#rolagem .etapa')[2]; window.scrollTo(0, s.offsetTop + s.offsetHeight/2 - innerHeight/2); 'ok'`],
      [5000, `document.querySelectorAll('.etapa .cartao').forEach(e=>e.style.visibility='hidden'); 'ok'`],
    ],
  },
  {
    nome: 'mockup3d',
    url: 'https://lucasdaufenbach.github.io/mockup3d/',
    passos: [
      // o modelo da peça demora a carregar: espera o "Carregando..." sumir e fecha o "Como usar"
      [3000, `new Promise(async (r)=>{ for(let i=0;i<60;i++){ if(!/Carregando/i.test(document.body.innerText)) break; await new Promise(s=>setTimeout(s,1000)); } [...document.querySelectorAll('button')].find(b=>/iniciar/i.test(b.textContent))?.click(); r('ok'); })`],
      [4000, `'ok'`],
    ],
  },
  {
    nome: 'planta',
    url: 'https://lucasdaufenbach.github.io/moagem-escoria-3d/',
    passos: [[9000, `'ok'`]],
  },
  {
    nome: 'sala-da-prof',
    url: 'https://sala-da-prof.app-professora.workers.dev/',
    passos: [[2500, `'ok'`]],
  },
];

const perfil = join(tmpdir(), 'capas-portfolio-chrome');
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORTA}`, `--user-data-dir=${perfil}`,
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars',
  '--window-size=1280,800', 'about:blank',
], { stdio: 'ignore' });

try {
  let alvo;
  for (let i = 0; i < 40 && !alvo; i++) {
    await espera(250);
    try { alvo = (await (await fetch(`http://127.0.0.1:${PORTA}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* ainda subindo */ }
  }
  const ws = new WebSocket(alvo.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0;
  const pend = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await cmd('Page.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

  const SO = process.argv[2];
  for (const p of PROJETOS.filter((x) => !SO || x.nome === SO)) {
    await cmd('Page.navigate', { url: p.url });
    for (const [ms, js] of p.passos) {
      await espera(ms);
      await cmd('Runtime.evaluate', { expression: js, awaitPromise: true });
    }
    const r = await cmd('Page.captureScreenshot', { format: 'png' });
    await writeFile(new URL(`${p.nome}.png`, SAIDA), Buffer.from(r.result.data, 'base64'));
    console.log('capa', p.nome);
  }
  ws.close();
} finally {
  chrome.kill();
}
