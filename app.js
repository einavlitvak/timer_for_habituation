// PWA Update / Cache-Busting Mechanism
const APP_VERSION = '8';
if (localStorage.getItem('app_version') !== APP_VERSION) {
  localStorage.setItem('app_version', APP_VERSION);
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      for (let r of registrations) r.unregister();
    }).then(() => {
      if ('caches' in window) {
        caches.keys().then(keys => {
          Promise.all(keys.map(k => caches.delete(k))).then(() => {
            window.location.reload();
          });
        });
      } else {
        window.location.reload();
      }
    });
  } else {
    window.location.reload();
  }
}

// Habituation Timer App Logic

// State Variables
let totalSeconds = 1800; // 30 mins
let delaySeconds = 300;   // 5 mins
let intervalSeconds = 300; // 5 mins

let timerInterval = null;
let secondsRemaining = 1800;
let secondsElapsed = 0;
let lastIntervalFiredSeconds = null;
let isPaused = true;
let wakeLock = null;

// Settings
let wakeLockEnabled = true;
let alertMode = 'both'; // 'sound', 'vibrate', 'both'
let soundType = 'chime'; // 'beep', 'double', 'chime', 'woodblock', 'ascending'
let voiceNotesEnabled = true;
let vibrationPattern = 'double'; // 'double', 'light', 'heartbeat', 'strong', 'sos'

const vibrationPatterns = {
  double: [150, 100, 250],
  light: [80],
  heartbeat: [100, 100, 250],
  strong: [500],
  sos: [100, 100, 100, 100, 100, 100, 300, 100, 300, 100, 300, 100, 100, 100, 100, 100, 100]
};

// Web Audio API
let audioCtx = null;
let keepAliveAudio = null; // Background execution keep-alive

// Speech Recognition & Synthesis
let recognition = null;
let isListening = false;
let autoListenActive = false;
let earbudsDetected = false;

// Config Dynamic Notes State
let activeConfigMicIndex = null;
let activeConfigMicBtn = null;
let preConfiguredNotes = [];
let pendingSpeechText = null; // Missed background speech notes queue

let deferredPrompt = null;

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  initDOMElements();
  setupPresets();
  setupEventListeners();
  checkMediaDevices();
  initSpeechRecognition();
  registerServiceWorker();
  initNotificationPermission();
  updateIntervalInputs(); // Populate dynamic interval inputs for default preset
});

// Register Service Worker for PWA
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => {
        console.log('Service Worker registered successfully:', reg.scope);
      })
      .catch(err => console.warn('Service Worker registration failed:', err));
      
    // Reload page immediately when a new SW takes over
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('New Service Worker activated. Reloading page...');
      window.location.reload();
    });
  }
}

// DOM Elements
let elTotalHrs, elTotalMins, elTotalSecs;
let elDelayHrs, elDelayMins, elDelaySecs;
let elIntHrs, elIntMins, elIntSecs;
let elStartBtn, elPauseBtn, elResetBtn;
let elConfigScreen, elTimerScreen;
let elRemainingTimeText, elSublabel;
let elNextSignalVal, elSignalsCountVal;
let elProgressRingTotal, elProgressRingInterval;
let elWakeLockToggle, elAlertModeSelect, elSoundTypeSelect;
let elVoiceNotesToggle, elEarbudStatusBadge, elWakeLockBadge;
let elNotificationsBadge;
let elLogsList, elClearLogsBtn;
let elMicBtn, elVoiceStatusText;
let elManualNoteInput, elSendNoteBtn;
let elTestSoundBtn;
let elInstallBanner, elInstallBtn;
let elPreIntervalsContainer;
let elPrevIntervalBtn, elNextIntervalBtn;
let elVibratePatternSelect;

function initDOMElements() {
  elTotalHrs = document.getElementById('total-hrs');
  elTotalMins = document.getElementById('total-mins');
  elTotalSecs = document.getElementById('total-secs');
  
  elDelayHrs = document.getElementById('delay-hrs');
  elDelayMins = document.getElementById('delay-mins');
  elDelaySecs = document.getElementById('delay-secs');
  
  elIntHrs = document.getElementById('int-hrs');
  elIntMins = document.getElementById('int-mins');
  elIntSecs = document.getElementById('int-secs');
  
  elStartBtn = document.getElementById('start-btn');
  elPauseBtn = document.getElementById('pause-btn');
  elResetBtn = document.getElementById('reset-btn');
  
  elConfigScreen = document.getElementById('config-screen');
  elTimerScreen = document.getElementById('timer-screen');
  
  elRemainingTimeText = document.getElementById('remaining-time-text');
  elSublabel = document.getElementById('timer-sublabel');
  
  elNextSignalVal = document.getElementById('next-signal-val');
  elSignalsCountVal = document.getElementById('signals-count-val');
  
  elProgressRingTotal = document.getElementById('ring-total-circle');
  elProgressRingInterval = document.getElementById('ring-interval-circle');
  
  elWakeLockToggle = document.getElementById('wakelock-toggle');
  elAlertModeSelect = document.getElementById('alert-mode');
  elSoundTypeSelect = document.getElementById('sound-type');
  elVoiceNotesToggle = document.getElementById('voicenotes-toggle');
  
  elEarbudStatusBadge = document.getElementById('badge-earbuds');
  elWakeLockBadge = document.getElementById('badge-wakelock');
  elNotificationsBadge = document.getElementById('badge-notifications');
  
  elLogsList = document.getElementById('logs-list');
  elClearLogsBtn = document.getElementById('clear-logs-btn');
  
  elMicBtn = document.getElementById('mic-btn');
  elVoiceStatusText = document.getElementById('voice-status-text');
  elManualNoteInput = document.getElementById('manual-note-input');
  elSendNoteBtn = document.getElementById('send-note-btn');
  elTestSoundBtn = document.getElementById('test-sound-btn');

  elInstallBanner = document.getElementById('install-banner');
  elInstallBtn = document.getElementById('install-btn');
  
  elPreIntervalsContainer = document.getElementById('pre-intervals-container');
  elPrevIntervalBtn = document.getElementById('prev-interval-btn');
  elNextIntervalBtn = document.getElementById('next-interval-btn');
  elVibratePatternSelect = document.getElementById('vibrate-pattern');
}

