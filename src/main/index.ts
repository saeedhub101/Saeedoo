import { app, Tray, nativeImage } from 'electron';
import { join } from 'node:path';
import { loadProjectEnv } from './loadEnv';
import { logger } from './logger';

// Keep startup lightweight: create the Saeed window first, then initialize
// brain, voice, tray, hotkeys and other optional subsystems.
const envResult = loadProjectEnv(__dirname);

let tray: Tray | null = null;

async function rebuildTrayMenu(): Promise<void> {
  if (!tray) return;
  const { buildSaeedMenu } = await import('./contextMenu');
  const { openAskBubble } = await import('./interaction');
  tray.setContextMenu(await buildSaeedMenu({
    askSaeed: () => openAskBubble(),
    onZoomChange: () => void rebuildTrayMenu(),
    onMuteChange: () => void rebuildTrayMenu(),
    onVoiceChange: () => void rebuildTrayMenu(),
    onTasksChange: () => void rebuildTrayMenu(),
    onCharacterChange: () => void rebuildTrayMenu(),
    onAutoStartChange: () => void rebuildTrayMenu(),
    onHermesProfileChange: () => void rebuildTrayMenu(),
    onDisplayModeChange: () => void rebuildTrayMenu(),
    onAppearanceChange: () => void rebuildTrayMenu(),
  }));
}

function buildTray(): void {
  const icoPath = join(__dirname, '../../resources/icon.ico');
  const pngPath = join(__dirname, '../../resources/icon.png');
  let image = nativeImage.createFromPath(icoPath);
  if (image.isEmpty()) image = nativeImage.createFromPath(pngPath);
  if (image.isEmpty()) {
    logger.warn('Tray icon not found at', icoPath, 'or', pngPath);
    image = nativeImage.createEmpty();
  }
  tray = new Tray(image);
  tray.setToolTip('Saeed the Wizard');
  void rebuildTrayMenu();
  tray.on('click', async () => {
    const { createSpriteWindow, getSpriteWindow, setHidden, setVisible } =
      await import('./windows/spriteWindow');
    const w = getSpriteWindow();
    if (!w) await createSpriteWindow();
    else if (w.isVisible()) await setHidden({ force: true });
    else await setVisible();
  });
}

app.whenReady().then(async () => {
  logger.info('Saeed starting');
  logger.info('.env load result:', envResult);

  // Create the first visible window before loading the large IPC dependency
  // graph. registerHandlers imports voice/LLM/brain/settings modules; any
  // module-init failure there must never prevent the character window from
  // existing.
  const { createSpriteWindow, getSpriteWindow, setOnZoomChanged } =
    await import('./windows/spriteWindow');

  // FIRST APPLICATION WINDOW: no brain/voice/tray/custom-character loading
  // is allowed before this call.
  const sprite = await createSpriteWindow();
  logger.info('Saeed sprite window created; continuing startup');

  // The sprite renderer does not require these handlers to create the window.
  // Register them immediately after the window exists.
  try {
    const { registerIpcHandlers } = await import('./ipc/registerHandlers');
    registerIpcHandlers();
  } catch (err) {
    logger.error('IPC registration failed; Saeed window remains available:', err);
  }

  try {
    const { read: readStore } = await import('./storage/store');
    const settings = await readStore();

    logger.info('AI:', process.env.GROQ_API_KEY
      ? `Groq configured (key found, length=${process.env.GROQ_API_KEY.length}, model llama-3.3-70b-versatile)`
      : 'NOT configured — set GROQ_API_KEY in .env to enable real chat');
    logger.info('Voice engine:', settings.voiceEngine, '(voice:', settings.voiceName, ')');

    const { loadCustomCharacters } = await import('./customCharacters');
    await loadCustomCharacters();

    const { attachSpriteMoveSync } = await import('./moveSync');
    attachSpriteMoveSync(sprite);
    buildTray();
    setOnZoomChanged(() => void rebuildTrayMenu());

    const { setOnMoodChange } = await import('./feelings');
    setOnMoodChange(() => void rebuildTrayMenu());
    const { setOnTasksChange } = await import('./tasks');
    setOnTasksChange(() => void rebuildTrayMenu());

    const { warmExtensionsCache } = await import('./extensions');
    await warmExtensionsCache();

    const { startBrain } = await import('./brain');
    await startBrain();

    const { registerScreenshotHotkey, registerSummonHotkey } = await import('./hotkey');
    await registerSummonHotkey();
    await registerScreenshotHotkey();

    const { syncAutoStartOnBoot } = await import('./autostart');
    await syncAutoStartOnBoot();

    const { startAutoUpdater } = await import('./updater');
    startAutoUpdater();

    const { getCachedHermesProfiles, discoverAllHermesProfiles } =
      await import('./hermesDiscovery');
    if (settings.llmProvider === 'hermes' && settings.hermesEndpoint?.trim()) {
      const cached = await getCachedHermesProfiles();
      if (cached.length === 0) {
        void discoverAllHermesProfiles()
          .then((found) => {
            logger.info('Auto-discovered', found.length, 'Hermes profile(s) at boot');
            void rebuildTrayMenu();
          })
          .catch((err) => logger.warn('Auto-discovery failed (non-fatal):', err?.message ?? err));
      }
    }

    const { playWelcome } = await import('./welcome');
    const {
      startProactiveBehaviors, reactToAppBlur, reactToAppFocus,
    } = await import('./animationController');

    sprite.webContents.once('did-finish-load', () => {
      setTimeout(() => void playWelcome(), 1600);
      startProactiveBehaviors();
      if (!settings.firstRunComplete) {
        logger.info('first run detected — auto-launching Setup Wizard in 3.5s');
        setTimeout(() => {
          void import('./windows/setupWizardWindow')
            .then(({ openSetupWizardWindow }) => openSetupWizardWindow())
            .catch((err) => logger.error('Setup Wizard failed:', err));
        }, 3500);
      }
    });

    app.on('browser-window-blur', () => reactToAppBlur());
    app.on('browser-window-focus', () => void reactToAppFocus());

    if (settings.displayMode === 'modern') {
      logger.info('displayMode=modern — sprite + chat panel both visible');
      const { showChatPanel } = await import('./windows/chatPanelWindow');
      showChatPanel();
    } else {
      const { hideChatPanel } = await import('./windows/chatPanelWindow');
      hideChatPanel();
    }

    // Keep the startup import alive for tray callbacks.
    void getSpriteWindow;
  } catch (err) {
    // A post-window subsystem failure must never make Saeed disappear.
    logger.error('Post-window startup failed; Saeed window remains available:', err);
  }
});

app.on('window-all-closed', () => {
  // Tray app: don't quit on window close.
});

app.on('before-quit', () => {
  logger.info('Saeed quitting');
  void import('./hotkey')
    .then(({ unregisterAllHotkeys }) => unregisterAllHotkeys())
    .catch((err) => logger.warn('Could not unregister hotkeys:', err));
});

app.on('will-quit', () => {
  void import('./hotkey')
    .then(({ unregisterAllHotkeys }) => unregisterAllHotkeys())
    .catch(() => undefined);
});
