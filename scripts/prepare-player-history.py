"""Reproduce small, player-filtered corpora from Lichess's licensed broadcasts.

    python3 scripts/prepare-player-history.py                  the 2026 corpus, data/player-history/
    python3 scripts/prepare-player-history.py --archive-months which archive each 2026 game came from
    python3 scripts/prepare-player-history.py --earlier        January 2020 to December 2025, data/player-history/earlier/

The 2026 corpus keeps every game of the two players, at any time control,
and applies no analysis or player-model assumptions: original clock tags and
dates are retained so the trainer can select classical games explicitly.

The earlier corpus is much larger at the source, so it keeps only what the
trainer can use: standard chess from the initial position whose first clock
readings show a classical game (the trainer's own rule, applied again
there). Everything left out is counted by reason in its manifest. Each kept
game is the original PGN text with one tag added after `Event`: `Archive`,
the month of the archive it came from, because many of these games carry no
usable date.

The 2026 corpus carries no such tag and is not changed. Its archive months
are written beside it, in archive-months.json, keyed by GameURL.

Needs Python 3, curl and zstd. Archives are cached in .cache/player-history/.
"""
import collections
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.cache/player-history'
CACHE.mkdir(parents=True, exist_ok=True)
PLAYERS = {'46616543': 'Gukesh D', '14205483': 'Sindarov, Javokhir'}
SOURCE = {'source': 'Lichess official broadcasts', 'sourcePage': 'https://database.lichess.org/#broadcasts', 'license': 'CC-BY-SA-4.0', 'licenseURL': 'https://creativecommons.org/licenses/by-sa/4.0/'}
# The trainer's classical rule: the larger of the first two clock readings is at least this many seconds.
CLASSICAL_SECONDS = 45 * 60
NAME = re.compile(r'gukesh|sindarov', re.I)


def archive_of(period, max_time, retries):
    """The cached archive of one month, downloaded if it is not there yet, and its URL."""
    url = f'https://database.lichess.org/broadcast/lichess_db_broadcast_{period}.pgn.zst'
    archive = CACHE / f'history-{period}.pgn.zst'
    if not archive.exists():
        part = archive.with_suffix('.part')
        subprocess.run(['curl', '--fail', '--silent', '--show-error', '--max-time', str(max_time), '--retry', str(retries), url, '-o', str(part)], check=True)
        part.rename(archive)
    return archive, url


def games_of(archive, period):
    """Every game of an archive as raw text, in the archive's order."""
    unpack = subprocess.Popen(['zstd', '-dc', str(archive)], stdout=subprocess.PIPE, text=True, encoding='utf-8')
    current = []
    for line in unpack.stdout:
        if line.startswith('[Event ') and current:
            yield ''.join(current).strip()
            current = []
        current.append(line)
    if current:
        yield ''.join(current).strip()
    if unpack.wait() != 0:
        raise RuntimeError(f'decompression failed: {period}')


def headers_of(raw):
    return dict(re.findall(r'^\[(\w+) "(.*)"\]$', raw, re.M))


def moves_of(raw):
    """The movetext without comments, annotation marks and spaces: what makes two copies the same game."""
    body = re.split(r'\n\s*\n', raw, maxsplit=1)[-1]
    return re.sub(r'\{[^}]*\}|\$\d+|\s+', '', body)


def original_games():
    """The games of the 2026 corpus in its order, each with its archive month, and the sources they came from."""
    sources, games, seen = [], [], set()
    for month in range(1, 11):
        period = f'2026-{month:02d}'
        archive, url = archive_of(period, 120, 1)
        before = len(games)
        for raw in games_of(archive, period):
            headers = headers_of(raw)
            ids = {headers.get('WhiteFideId'), headers.get('BlackFideId')}
            if not ids.intersection(PLAYERS):
                continue
            date = headers.get('Date', '')
            if not re.fullmatch(r'2026\.\d{2}\.\d{2}', date) or date >= '2026.11.01':
                continue
            key = '|'.join([date, headers.get('WhiteFideId', headers.get('White', '')), headers.get('BlackFideId', headers.get('Black', '')), moves_of(raw)])
            digest = hashlib.sha256(key.encode()).hexdigest()
            if digest in seen:
                continue
            seen.add(digest)
            games.append((period, raw, headers))
        sources.append({'month': period, 'url': url, 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'selectedUniqueGames': len(games) - before})
        print(f'{period}: {len(games)-before} selected; total {len(games)}', flush=True)
    return games, sources


def original():
    """The 2026 corpus, exactly as first published."""
    out = ROOT / 'data/player-history'
    out.mkdir(parents=True, exist_ok=True)
    selected, sources = original_games()
    games = [raw for _, raw, _ in selected]
    counts = collections.Counter()
    for _, _, headers in selected:
        for player in {headers.get('WhiteFideId'), headers.get('BlackFideId')}.intersection(PLAYERS):
            counts[player] += 1
    corpus = '\n\n\n'.join(games) + '\n'
    (out / 'games.pgn').write_text(corpus)
    (out / 'manifest.json').write_text(json.dumps({**SOURCE, 'modifications': 'Filtered by exact FIDE IDs, valid 2026 dates before November, and duplicate game removal; original PGN retained. Includes mixed time controls; trainer must filter and report its selection.', 'players': PLAYERS, 'games': len(games), 'gamesByPlayer': dict(sorted(counts.items())), 'corpusSha256': hashlib.sha256(corpus.encode()).hexdigest(), 'sources': sources}, indent=2) + '\n')
    print(json.dumps({'games': len(games), 'counts': dict(sorted(counts.items())), 'bytes': len(corpus.encode())}), flush=True)


