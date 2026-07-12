/**
 * A zero-dependency audio alert utility using Web Audio API.
 * Handles the instant new-order chime and the urgent continuous alert alarm.
 */

// Global singletons for the continuous alarm
let alarmInterval: any = null;
let alarmAudioCtx: AudioContext | null = null;

/**
 * Plays a quick, premium dual chime bell sound for new orders.
 */
export function playOrderChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    
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
export function startContinuousAlarm() {
  if (alarmInterval) return; // Already ringing

  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    alarmAudioCtx = new AudioContextClass();

    const playBeep = () => {
      if (!alarmAudioCtx) return;
      
      // Ensure the audio context is active (handling browser autoplay policies)
      if (alarmAudioCtx.state === 'suspended') {
        alarmAudioCtx.resume();
      }
      
      const osc = alarmAudioCtx.createOscillator();
      const gain = alarmAudioCtx.createGain();
      
      osc.type = 'sawtooth'; // Sharp, loud and bright tone to grab attention
      osc.frequency.setValueAtTime(1400, alarmAudioCtx.currentTime); // High pitch 1400Hz
      
      gain.gain.setValueAtTime(0.4, alarmAudioCtx.currentTime); // Clear high volume
      gain.gain.exponentialRampToValueAtTime(0.01, alarmAudioCtx.currentTime + 0.28);
      
      osc.connect(gain);
      gain.connect(alarmAudioCtx.destination);
      
      osc.start(alarmAudioCtx.currentTime);
      osc.stop(alarmAudioCtx.currentTime + 0.3);
    };

    // Play immediately, then repeat every 350ms for a rapid, high-attention alarm
    playBeep();
    alarmInterval = setInterval(playBeep, 350);
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
  if (alarmAudioCtx) {
    try {
      alarmAudioCtx.close();
    } catch (e) {
      // Ignore
    }
    alarmAudioCtx = null;
  }
}
