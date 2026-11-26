"""Games for the third version of the move predictor, from the cached Lichess broadcast archives.

    python3 scripts/prepare-v3-games.py

One pass over every monthly archive (January 2020 to October 2026, the same
cached files as prepare-player-history.py). Writes, in .cache/predictor-v3/,
one game per line as JSON:

- elite.jsonl     classical games between two players rated 2600 or more:
                  what strong players play in a position ("theory");
- faster.jsonl    the two players' own games at faster time controls, by
                  exact FIDE ID: more of their repertoire;
- knockout.jsonl  classical games of the FIDE World Cups (open and women):
                  two-game matches, where the second game is played knowing
                  the score;
- matches.jsonl   classical games of world championship matches.

Standard chess from the initial position only. "Classical" is the rule used
everywhere here: the larger of the first two clock readings is at least 45
minutes. The games themselves are not committed (they are large and can be
rebuilt); data/predictor-v3/sources.json records every archive's URL and
SHA-256 and how many games each file took from it. Source: Lichess
broadcast database, CC BY-SA 4.0.
"""
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import sys

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('history', ROOT / 'scripts/prepare-player-history.py')
history = importlib.util.module_from_spec(spec)
spec.loader.exec_module(history)

OUT = ROOT / '.cache/predictor-v3'
MIN_RATING = 2600
WORLD_CUP = re.compile(r"^FIDE (Women's )?World Cup( \d{4})?( (Open|Women's) Section)?$")
TITLE_MATCH = re.compile(r"^(FIDE )?(Women['’]s )?World (Chess )?Championship( \d{4})?$")
RESULTS = {'1-0', '0-1', '1/2-1/2'}


def moves_san(raw):
    """The moves of the main line as SAN, without comments, variations, numbers or marks."""
    body = re.split(r'\n\s*\n', raw, maxsplit=1)[-1]
    body = re.sub(r'\{[^}]*\}', ' ', body)
    while '(' in body:
        shorter = re.sub(r'\([^()]*\)', ' ', body)
        if shorter == body:
            break
        body = shorter
    tokens = re.sub(r'\$\d+|\d+\.(?:\.\.)?', ' ', body).split()
    return [re.sub(r'[!?]+$', '', t) for t in tokens if t not in ('1-0', '0-1', '1/2-1/2', '*')]


def rating(text):
    try:
        return int(text)
    except (TypeError, ValueError):
        return 0


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    periods = [f'{year}-{month:02d}' for year in range(2020, 2027) for month in range(1, 13) if (year, month) <= (2026, 10)]
    files = {name: open(OUT / f'{name}.jsonl', 'w') for name in ('elite', 'faster', 'knockout', 'matches')}
    seen = {name: set() for name in files}
    sources = []
    for period in periods:
        archive, url = history.archive_of(period, 900, 3)
        row = {'month': period, 'url': url, 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(), **{name: 0 for name in files}}
        for raw in history.games_of(archive, period):
            h = history.headers_of(raw)
            if h.get('Variant', 'Standard') != 'Standard' or h.get('FEN') or h.get('SetUp') == '1':
                continue
            clocks = history.first_clocks(raw)
            if not clocks:
                continue
            classical = max(clocks) >= history.CLASSICAL_SECONDS
            name = (h.get('BroadcastName') or h.get('Event') or '').split(' | ')[0].strip()
            ids = {h.get('WhiteFideId'), h.get('BlackFideId')}
            into = []
            if classical and rating(h.get('WhiteElo')) >= MIN_RATING and rating(h.get('BlackElo')) >= MIN_RATING and h.get('Result') in RESULTS:
                into.append('elite')
            if not classical and ids.intersection(history.PLAYERS):
                into.append('faster')
            if classical and WORLD_CUP.match(name) and h.get('Result') in RESULTS:
                into.append('knockout')
            if classical and TITLE_MATCH.match(name) and h.get('Result') in RESULTS:
                into.append('matches')
            if not into:
                continue
            moves = moves_san(raw)
            if len(moves) < 2:
                continue
            key = '|'.join([h.get('WhiteFideId') or h.get('White', ''), h.get('BlackFideId') or h.get('Black', ''), ' '.join(moves)])
            game = {
                'month': period,
                'event': name,
                'broadcast': h.get('BroadcastName', ''),
                'study': h.get('StudyName', ''),
                'round': h.get('Round', ''),
                'date': h.get('Date') or h.get('UTCDate') or '',
                'white': h.get('White', ''),
                'black': h.get('Black', ''),
                'whiteId': h.get('WhiteFideId', ''),
                'blackId': h.get('BlackFideId', ''),
                'whiteElo': rating(h.get('WhiteElo')),
                'blackElo': rating(h.get('BlackElo')),
                'result': h.get('Result', '*'),
                'clock': max(clocks),
                'url': h.get('GameURL', ''),
                'moves': ' '.join(moves),
            }
            for target in into:
                if key in seen[target]:
                    continue
                seen[target].add(key)
                files[target].write(json.dumps(game, ensure_ascii=False) + '\n')
                row[target] += 1
        sources.append(row)
        print(period, {name: len(seen[name]) for name in files}, flush=True)
    for f in files.values():
        f.close()
    out = ROOT / 'data/predictor-v3'
    out.mkdir(parents=True, exist_ok=True)
    (out / 'sources.json').write_text(json.dumps({
        **history.SOURCE,
        'about': 'Games read for the third version of the move predictor, by archive: classical games between players rated 2600 or more (elite), the two players\' faster games (faster), classical games of the FIDE World Cups (knockout) and of world championship matches (matches). The games are rebuilt by scripts/prepare-v3-games.py into .cache/predictor-v3/ and are not committed.',
        'games': {name: len(seen[name]) for name in files},
        'sources': sources,
    }, indent=1) + '\n')
    print(json.dumps({name: len(seen[name]) for name in files}), flush=True)


if __name__ == '__main__':
    main()
