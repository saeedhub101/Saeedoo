import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { AnimationName } from '@shared/animations';

type SpriteApi = Window['spriteApi'];
type LoadedCharacter = {
  scene: THREE.Group;
  mixer: THREE.AnimationMixer;
  clips: THREE.AnimationClip[];
};

const canvas = document.getElementById('character-canvas') as HTMLCanvasElement;
const loadingEl = document.getElementById('character-loading') as HTMLDivElement;
const errorEl = document.getElementById('character-error') as HTMLDivElement;

const api: SpriteApi | undefined = window.spriteApi;

let renderer: THREE.WebGLRenderer;
let camera: THREE.PerspectiveCamera;
let scene: THREE.Scene;
let character: LoadedCharacter | null = null;
let activeAction: THREE.AnimationAction | null = null;
let idleAction: THREE.AnimationAction | null = null;
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

function setupRenderer(): void {
  renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
}

function setupScene(): void {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
  camera.position.set(0, 1.9, 7);
  camera.lookAt(0, 1.9, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.8));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2, 4, 3);
  scene.add(key);
}

function resize(): void {
  if (!renderer || !camera) return;
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  if (character) fitCharacter(character.scene);
  renderNow();
}

function fitCharacter(model: THREE.Object3D): void {
  model.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(model, true);
  const rawSize = box.getSize(new THREE.Vector3());
  const targetHeight = 3.75;
  const scale = targetHeight / Math.max(rawSize.y, 0.001);
  model.scale.setScalar(scale);
  model.updateWorldMatrix(true, true);

  const fitted = new THREE.Box3().setFromObject(model, true);
  const center = fitted.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= fitted.min.y;
  model.updateWorldMatrix(true, true);

  const finalBox = new THREE.Box3().setFromObject(model, true);
  const size = finalBox.getSize(new THREE.Vector3());
  const finalCenter = finalBox.getCenter(new THREE.Vector3());
  const verticalFov = THREE.MathUtils.degToRad(camera.fov * 0.5);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov) * camera.aspect);
  const verticalDistance = (size.y * 0.5) / Math.max(Math.tan(verticalFov), 0.001);
  const horizontalDistance = (size.x * 0.5) / Math.max(Math.tan(horizontalFov * 0.5), 0.001);
  const distance = Math.max(verticalDistance, horizontalDistance) * 1.04 + size.z * 0.5;

  camera.position.set(0, finalCenter.y, Math.max(distance, 2.5));
  camera.lookAt(0, finalCenter.y + size.y * 0.02, 0);
}

function clipByBaseName(clips: THREE.AnimationClip[], name: string): THREE.AnimationClip | null {
  const exact = clips.find((c) => c.name === name);
  if (exact) return exact;
  return clips.find((c) => c.name.toLowerCase().endsWith('|' + name.toLowerCase())) ?? null;
}

function resolveClip(name: AnimationName): THREE.AnimationClip | null {
  if (!character) return null;
  const clips = character.clips;
  if (name.startsWith('Move')) return clipByBaseName(clips, 'Walk') ?? clipByBaseName(clips, 'Run');
  if (name === 'Greet' || name === 'Wave' || name === 'GetAttention') return clipByBaseName(clips, 'Wave');
  if (name === 'Hide' || name === 'Show') return clipByBaseName(clips, 'Idle');
  return clipByBaseName(clips, 'Idle');
}

function playClip(name: AnimationName, loop = false): void {
  if (!character) return;
  const clip = resolveClip(name);
  if (!clip) return;

  const action = character.mixer.clipAction(clip);
  if (activeAction === action && action.isRunning()) return;

  if (activeAction && activeAction !== action) {
    activeAction.fadeOut(0.16);
  }
  action.reset();
  action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
  action.clampWhenFinished = !loop;
  action.fadeIn(0.16).play();
  activeAction = action;
  renderFps = loop ? 30 : 60;
  ensureRenderLoop();
}