// Preset configurations
const presets = [
  { name: 'Habituation 30/5/5', total: 1800, delay: 300, interval: 300 },
  { name: 'Standard 20/5/2', total: 1200, delay: 300, interval: 120 },
  { name: 'Quick Test 1m/10s/10s', total: 60, delay: 10, interval: 10 },
  { name: 'Intense 15m/0m/1m', total: 900, delay: 0, interval: 60 }
];

function setupPresets() {
  const presetContainer = document.querySelector('.preset-list');
  presetContainer.innerHTML = '';
  
  presets.forEach((preset, index) => {
    const chip = document.createElement('button');
    chip.className = `preset-chip ${index === 0 ? 'active' : ''}`;
    chip.textContent = preset.name;
    chip.addEventListener('click', () => {
      document.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      loadPreset(preset);
    });
    presetContainer.appendChild(chip);
  });
  
  // Load default preset initially
  loadPreset(presets[0]);
}

function loadPreset(preset) {
  // Total Time
  const th = Math.floor(preset.total / 3600);
  const tm = Math.floor((preset.total % 3600) / 60);
  const ts = preset.total % 60;
  elTotalHrs.value = String(th).padStart(2, '0');
  elTotalMins.value = String(tm).padStart(2, '0');
  elTotalSecs.value = String(ts).padStart(2, '0');
  
  // Delay Time
  const dh = Math.floor(preset.delay / 3600);
  const dm = Math.floor((preset.delay % 3600) / 60);
  const ds = preset.delay % 60;
  elDelayHrs.value = String(dh).padStart(2, '0');
  elDelayMins.value = String(dm).padStart(2, '0');
  elDelaySecs.value = String(ds).padStart(2, '0');
  
  // Interval Time
  const ih = Math.floor(preset.interval / 3600);
  const im = Math.floor((preset.interval % 3600) / 60);
  const is = preset.interval % 60;
  elIntHrs.value = String(ih).padStart(2, '0');
  elIntMins.value = String(im).padStart(2, '0');
  elIntSecs.value = String(is).padStart(2, '0');
  
  updateIntervalInputs();
}

// Time calculation helper
function getInputsInSeconds() {
  const total = (parseInt(elTotalHrs.value) || 0) * 3600 +
                (parseInt(elTotalMins.value) || 0) * 60 +
                (parseInt(elTotalSecs.value) || 0);
                
  const delay = (parseInt(elDelayHrs.value) || 0) * 3600 +
                (parseInt(elDelayMins.value) || 0) * 60 +
                (parseInt(elDelaySecs.value) || 0);
                
  const interval = (parseInt(elIntHrs.value) || 0) * 3600 +
                   (parseInt(elIntMins.value) || 0) * 60 +
                   (parseInt(elIntSecs.value) || 0);
                   
  return { total, delay, interval };
}