def archive_months():
    """For each game of the 2026 corpus, the month of the archive it came from. The corpus itself is not touched."""
    out = ROOT / 'data/player-history'
    selected, sources = original_games()
    months = {}
    for period, _, headers in selected:
        url = headers.get('GameURL')
        if not url or url in months:
            raise RuntimeError(f'a game without a GameURL of its own in {period}')
        months[url] = period
    corpus = '\n\n\n'.join(raw for _, raw, _ in selected) + '\n'
    (out / 'archive-months.json').write_text(json.dumps({
        'about': 'The month of the Lichess archive each game of games.pgn came from, by GameURL. A game is in the archive of the month its round was played; its Date tag is sometimes the first day of the tournament instead.',
        'corpusSha256': hashlib.sha256(corpus.encode()).hexdigest(),
        'archives': {s['month']: s['sha256'] for s in sources},
        'months': months,
    }, indent=1) + '\n')
    print(json.dumps({'games': len(months), 'byMonth': dict(sorted(collections.Counter(months.values()).items()))}), flush=True)


def seconds(clock):
    h, m, s = clock.split(':')
    return int(h) * 3600 + int(m) * 60 + float(s)


def first_clocks(raw):
    """The clock readings written with the first move of each side, in seconds."""
    body = re.split(r'\n\s*\n', raw, maxsplit=1)[-1]
    opening = re.split(r'\s2\.\s', body, maxsplit=1)[0]
    return [seconds(c) for c in re.findall(r'\[%clk (\d+:\d{1,2}:\d{1,2}(?:\.\d+)?)\]', opening)[:2]]


def earlier():
    """Classical games of the two players before 2026, from every archive there is."""
    out = ROOT / 'data/player-history/earlier'
    out.mkdir(parents=True, exist_ok=True)
    periods = [f'{year}-{month:02d}' for year in range(2020, 2026) for month in range(1, 13)]
    reasons = ['another variant or a set-up starting position', 'no clock readings with the first moves', 'faster than classical by its first clock readings', 'the same game twice']
    sources, games, seen = [], [], set()
    by_player = collections.Counter()
    for period in periods:
        archive, url = archive_of(period, 900, 3)
        row = {'month': period, 'url': url, 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'games': 0, 'gamesWithAFideId': 0, 'matchedByFideId': 0, 'nameWithoutMatchingFideId': 0, 'kept': 0, 'leftOut': {}}
        for raw in games_of(archive, period):
            headers = headers_of(raw)
            row['games'] += 1
            ids = {headers.get('WhiteFideId'), headers.get('BlackFideId')}
            if headers.get('WhiteFideId') or headers.get('BlackFideId'):
                row['gamesWithAFideId'] += 1
            if not ids.intersection(PLAYERS):
                # counted, never used: a name alone does not identify a player
                if NAME.search(headers.get('White', '') + '|' + headers.get('Black', '')):
                    row['nameWithoutMatchingFideId'] += 1
                continue
            row['matchedByFideId'] += 1
            clocks = first_clocks(raw)
            if headers.get('Variant', 'Standard') != 'Standard' or headers.get('FEN') or headers.get('SetUp') == '1':
                reason = reasons[0]
            elif not clocks:
                reason = reasons[1]
            elif max(clocks) < CLASSICAL_SECONDS:
                reason = reasons[2]
            else:
                key = '|'.join([headers.get('WhiteFideId', ''), headers.get('BlackFideId', ''), moves_of(raw)])
                digest = hashlib.sha256(key.encode()).hexdigest()
                reason = reasons[3] if digest in seen else None
                seen.add(digest)
            if reason:
                row['leftOut'][reason] = row['leftOut'].get(reason, 0) + 1
                continue
            row['kept'] += 1
            for player in ids.intersection(PLAYERS):
                by_player[player] += 1
            event, rest = raw.split('\n', 1)
            games.append(f'{event}\n[Archive "{period}"]\n{rest}')
        sources.append(row)
        print(f"{period}: {row['matchedByFideId']} matched, {row['kept']} kept; total {len(games)}", flush=True)

    corpus = '\n\n\n'.join(games) + '\n'
    (out / 'games.pgn').write_text(corpus)
    total = lambda field: sum(s[field] for s in sources)
    left_out = collections.Counter()
    for s in sources:
        left_out.update(s['leftOut'])
    manifest = {
        **SOURCE,
        'period': 'January 2020 to December 2025, every monthly archive',
        'modifications': 'Filtered by exact FIDE IDs; kept only standard chess from the initial position whose first clock readings are at least 45 minutes; duplicate games removed (same white ID, black ID and moves). Original PGN text retained, with one tag added after Event: Archive, the month of the source archive.',
        'players': PLAYERS,
        'games': len(games),
        'gamesByPlayer': dict(sorted(by_player.items())),
        'matchedByFideId': total('matchedByFideId'),
        'leftOut': {reason: left_out[reason] for reason in reasons if left_out[reason]},
        'nameWithoutMatchingFideId': total('nameWithoutMatchingFideId'),
        'nameWithoutMatchingFideIdNote': 'Games whose White or Black tag contains "Gukesh" or "Sindarov" but which carry neither FIDE ID. Counted only, never used: no game before 2023 carries either of the two IDs (few broadcasts carried FIDE IDs at all then), and a name does not tell one Sindarov from another.',
        'corpusSha256': hashlib.sha256(corpus.encode()).hexdigest(),
        'sources': sources,
    }
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({'games': len(games), 'counts': dict(sorted(by_player.items())), 'leftOut': manifest['leftOut'], 'bytes': len(corpus.encode())}), flush=True)


if __name__ == '__main__':
    if sys.argv[1:] == ['--earlier']:
        earlier()
    elif sys.argv[1:] == ['--archive-months']:
        archive_months()
    elif not sys.argv[1:]:
        original()
    else:
        sys.exit(__doc__)