function startIdle(): void {
  if (!character) return;
  const clip = clipByBaseName(character.clips, 'Idle') ?? character.clips[0];
  if (!clip) return;
  idleAction = character.mixer.clipAction(clip);
  idleAction.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.2).play();
  activeAction = idleAction;
  renderFps = 30;
  ensureRenderLoop();
}

function renderNow(): void {
  if (renderer && scene && camera) renderer.render(scene, camera);
}

function ensureRenderLoop(): void {
  if (renderHandle) return;
  renderHandle = requestAnimationFrame(frame);
}

function frame(now: number): void {
  renderHandle = 0;
  const interval = 1000 / renderFps;
  if (now - lastFrame < interval) {
    ensureRenderLoop();
    return;
  }
  const delta = Math.min((now - (lastFrame || now)) / 1000, 0.1);
  lastFrame = now;

  if (character) {
    character.mixer.update(delta);
    renderNow();
  }

  if (activeAction && !activeAction.isRunning() && activeAction !== idleAction) {
    if (idleAction) {
      idleAction.reset().fadeIn(0.18).play();
      activeAction = idleAction;
      renderFps = 30;
    }
  }

  if (activeAction?.isRunning() || activeAction === idleAction) {
    ensureRenderLoop();
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

  const loader = new GLTFLoader();
  const url = new URL('../characters/Saeed.glb', window.location.href).href;
  const gltf = await loader.loadAsync(url);

  const root = gltf.scene;
  root.rotation.y = Math.PI;
  scene.add(root);

  character = {
    scene: root,
    mixer: new THREE.AnimationMixer(root),
    clips: gltf.animations,
  };

  fitCharacter(root);
  startIdle();
  renderNow();

  loadingEl.hidden = true;
  console.info('[saeed-3d] loaded', {
    animations: gltf.animations.map((clip) => clip.name),
    meshes: root.children.length,
  });
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
    const dx = e.screenX - active.x;
    const dy = e.screenY - active.y;
    if (!active.moved && Math.hypot(dx, dy) >= 3) {
      active.moved = true;
      document.body.classList.add('saeed-dragging');
    }
    if (active.moved && (dx || dy)) {
      active.x = e.screenX;
      active.y = e.screenY;
      api?.startDrag?.();
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

  document.addEventListener('dblclick', (e) => {
    e.preventDefault();
    window.spriteEvents?.doubleClick();
    playClip('Wave', false);
  });

  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    window.spriteEvents?.rightClick(e.screenX, e.screenY);
  });

  document.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    setZoom(currentZoom + delta);
    window.spriteEvents?.zoomBy(delta);
  }, { passive: false });
}

function wireApi(): void {
  if (!api) {
    showError('preload bridge missing');
    return;
  }

  api.onPlay((name: AnimationName) => {
    playClip(name, name.startsWith('Idle'));
  });
  api.onStop(() => {
    character?.mixer.stopAllAction();
    if (idleAction) idleAction.reset().play();
    activeAction = idleAction;
    ensureRenderLoop();
  });
  api.onShow(() => {
    if (character) { playClip('Show', false); renderNow(); }
  });
  api.onHide(() => playClip('Hide', false));
  api.onSetZoom(setZoom);
  api.onSetCharacter(() => {
    // The 3D build has one authoritative Saeed model. Character/persona
    // selection remains available to the brain but never swaps the 3D asset.
    console.info('[saeed-3d] character selection ignored for visual asset');
  });
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
    playClip('Explain', true);
    playNextVoice();
  });

  api.onStopAudio(() => {
    voiceQueue.length = 0;
    voicePlaying?.pause();
    voicePlaying = null;
    void api.reportAudioState(false);
    if (idleAction) { idleAction.reset().play(); activeAction = idleAction; }
  });
}

window.addEventListener('resize', resize);
wirePointerEvents();
wireApi();

try {
  setupRenderer();
  setupScene();
  resize();
  void loadCharacter().catch((err) => showError(String(err?.message ?? err)));
} catch (err) {
  showError(String(err instanceof Error ? err.message : err));
}