// Event Listeners Setup
function setupEventListeners() {
  // Input validations (pad with leading zero on blur)
  const padInput = (e) => {
    let val = parseInt(e.target.value) || 0;
    if (val < 0) val = 0;
    if (e.target.dataset.max && val > parseInt(e.target.dataset.max)) {
      val = parseInt(e.target.dataset.max);
    }
    e.target.value = String(val).padStart(2, '0');
  };
  
  document.querySelectorAll('.time-field').forEach(input => {
    input.addEventListener('blur', (e) => {
      padInput(e);
      updateIntervalInputs();
    });
    input.addEventListener('input', updateIntervalInputs);
    input.addEventListener('focus', e => e.target.select());
  });

  // Toggles and Selects
  elWakeLockToggle.addEventListener('change', (e) => {
    wakeLockEnabled = e.target.checked;
    if (!isPaused && wakeLockEnabled) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }
  });

  elAlertModeSelect.addEventListener('change', (e) => {
    alertMode = e.target.value;
  });

  elSoundTypeSelect.addEventListener('change', (e) => {
    soundType = e.target.value;
  });

  elVibratePatternSelect.addEventListener('change', (e) => {
    vibrationPattern = e.target.value;
  });

  elVoiceNotesToggle.addEventListener('change', (e) => {
    voiceNotesEnabled = e.target.checked;
    if (voiceNotesEnabled) {
      // Request mic access immediately to ensure no blockages
      requestMicPermission();
    }
  });

  // Controls
  elStartBtn.addEventListener('click', startTimer);
  elPauseBtn.addEventListener('click', togglePause);
  elResetBtn.addEventListener('click', resetTimer);
  elTestSoundBtn.addEventListener('click', testSound);
  elClearLogsBtn.addEventListener('click', clearLogs);

  // Interval Navigation Controls
  if (elPrevIntervalBtn) {
    elPrevIntervalBtn.addEventListener('click', jumpToPreviousInterval);
  }
  if (elNextIntervalBtn) {
    elNextIntervalBtn.addEventListener('click', jumpToNextInterval);
  }

  // Manual Mic Trigger
  elMicBtn.addEventListener('click', () => {
    if (isListening) {
      stopVoiceListening();
    } else {
      startVoiceListening(false); // Manual note dictation
    }
  });

  // Manual text note/command listeners
  if (elSendNoteBtn) {
    elSendNoteBtn.addEventListener('click', submitManualNote);
  }
  if (elManualNoteInput) {
    elManualNoteInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        submitManualNote();
      }
    });
  }

  // Notification badge request permission on click
  if (elNotificationsBadge) {
    elNotificationsBadge.addEventListener('click', requestNotificationPermission);
  }

  // Listen for visibility changes to manage wake lock
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // PWA Install Click Listener
  if (elInstallBtn) {
    elInstallBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to install prompt: ${outcome}`);
      deferredPrompt = null;
      if (elInstallBanner) {
        elInstallBanner.style.display = 'none';
      }
    });
  }
}

// Media Device / Earbuds Detection
async function checkMediaDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    console.warn("Media devices API not supported.");
    return;
  }

  // Monitor changes
  navigator.mediaDevices.addEventListener('devicechange', checkMediaDevices);

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    let headphoneFound = false;
    
    // Look at audio output devices
    devices.forEach(device => {
      if (device.kind === 'audiooutput') {
        const label = device.label.toLowerCase();
        // Since label is blank unless mic permission is granted, we also rely on deviceIds shifting,
        // but if permission is granted we can parse labels.
        if (label.includes('headphone') || 
            label.includes('earbud') || 
            label.includes('bluetooth') || 
            label.includes('pods') || 
            label.includes('hands-free') || 
            label.includes('hfp') || 
            label.includes('a2dp')) {
          headphoneFound = true;
        }
      }
    });

    // Check if system default is bluetooth or headphone, or if we have non-speaker audio outputs.
    // Sometimes browsers hide labels, but we do our best.
    earbudsDetected = headphoneFound;
    updateEarbudBadge();
  } catch (err) {
    console.error("Error checking media devices:", err);
  }
}

function updateEarbudBadge() {
  if (earbudsDetected) {
    elEarbudStatusBadge.textContent = "🎧 Earbuds Connected";
    elEarbudStatusBadge.classList.add('active');
    elEarbudStatusBadge.classList.remove('warning');
  } else {
    elEarbudStatusBadge.textContent = "🔊 Speakers Active";
    elEarbudStatusBadge.classList.remove('active');
    elEarbudStatusBadge.classList.remove('warning');
  }
}

// Request microphone access
async function requestMicPermission() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Release stream immediately, we just wanted to grant labels and speech rights
    stream.getTracks().forEach(track => track.stop());
    checkMediaDevices(); // check again, labels will be populated now!
  } catch (err) {
    console.warn("Microphone access denied. Voice commands/notes will be limited.", err);
    elEarbudStatusBadge.textContent = "⚠️ Mic Access Blocked";
    elEarbudStatusBadge.classList.add('warning');
  }
}

// Audio Synthesizer (Web Audio API)
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function playSignalTone() {
  initAudio();
  const now = audioCtx.currentTime;
  
  switch(soundType) {
    case 'beep':
      playOscillator(880, 0.25, 'sine');
      break;
    case 'double':
      playOscillator(880, 0.12, 'sine');
      setTimeout(() => playOscillator(880, 0.12, 'sine'), 200);
      break;
    case 'chime':
      // Rich FM/additive synthesis chime
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      const gain2 = audioCtx.createGain();
      
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(987.77, now); // B5
      gain1.gain.setValueAtTime(0.25, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
      
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(493.88, now); // B4
      gain2.gain.setValueAtTime(0.12, now);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 1.2);
      osc2.stop(now + 0.8);
      break;
    case 'woodblock':
      // Fast pitch drop, rapid decay
      const wOsc = audioCtx.createOscillator();
      const wGain = audioCtx.createGain();
      wOsc.type = 'triangle';
      wOsc.frequency.setValueAtTime(800, now);
      wOsc.frequency.exponentialRampToValueAtTime(400, now + 0.08);
      wGain.gain.setValueAtTime(0.4, now);
      wGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      
      wOsc.connect(wGain);
      wGain.connect(audioCtx.destination);
      
      wOsc.start(now);
      wOsc.stop(now + 0.08);
      break;
    case 'ascending':
      // Three ascending notes (A5, C6, E6)
      playOscillator(440, 0.1, 'sine');
      setTimeout(() => playOscillator(554.37, 0.1, 'sine'), 120);
      setTimeout(() => playOscillator(659.25, 0.15, 'sine'), 240);
      break;
  }
}

function playOscillator(freq, duration, type = 'sine') {
  initAudio();
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  
  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

function testSound() {
  initAudio();
  playSignalTone();
  triggerVibration();
  triggerScreenFlash();
}

// Vibration controller
function triggerVibration() {
  if ('vibrate' in navigator) {
    if (alertMode === 'vibrate' || alertMode === 'both') {
      const pattern = vibrationPatterns[vibrationPattern] || vibrationPatterns.double;
      navigator.vibrate(pattern);
    }
  }
}

// Flash Screen overlay
function triggerScreenFlash() {
  const flash = document.getElementById('flash-overlay');
  flash.classList.remove('active');
  void flash.offsetWidth; // Trigger reflow to restart animation
  flash.classList.add('active');
}

// Screen Wake Lock API
async function requestWakeLock() {
  if (!wakeLockEnabled || !('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    elWakeLockBadge.textContent = "👁️ Screen On";
    elWakeLockBadge.classList.add('active');
    console.log("Wake Lock active.");
  } catch (err) {
    console.warn("Wake lock request failed:", err);
    elWakeLockBadge.textContent = "👁️ Screen Normal";
    elWakeLockBadge.classList.remove('active');
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().then(() => {
      wakeLock = null;
      elWakeLockBadge.textContent = "👁️ Screen Normal";
      elWakeLockBadge.classList.remove('active');
      console.log("Wake Lock released.");
    });
  }
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    if (wakeLock !== null) {
      requestWakeLock();
    }
    
    // Play back any speech note missed while in the background
    if (pendingSpeechText) {
      const textToSpeak = pendingSpeechText;
      pendingSpeechText = null;
      setTimeout(() => {
        speakOut(textToSpeak);
      }, 300);
    }
  }
}

// Speech Recognition Initialization
function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn("Web Speech Recognition API is not supported in this browser.");
    elVoiceStatusText.textContent = "Voice input not supported in this browser.";
    elMicBtn.style.display = 'none';
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    isListening = true;
    if (activeConfigMicIndex !== null) {
      if (activeConfigMicBtn) {
        activeConfigMicBtn.classList.add('recording');
      }
    } else {
      elMicBtn.classList.add('listening');
      elVoiceStatusText.textContent = "Listening for voice note...";
    }
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    
    if (activeConfigMicIndex !== null) {
      // Find the specific setup text input and write the transcript
      const inputs = elPreIntervalsContainer.querySelectorAll('.interval-text-input');
      const targetInput = Array.from(inputs).find(input => parseInt(input.getAttribute('data-index')) === activeConfigMicIndex);
      if (targetInput) {
        targetInput.value = transcript;
        speakOut(`Saved.`);
      }
      stopConfigurationMic();
    } else {
      elVoiceStatusText.textContent = `Captured: "${transcript}"`;
      speakOut(`Note saved.`);
      appendVoiceNoteToLog(transcript);
    }
  };

  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
    if (activeConfigMicIndex !== null) {
      stopConfigurationMic();
    } else {
      if (event.error === 'no-speech') {
        elVoiceStatusText.textContent = "No speech detected.";
      } else {
        elVoiceStatusText.textContent = `Voice Error: ${event.error}`;
      }
      stopVoiceListening();
    }
  };

  recognition.onend = () => {
    if (activeConfigMicIndex !== null) {
      stopConfigurationMic();
    } else {
      stopVoiceListening();
      if (autoListenActive) {
        autoListenActive = false;
      }
    }
  };
}

function startVoiceListening(isAuto = false) {
  if (!recognition) return;
  initAudio();
  autoListenActive = isAuto;
  try {
    recognition.start();
  } catch (err) {
    // Already running, ignore
  }
}

function stopVoiceListening() {
  isListening = false;
  elMicBtn.classList.remove('listening');
  if (elVoiceStatusText.textContent.startsWith("Listening")) {
    elVoiceStatusText.textContent = "Tap mic to record voice note";
  }
  try {
    recognition.stop();
  } catch (err) {}
}

let activeTTSAudios = [];

function speakOut(text) {
  if (!voiceNotesEnabled) return;
  
  // Format network TTS audio matching system language
  const lang = (navigator.language || 'en').split('-')[0];
  const encodedText = encodeURIComponent(text);
  const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&q=${encodedText}`;
  
  const ttsAudio = new Audio(ttsUrl);
  activeTTSAudios.push(ttsAudio);
  
  ttsAudio.onended = ttsAudio.onerror = () => {
    activeTTSAudios = activeTTSAudios.filter(a => a !== ttsAudio);
  };
  
  ttsAudio.play()
    .then(() => {
      console.log("Playing network TTS background audio.");
    })
    .catch(err => {
      console.warn("Background TTS audio failed, using Web Speech API fallback:", err);
      playSpeechNative(text);
    });
}

