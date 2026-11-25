"""How games ended from positions with a given engine evaluation.

    python3 scripts/prepare-eval-outcomes.py

Reads every monthly archive of the Lichess broadcast database (the same
cached files as prepare-player-history.py) and counts, for classical games
between two strong players, how the game ended from each evaluated position:
White won, draw, Black won, by the evaluation Lichess's analysis gave the
position. Writes data/eval-outcomes/counts.json: counts only, no games.

A game is counted when
- it is standard chess from the initial position;
- both players are rated 2600 or more in the game's own tags;
- its first clock readings show a classical game (45 minutes or more, the
  rule the predictor uses);
- it has a result and at least 20 evaluated positions;
- it has not been counted already (same players and moves).

Evaluations are from White's side, in pawns, as the archive has them after
each move. They are grouped in steps of a quarter of a pawn up to ten pawns
either way; forced mates are counted apart. Games of 2026 are kept apart
from earlier ones, so that a curve fitted on the earlier games can be
checked on later ones.
"""
import collections
import hashlib
import importlib.util
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('history', ROOT / 'scripts/prepare-player-history.py')
history = importlib.util.module_from_spec(spec)
spec.loader.exec_module(history)

OUT = ROOT / 'data/eval-outcomes'
MIN_RATING = 2600
MIN_EVALS = 20
STEP = 25  # centipawns
LIMIT = 1000
RESULT = {'1-0': 0, '1/2-1/2': 1, '0-1': 2}
EVAL = re.compile(r'\[%eval (#?-?\d+(?:\.\d+)?)\]')


def bucket(text):
    """The group an evaluation belongs to: a multiple of STEP centipawns within the limit, or a forced mate for one side."""
    if text.startswith('#'):
        return 'mateWhite' if not text.startswith('#-') else 'mateBlack'
    cp = max(-LIMIT, min(LIMIT, round(float(text) * 100)))
    return str(int(round(cp / STEP)) * STEP)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    periods = [f'{year}-{month:02d}' for year in range(2020, 2027) for month in range(1, 13) if (year, month) <= (2026, 10)]
    counts = {'earlier': collections.defaultdict(lambda: [0, 0, 0]), '2026': collections.defaultdict(lambda: [0, 0, 0])}
    games = {'earlier': [0, 0, 0], '2026': [0, 0, 0]}
    seen = set()
    sources = []
    for period in periods:
        archive, url = history.archive_of(period, 900, 3)
        part = '2026' if period.startswith('2026') else 'earlier'
        selected = 0
        for raw in history.games_of(archive, period):
            headers = history.headers_of(raw)
            result = RESULT.get(headers.get('Result'))
            if result is None:
                continue
            try:
                if int(headers.get('WhiteElo', '0')) < MIN_RATING or int(headers.get('BlackElo', '0')) < MIN_RATING:
                    continue
            except ValueError:
                continue
            if headers.get('Variant', 'Standard') != 'Standard' or headers.get('FEN') or headers.get('SetUp') == '1':
                continue
            clocks = history.first_clocks(raw)
            if not clocks or max(clocks) < history.CLASSICAL_SECONDS:
                continue
            body = re.split(r'\n\s*\n', raw, maxsplit=1)[-1]
            evals = EVAL.findall(body)
            if len(evals) < MIN_EVALS:
                continue
            key = '|'.join([headers.get('WhiteFideId') or headers.get('White', ''), headers.get('BlackFideId') or headers.get('Black', ''), history.moves_of(raw)])
            digest = hashlib.sha256(key.encode()).hexdigest()
            if digest in seen:
                continue
            seen.add(digest)
            selected += 1
            games[part][result] += 1
            for text in evals:
                counts[part][bucket(text)][result] += 1
        sources.append({'month': period, 'url': url, 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'games': selected})
        print(f"{period}: {selected} games; total {sum(games['earlier']) + sum(games['2026'])}", flush=True)

    order = lambda key: (0, 0) if key == 'mateBlack' else (2, 0) if key == 'mateWhite' else (1, int(key))
    out = {
        **history.SOURCE,
        'about': 'For classical games between two players rated 2600 or more: how the game ended (White won, draw, Black won) from positions with a given evaluation. Counts only. Evaluations are from the archive, from White\'s side, grouped by centipawns.',
        'rule': {'minimumRating': MIN_RATING, 'classicalSeconds': history.CLASSICAL_SECONDS, 'minimumEvaluations': MIN_EVALS, 'stepCentipawns': STEP, 'limitCentipawns': LIMIT},
        'games': {part: {'whiteWon': g[0], 'draw': g[1], 'blackWon': g[2]} for part, g in games.items()},
        'positions': {part: {key: counts[part][key] for key in sorted(counts[part], key=order)} for part in counts},
        'sources': sources,
    }
    (OUT / 'counts.json').write_text(json.dumps(out, indent=1) + '\n')
    print(json.dumps({'games': out['games'], 'positions': {part: sum(sum(v) for v in counts[part].values()) for part in counts}}), flush=True)


if __name__ == '__main__':
    main()
