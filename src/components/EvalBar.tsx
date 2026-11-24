import { winningChances, type EvalResult } from '../lib/engine';
import { formatEval } from '../lib/format';

interface Props {
  evaluation?: EvalResult;
  orientation: 'white' | 'black';
}

export function EvalBar({ evaluation, orientation }: Props) {
  const pv = evaluation?.pvs[0];
  const whiteShare = 50 + 50 * winningChances(pv);
  const whiteAhead = whiteShare >= 50;
  const label = pv ? formatEval(pv).replace(/^[+−]/, '') : '';
  return (
    <div className={`eval-bar ${orientation === 'black' ? 'flipped' : ''}`} role="img" aria-label={pv ? formatEval(pv) : ''}>
      <div className="eval-white" style={{ height: `${whiteShare}%` }} />
      {label && <span className={`eval-num ${whiteAhead ? 'on-white' : 'on-black'}`}>{label}</span>}
    </div>
  );
}
