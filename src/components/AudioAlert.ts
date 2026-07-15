/**
 * A zero-dependency audio alert utility using Web Audio API.
 * Handles the instant new-order chime and the urgent continuous alert alarm.
 */

// Global singletons for the continuous alarm and shared context
let alarmInterval: any = null;
let sharedAudioCtx: AudioContext | null = null;

/**
 * Retrieves or initializes the shared, authorized AudioContext.
 */
export function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioContextClass();
  }

  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }

  return sharedAudioCtx;
}

/**
 * Pre-warms and resumes the shared context on initial page interaction.
 */
export function initSharedAudio() {
  try {
    const ctx = getSharedAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  } catch (e) {
    // Ignore
  }
}

/**
 * Plays a quick, premium dual chime bell sound for new orders.
 */
export function playOrderChime() {
  try {
    const ctx = getSharedAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    
    // First bell tone (higher pitch)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
    gain1.gain.setValueAtTime(0.3, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    
    // Second bell tone (lower harmonic, slightly staggered)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5 note
    gain2.gain.setValueAtTime(0, ctx.currentTime);
    gain2.gain.setValueAtTime(0.2, ctx.currentTime + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
    
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    
    // Start and stop
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.8);
    
    osc2.start(ctx.currentTime + 0.1);
    osc2.stop(ctx.currentTime + 1.2);
  } catch (error) {
    console.warn('Audio feedback failed or was blocked by browser autoplay policy:', error);
  }
}

/**
 * Starts a loud, high-pitched continuous alarm beep loop that plays until stopped.
 */
export function startContinuousAlarm(ringtoneType: string = 'high-pitch') {
  if (alarmInterval) {
    stopContinuousAlarm();
  }

  try {
    const ctx = getSharedAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const playBeep = () => {
      const activeCtx = getSharedAudioContext();
      if (!activeCtx) return;
      
      // Ensure the audio context is active (handling browser autoplay policies)
      if (activeCtx.state === 'suspended') {
        activeCtx.resume().catch(() => {});
      }
      
      const osc = activeCtx.createOscillator();
      const gain = activeCtx.createGain();
      
      if (ringtoneType === 'classic-digital') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(2048, activeCtx.currentTime); // Standard digital alarm freq
        gain.gain.setValueAtTime(0.25, activeCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, activeCtx.currentTime + 0.12);
        osc.connect(gain);
        gain.connect(activeCtx.destination);
        osc.start(activeCtx.currentTime);
        osc.stop(activeCtx.currentTime + 0.15);
      } else if (ringtoneType === 'bell-chime') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, activeCtx.currentTime); // A5 note
        gain.gain.setValueAtTime(0.3, activeCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, activeCtx.currentTime + 0.7);
        osc.connect(gain);
        gain.connect(activeCtx.destination);
        osc.start(activeCtx.currentTime);
        osc.stop(activeCtx.currentTime + 0.8);
      } else if (ringtoneType === 'soft-synth') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, activeCtx.currentTime); // C5 note
        gain.gain.setValueAtTime(0.35, activeCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, activeCtx.currentTime + 0.38);
        osc.connect(gain);
        gain.connect(activeCtx.destination);
        osc.start(activeCtx.currentTime);
        osc.stop(activeCtx.currentTime + 0.4);
      } else {
        // Default high-pitch sawtooth
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(1400, activeCtx.currentTime);
        gain.gain.setValueAtTime(0.35, activeCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, activeCtx.currentTime + 0.28);
        osc.connect(gain);
        gain.connect(activeCtx.destination);
        osc.start(activeCtx.currentTime);
        osc.stop(activeCtx.currentTime + 0.3);
      }
    };

    // Determine repeating interval based on sound profile
    let beepInterval = 350;
    if (ringtoneType === 'classic-digital') beepInterval = 500;
    else if (ringtoneType === 'bell-chime') beepInterval = 1200;
    else if (ringtoneType === 'soft-synth') beepInterval = 700;

    // Play immediately, then repeat
    playBeep();
    alarmInterval = setInterval(playBeep, beepInterval);
  } catch (error) {
    console.warn('Failed to start continuous alarm:', error);
  }
}

/**
 * Stops the continuous alarm completely.
 */
export function stopContinuousAlarm() {
  if (alarmInterval) {
    clearInterval(alarmInterval);
    alarmInterval = null;
  }
}