function playSpeechNative(text) {
  if (!('speechSynthesis' in window)) return;
  
  // If the app is in the background, native speech synthesis will be blocked by the mobile OS.
  // We queue the note to be read aloud the moment the user brings the app back to focus.
  if (document.visibilityState === 'hidden') {
    pendingSpeechText = text;
    console.log("Speech queued for foreground:", text);
    return;
  }
  
  window.speechSynthesis.cancel(); // Stop any currently speaking speech
  const utterance = new SpeechSynthesisUtterance(text);
  
  // Tweak speech settings for a clear instruction tone
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  window.speechSynthesis.speak(utterance);
}

// Timer Core Implementation
function startTimer() {
  const inputs = getInputsInSeconds();
  totalSeconds = inputs.total;
  delaySeconds = inputs.delay;
  intervalSeconds = inputs.interval;

  if (totalSeconds <= 0) {
    alert("Please enter a total duration greater than 0.");
    return;
  }
  if (intervalSeconds <= 0) {
    alert("Please enter an interval duration greater than 0.");
    return;
  }

  // Gather pre-configured notes
  preConfiguredNotes = getPreConfiguredNotes();

  // Setup state
  secondsRemaining = totalSeconds;
  secondsElapsed = 0;
  lastIntervalFiredSeconds = null;
  isPaused = false;
  
  // Transition screens
  elConfigScreen.style.display = 'none';
  elTimerScreen.style.display = 'flex';
  
  // Initialize displays
  updateTimerUI();
  
  // Wake lock
  requestWakeLock();
  
  // Initialize sound context and keep-alive background audio
  initAudio();
  startKeepAliveAudio();
  
  // Start ticks (high-precision background setInterval loop)
  let lastTime = Date.now();
  timerInterval = setInterval(() => {
    if (isPaused) return;
    
    const currentTime = Date.now();
    const delta = currentTime - lastTime;
    if (delta >= 1000) {
      const ticks = Math.floor(delta / 1000);
      lastTime += ticks * 1000;
      
      for(let i = 0; i < ticks; i++) {
        if (secondsRemaining > 0) {
          secondsRemaining--;
          secondsElapsed++;
          checkIntervals();
        } else {
          finishTimer();
          return;
        }
      }
      updateTimerUI();
    }
  }, 250);

  appendLog("Timer started", `Total: ${formatTime(totalSeconds)} | Delay: ${formatTime(delaySeconds)} | Interval: ${formatTime(intervalSeconds)}`);
  
  if (voiceNotesEnabled) {
    speakOut("Timer started. Waiting before intervals.");
  }
}

