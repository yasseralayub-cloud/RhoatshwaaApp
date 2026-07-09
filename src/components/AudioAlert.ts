/**
 * A zero-dependency audio alert utility using Web Audio API.
 * Synthesizes a high-end dual chime bell sound when new orders arrive.
 */
export function playOrderChime() {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;

    const ctx = new AudioContext();
    
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
