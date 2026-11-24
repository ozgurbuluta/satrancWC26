// Short synthesised "wood knock" so the site ships no audio assets.

let ctx: AudioContext | undefined;

const getCtx = (): AudioContext | undefined => {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return undefined;
  }
};

/** Browsers only allow audio after a user gesture; call this from the first tap or key press. */
export const unlockAudio = () => {
  getCtx();
};

export const playMove = (capture: boolean) => {
  const ac = getCtx();
  if (!ac || ac.state !== 'running') return;
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(capture ? 260 : 190, t);
  osc.frequency.exponentialRampToValueAtTime(capture ? 110 : 90, t + 0.07);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(capture ? 0.5 : 0.35, t + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + (capture ? 0.14 : 0.09));
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.16);
};