function checkIntervals() {
  // Interval trigger conditions:
  // 1. Elapsed time must be equal to or greater than start delay
  // 2. We trigger exactly at startDelay (first interval boundary) and every intervalSeconds thereafter.
  
  if (secondsElapsed >= delaySeconds) {
    if (lastIntervalFiredSeconds === null) {
      // First fire exactly at delay threshold
      fireIntervalAlert();
    } else if (secondsElapsed - lastIntervalFiredSeconds >= intervalSeconds) {
      // Subsequent fires
      fireIntervalAlert();
    }
  }
}

function fireIntervalAlert() {
  lastIntervalFiredSeconds = secondsElapsed;
  
  // Play alarms
  playSignalTone();
  triggerVibration();
  triggerScreenFlash();
  
  const signalsCount = getSignalsCount();
  const label = `Signal #${signalsCount}`;
  
  // Retrieve the pre-configured note for this signal
  const note = preConfiguredNotes[signalsCount - 1] || "";
  const details = note.trim() !== "" ? note : `${formatTime(secondsRemaining)} remaining`;
  appendLog(label, details);
  
  // Show system notification banner
  showLocalNotification(`Signal #${signalsCount} Reached`, details);
  
  // Speak out voice prompts if enabled (read pre-configured note or standard alert)
  if (voiceNotesEnabled) {
    if (note.trim() !== "") {
      speakOut(`Signal ${signalsCount}: ${note}`);
    } else {
      speakOut(`Signal ${signalsCount} reached.`);
    }
  }
}

function togglePause() {
  if (isPaused) {
    // Resume
    isPaused = false;
    elPauseBtn.textContent = "Pause";
    elPauseBtn.classList.remove('active-pause');
    requestWakeLock();
    initAudio();
    startKeepAliveAudio();
    
    let lastTime = Date.now();
    timerInterval = setInterval(() => {
      if (isPaused) return;
      const currentTime = Date.now();
      const delta = currentTime - lastTime;
      if (delta >= 1000) {
        const ticks = Math.floor(delta / 1000);
        lastTime += ticks * 1000;
        for(let i = 0; i < ticks; i++) {
          if (secondsRemaining > 0) {
            secondsRemaining--;
            secondsElapsed++;
            checkIntervals();
          } else {
            finishTimer();
            return;
          }
        }
        updateTimerUI();
      }
    }, 250);
    
    appendLog("Timer resumed", "");
  } else {
    // Pause
    isPaused = true;
    elPauseBtn.textContent = "Resume";
    elPauseBtn.classList.add('active-pause');
    clearInterval(timerInterval);
    releaseWakeLock();
    stopVoiceListening();
    stopKeepAliveAudio();
    appendLog("Timer paused", "");
  }
}

function resetTimer() {
  isPaused = true;
  clearInterval(timerInterval);
  releaseWakeLock();
  stopVoiceListening();
  stopKeepAliveAudio();
  
  secondsRemaining = totalSeconds;
  secondsElapsed = 0;
  lastIntervalFiredSeconds = null;
  
  elPauseBtn.textContent = "Pause";
  elPauseBtn.classList.remove('active-pause');
  
  elConfigScreen.style.display = 'block';
  elTimerScreen.style.display = 'none';
  
  appendLog("Timer reset", "");
}

