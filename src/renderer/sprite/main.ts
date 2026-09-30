import * as THREE from 'three';
import type { AnimationName } from '@shared/animations';
import { Saeed3DRenderer } from './character/Saeed3DRenderer';

type SpriteApi = Window['spriteApi'];
const canvas = document.getElementById('character-canvas') as HTMLCanvasElement;
const loadingEl = document.getElementById('character-loading') as HTMLDivElement;
const errorEl = document.getElementById('character-error') as HTMLDivElement;
const api: SpriteApi | undefined = window.spriteApi;

let renderer: THREE.WebGLRenderer;
let camera: THREE.PerspectiveCamera;
let scene: THREE.Scene;
let character: Saeed3DRenderer;
let renderHandle = 0;
let lastFrame = 0;
let renderFps = 30;
let currentZoom = 1;

function showError(message: string): void {
  loadingEl.hidden = true;
  errorEl.hidden = false;
  errorEl.textContent = 'Saeed 3D failed to load. ' + message;
  console.error('[saeed-3d]', message);
}

function setup(): void {
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
  camera.position.set(0, 1.9, 7);
  camera.lookAt(0, 1.9, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.8));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2, 4, 3);
  scene.add(key);
  character = new Saeed3DRenderer(renderer, scene, camera);
}

function renderNow(): void { renderer?.render(scene, camera); }

function resize(): void {
  if (!renderer || !camera) return;
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  if (character?.hasModel()) character.fit();
  renderNow();
}

function ensureRenderLoop(): void {
  if (!renderHandle) renderHandle = requestAnimationFrame(frame);
}

function frame(now: number): void {
  renderHandle = 0;
  const interval = 1000 / renderFps;
  if (now - lastFrame < interval) { ensureRenderLoop(); return; }
  const delta = Math.min((now - (lastFrame || now)) / 1000, 0.1);
  lastFrame = now;
  character?.update(delta);
  renderNow();
  if (character?.isAnimating()) ensureRenderLoop();
}

function play(name: AnimationName, loop = false): void {
  if (character?.play(name, loop)) {
    renderFps = loop ? 30 : 60;
    ensureRenderLoop();
    renderNow();
  }
}

function setZoom(zoom: number): void {
  currentZoom = Math.max(0.5, Math.min(4, Number(zoom) || 1));
  document.documentElement.style.setProperty('--saeed-zoom', String(currentZoom));
  resize();
}

async function loadCharacter(): Promise<void> {
  loadingEl.hidden = false;
  errorEl.hidden = true;
  const url = new URL('../characters/Saeed.glb', window.location.href).href;
  const animations = await character.load(url);
  loadingEl.hidden = true;
  renderNow();
  ensureRenderLoop();
  console.info('[saeed-3d] loaded', { animations });
}

function wirePointerEvents(): void {
  let active: { x: number; y: number; id: number; moved: boolean } | null = null;
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    active = { x: e.screenX, y: e.screenY, id: e.pointerId, moved: false };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  });
  document.addEventListener('pointermove', (e) => {
    if (!active || e.pointerId !== active.id) return;
    const dx = e.screenX - active.x, dy = e.screenY - active.y;
    if (!active.moved && Math.hypot(dx, dy) >= 3) {
      active.moved = true;
      document.body.classList.add('saeed-dragging');
    }
    if (active.moved && (dx || dy)) {
      active.x = e.screenX; active.y = e.screenY;
      window.spriteEvents?.drag(dx, dy);
    }
  });
  const end = (e: PointerEvent): void => {
    if (!active || e.pointerId !== active.id) return;
    const moved = active.moved;
    (e.target as Element).releasePointerCapture?.(active.id);
    active = null;
    document.body.classList.remove('saeed-dragging');
    if (moved) window.spriteEvents?.dragEnd();
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
  document.addEventListener('dblclick', (e) => { e.preventDefault(); window.spriteEvents?.doubleClick(); play('Wave'); });
  document.addEventListener('contextmenu', (e) => { e.preventDefault(); window.spriteEvents?.rightClick(e.screenX, e.screenY); });
  document.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    setZoom(currentZoom + delta);
    window.spriteEvents?.zoomBy(delta);
  }, { passive: false });
}

function wireApi(): void {
  if (!api) { showError('preload bridge missing'); return; }
  api.onPlay((name: AnimationName) => play(name, name.startsWith('Idle')));
  api.onStop(() => { character.stop(); renderFps = 30; ensureRenderLoop(); renderNow(); });
  api.onShow(() => { play('Show'); renderNow(); });
  api.onHide(() => play('Hide'));
  api.onSetZoom(setZoom);
  api.onSetCharacter(() => console.info('[saeed-3d] visual asset is fixed to Saeed.glb'));
  api.onSetAppearance(() => {});
  api.onSetExtensions(() => {});

  const voiceQueue: HTMLAudioElement[] = [];
  let voicePlaying: HTMLAudioElement | null = null;
  const playNextVoice = (): void => {
    if (voicePlaying || voiceQueue.length === 0) {
      if (!voicePlaying && voiceQueue.length === 0) void api.reportAudioState(false);
      return;
    }
    voicePlaying = voiceQueue.shift() ?? null;
    if (!voicePlaying) return;
    voicePlaying.onended = () => { voicePlaying = null; playNextVoice(); };
    voicePlaying.onerror = () => { voicePlaying = null; playNextVoice(); };
    void voicePlaying.play().catch((err) => console.warn('[saeed-voice] play failed', err));
    void api.reportAudioState(true);
  };
  api.onPlayAudio((dataUrl: string) => {
    const audio = new Audio(dataUrl);
    audio.volume = 1;
    voiceQueue.push(audio);
    play('Explain', true);
    playNextVoice();
  });
  api.onStopAudio(() => {
    voiceQueue.length = 0;
    voicePlaying?.pause();
    voicePlaying = null;
    void api.reportAudioState(false);
    character.stop();
    renderNow();
  });
}

window.addEventListener('resize', resize);
wirePointerEvents();
wireApi();
try { setup(); resize(); void loadCharacter().catch((err) => showError(String(err?.message ?? err))); }
catch (err) { showError(String(err instanceof Error ? err.message : err)); }