function finishTimer() {
  isPaused = true;
  clearInterval(timerInterval);
  releaseWakeLock();
  stopVoiceListening();
  stopKeepAliveAudio();
  
  // Grand final tone
  playOscillator(523.25, 0.15, 'sine'); // C5
  setTimeout(() => playOscillator(659.25, 0.15, 'sine'), 150); // E5
  setTimeout(() => playOscillator(783.99, 0.15, 'sine'), 300); // G5
  setTimeout(() => playOscillator(1046.50, 0.4, 'sine'), 450); // C6
  triggerVibration();
  triggerScreenFlash();
  
  elRemainingTimeText.textContent = "00:00:00";
  elSublabel.textContent = "Session Completed!";
  
  appendLog("Timer Finished", "All intervals completed.");
  showLocalNotification("Session Completed", "Habituation timer session finished successfully.");
  
  if (voiceNotesEnabled) {
    speakOut("Timer completed. Great job.");
  }
}

// UI Updating Helpers
function updateTimerUI() {
  // Update Time remaining text
  elRemainingTimeText.textContent = formatTime(secondsRemaining);
  
  // Update sub-label message
  if (secondsElapsed < delaySeconds) {
    const diff = delaySeconds - secondsElapsed;
    elSublabel.textContent = `Intervals start in ${formatTime(diff)}`;
    elSublabel.style.color = 'var(--text-secondary)';
  } else {
    elSublabel.textContent = `Intervals Active`;
    elSublabel.style.color = 'var(--color-emerald)';
  }
  
  // Next signal countdown
  if (secondsElapsed < delaySeconds) {
    const nextSig = delaySeconds - secondsElapsed;
    elNextSignalVal.textContent = formatTime(nextSig);
  } else {
    const nextSig = intervalSeconds - ((secondsElapsed - delaySeconds) % intervalSeconds);
    // If nextSig is exactly intervalSeconds, it means we just fired or it's ticking down.
    elNextSignalVal.textContent = formatTime(nextSig === 0 ? intervalSeconds : nextSig);
  }
  
  // Total signals triggered
  elSignalsCountVal.textContent = getSignalsCount();
  
  // Circular rings dash offsets
  // Total Ring calculations
  const totalCircumference = 2 * Math.PI * 36; // r=36
  const totalProgress = (totalSeconds - secondsRemaining) / totalSeconds;
  const totalOffset = totalCircumference - (totalProgress * totalCircumference);
  elProgressRingTotal.style.strokeDasharray = `${totalCircumference} ${totalCircumference}`;
  elProgressRingTotal.style.strokeDashoffset = totalOffset;
  
  // Interval Ring calculations
  const intervalCircumference = 2 * Math.PI * 32; // r=32
  let intervalProgress = 0;
  if (secondsElapsed >= delaySeconds) {
    const curIntervalElapsed = (secondsElapsed - delaySeconds) % intervalSeconds;
    intervalProgress = curIntervalElapsed / intervalSeconds;
  } else {
    // During startup delay
    intervalProgress = secondsElapsed / delaySeconds;
  }
  const intervalOffset = intervalCircumference - (intervalProgress * intervalCircumference);
  elProgressRingInterval.style.strokeDasharray = `${intervalCircumference} ${intervalCircumference}`;
  elProgressRingInterval.style.strokeDashoffset = intervalOffset;
}

function getSignalsCount() {
  if (lastIntervalFiredSeconds === null) return 0;
  return Math.floor((secondsElapsed - delaySeconds) / intervalSeconds) + 1;
}

function formatTime(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  
  return [
    String(h).padStart(2, '0'),
    String(m).padStart(2, '0'),
    String(s).padStart(2, '0')
  ].join(':');
}

// Logs Management
function appendLog(label, text) {
  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0];
  
  // Remove empty label
  const empty = elLogsList.querySelector('.logs-empty');
  if (empty) empty.remove();
  
  const logItem = document.createElement('div');
  logItem.className = 'log-item';
  logItem.innerHTML = `
    <div class="log-meta">
      <span class="log-time">${timeStr}</span>
      <span class="log-label">${label}</span>
    </div>
    <div class="log-text">${text}</div>
  `;
  
  // Prepend to show latest at top
  elLogsList.insertBefore(logItem, elLogsList.firstChild);
}

function appendVoiceNoteToLog(text) {
  appendNoteToLog(text, true);
}

function appendNoteToLog(text, isVoice = true) {
  const prefix = isVoice ? '🎙️' : '📝';
  const firstLog = elLogsList.firstElementChild;
  if (firstLog && !firstLog.classList.contains('logs-empty')) {
    const voiceNoteDiv = document.createElement('div');
    voiceNoteDiv.className = 'log-dictation';
    voiceNoteDiv.textContent = `${prefix} "${text}"`;
    firstLog.appendChild(voiceNoteDiv);
  } else {
    appendLog(isVoice ? "Voice Note" : "Manual Note", `${prefix} "${text}"`);
  }
}

function clearLogs() {
  elLogsList.innerHTML = '<div class="logs-empty">No entries logged yet.</div>';
}

// PWA Installer Prompt
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (elInstallBanner) {
    elInstallBanner.style.display = 'flex';
  }
});

window.addEventListener('appinstalled', () => {
  console.log('Habituation Timer app installed successfully.');
  if (elInstallBanner) {
    elInstallBanner.style.display = 'none';
  }
});

// Notifications Permission Initialization & Helpers
function initNotificationPermission() {
  if ('Notification' in window) {
    updateNotificationBadge();
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(() => {
        updateNotificationBadge();
      });
    }
  } else {
    if (elNotificationsBadge) elNotificationsBadge.style.display = 'none';
  }
}

function requestNotificationPermission() {
  if ('Notification' in window) {
    Notification.requestPermission().then(permission => {
      updateNotificationBadge();
      if (permission === 'granted') {
        showLocalNotification("Notifications Enabled", "You will now receive interval alerts in the background.");
      }
    });
  }
}

function updateNotificationBadge() {
  if (!elNotificationsBadge) return;
  if (!('Notification' in window)) {
    elNotificationsBadge.style.display = 'none';
    return;
  }
  
  if (Notification.permission === 'granted') {
    elNotificationsBadge.textContent = "🔔 Notifications Active";
    elNotificationsBadge.className = "badge active";
  } else if (Notification.permission === 'denied') {
    elNotificationsBadge.textContent = "🔕 Notifications Blocked";
    elNotificationsBadge.className = "badge warning";
  } else {
    elNotificationsBadge.textContent = "🔔 Click for Alerts";
    elNotificationsBadge.className = "badge info";
    elNotificationsBadge.style.cursor = "pointer";
  }
}

function showLocalNotification(title, message) {
  if ('Notification' in window && Notification.permission === 'granted') {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification(title, {
          body: message,
          icon: './icon-192.png',
          badge: './icon-192.png',
          vibrate: vibrationPatterns[vibrationPattern] || vibrationPatterns.double,
          tag: 'habituation-timer-signal',
          renotify: true,
          requireInteraction: false
        });
      }).catch(err => {
        console.error("SW notification dispatch error:", err);
        new Notification(title, { body: message, icon: './icon-192.png' });
      });
    } else {
      new Notification(title, { body: message, icon: './icon-192.png' });
    }
  }
}

// Background Audio Keep-Alive
function startKeepAliveAudio() {
  if (!keepAliveAudio) {
    keepAliveAudio = new Audio();
    keepAliveAudio.src = createSilentAudioURL(5); // 5-second silence WAV
    keepAliveAudio.loop = true;
  }
  
  keepAliveAudio.play().then(() => {
    console.log("Keep-alive audio started.");
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'Habituation Timer',
        artist: 'Session Active',
        album: 'Timer Running in Background',
        artwork: [{ src: './icon-192.png', sizes: '192x192', type: 'image/png' }]
      });
    }
  }).catch(err => {
    console.warn("Could not start keep-alive audio:", err);
  });
}

// Generate silent WAV dynamic Blob URL to avoid PWA background execution throttle
function createSilentAudioURL(durationSeconds = 5) {
  const sampleRate = 8000;
  const numChannels = 1;
  const numSamples = sampleRate * durationSeconds;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);
  
  function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
  
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, numSamples * 2, true);
  
  for (let i = 0; i < numSamples; i++) {
    view.setInt16(44 + i * 2, 0, true);
  }
  
  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

function stopKeepAliveAudio() {
  if (keepAliveAudio) {
    keepAliveAudio.pause();
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused';
    }
  }
}

// Manual Text Notes / Command Handler
function submitManualNote() {
  if (!elManualNoteInput) return;
  const text = elManualNoteInput.value.trim();
  if (!text) return;
  
  elManualNoteInput.value = '';
  elManualNoteInput.blur();
  
  const lower = text.toLowerCase();
  if (lower === 'pause') {
    if (!isPaused) {
      togglePause();
      appendLog("Command: Pause", "Triggered by manual text");
    }
  } else if (lower === 'resume' || lower === 'start') {
    if (isPaused) {
      togglePause();
      appendLog("Command: Resume", "Triggered by manual text");
    }
  } else if (lower === 'reset' || lower === 'end' || lower === 'stop') {
    resetTimer();
    appendLog("Command: End Session", "Triggered by manual text");
  } else {
    appendNoteToLog(text, false);
    speakOut("Note saved.");
  }
}

// Dynamic Interval Input Recalculation
function updateIntervalInputs() {
  const inputs = getInputsInSeconds();
  const total = inputs.total;
  const delay = inputs.delay;
  const interval = inputs.interval;
  
  if (!elPreIntervalsContainer) return;
  
  if (total <= 0 || interval <= 0 || delay > total) {
    elPreIntervalsContainer.innerHTML = '<div style="font-size: 0.85rem; color: var(--text-secondary); font-style: italic; text-align: center; padding: 1rem 0;">Adjust settings above to configure interval notes.</div>';
    return;
  }
  
  const numIntervals = Math.floor((total - delay) / interval) + 1;
  
  // Save current values to restore them
  const currentValues = [];
  elPreIntervalsContainer.querySelectorAll('.interval-text-input').forEach((input) => {
    const idx = parseInt(input.getAttribute('data-index'));
    currentValues[idx] = input.value;
  });
  
  elPreIntervalsContainer.innerHTML = '';
  
  if (numIntervals <= 0) {
    elPreIntervalsContainer.innerHTML = '<div style="font-size: 0.85rem; color: var(--text-secondary); font-style: italic; text-align: center; padding: 1rem 0;">No intervals calculated. Check your settings.</div>';
    return;
  }
  
  const title = document.createElement('div');
  title.className = 'config-section-title';
  title.textContent = `Pre-Interval Notes (${numIntervals} Signals)`;
  elPreIntervalsContainer.appendChild(title);
  
  const scrollBox = document.createElement('div');
  scrollBox.className = 'intervals-scroll-box';
  
  for (let i = 0; i < numIntervals; i++) {
    const timeOffset = delay + i * interval;
    const timeStr = formatTime(timeOffset);
    
    const row = document.createElement('div');
    row.className = 'interval-input-item';
    row.innerHTML = `
      <span class="interval-time-label">Signal #${i+1} (${timeStr} elapsed)</span>
      <div class="interval-input-row">
        <input type="text" class="interval-text-input" placeholder="Read aloud and log at signal..." data-index="${i}">
        <button type="button" class="interval-mic-btn" aria-label="Record voice note" data-index="${i}">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="22" />
          </svg>
        </button>
      </div>
    `;
    
    // Restore value
    const input = row.querySelector('.interval-text-input');
    if (currentValues[i] !== undefined) {
      input.value = currentValues[i];
    }
    
    scrollBox.appendChild(row);
  }
  
  elPreIntervalsContainer.appendChild(scrollBox);
  
  // Wire dynamic button listeners
  scrollBox.querySelectorAll('.interval-mic-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-index'));
      startConfigurationMic(idx, btn);
    });
  });
}

function startConfigurationMic(index, buttonElement) {
  if (!recognition) {
    alert("Speech recognition is not supported in this browser.");
    return;
  }
  
  initAudio();
  
  if (isListening) {
    if (activeConfigMicIndex === index) {
      stopConfigurationMic();
      return;
    }
    stopConfigurationMic();
  }
  
  activeConfigMicIndex = index;
  activeConfigMicBtn = buttonElement;
  activeConfigMicBtn.classList.add('recording');
  
  try {
    recognition.start();
  } catch (err) {
    console.error("Mic start failed", err);
  }
}

function stopConfigurationMic() {
  if (activeConfigMicBtn) {
    activeConfigMicBtn.classList.remove('recording');
  }
  activeConfigMicIndex = null;
  activeConfigMicBtn = null;
  isListening = false;
  try {
    recognition.stop();
  } catch (err) {}
}

function getPreConfiguredNotes() {
  const notes = [];
  if (elPreIntervalsContainer) {
    const inputs = elPreIntervalsContainer.querySelectorAll('.interval-text-input');
    inputs.forEach(input => {
      const idx = parseInt(input.getAttribute('data-index'));
      notes[idx] = input.value;
    });
  }
  return notes;
}

// Active session interval navigation controls
function jumpToNextInterval() {
  const inputs = getInputsInSeconds();
  const total = inputs.total;
  const delay = inputs.delay;
  const interval = inputs.interval;
  
  if (secondsElapsed >= total) return;
  
  let targetElapsed;
  if (secondsElapsed < delay) {
    targetElapsed = delay;
  } else {
    const k = Math.floor((secondsElapsed - delay) / interval);
    targetElapsed = delay + (k + 1) * interval;
  }
  
  if (targetElapsed > total) {
    targetElapsed = total;
  }
  
  const diff = targetElapsed - secondsElapsed;
  secondsRemaining -= diff;
  secondsElapsed = targetElapsed;
  
  appendLog("Command: Skip Forward", `Jumped to ${formatTime(secondsElapsed)} elapsed`);
  checkIntervals();
  updateTimerUI();
}

function jumpToPreviousInterval() {
  const inputs = getInputsInSeconds();
  const delay = inputs.delay;
  const interval = inputs.interval;
  
  if (secondsElapsed <= 0) return;
  
  let targetElapsed;
  if (secondsElapsed <= delay) {
    targetElapsed = 0;
  } else {
    const elapsedSinceDelay = secondsElapsed - delay;
    const k = Math.floor(elapsedSinceDelay / interval);
    const remainder = elapsedSinceDelay % interval;
    
    if (remainder === 0) {
      targetElapsed = delay + (k - 1) * interval;
    } else {
      targetElapsed = delay + k * interval;
    }
  }
  
  if (targetElapsed < 0) targetElapsed = 0;
  
  const diff = secondsElapsed - targetElapsed;
  secondsRemaining += diff;
  secondsElapsed = targetElapsed;
  
  // Set lastIntervalFiredSeconds back so it can trigger again when reaching the boundary
  if (secondsElapsed < delay) {
    lastIntervalFiredSeconds = null;
  } else {
    lastIntervalFiredSeconds = secondsElapsed - interval;
  }
  
  appendLog("Command: Jump Back", `Jumping back to ${formatTime(secondsElapsed)} elapsed`);
  updateTimerUI();
}

