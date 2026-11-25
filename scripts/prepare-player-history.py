"""Reproduce a small, player-filtered corpus from Lichess's licensed broadcasts.

No analysis or player-model assumptions are applied here. Original clock tags
and dates are retained so the trainer can select classical games explicitly.
"""
import collections
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.cache/player-history'
CACHE.mkdir(parents=True, exist_ok=True)
OUT = ROOT / 'data/player-history'
OUT.mkdir(parents=True, exist_ok=True)
PLAYERS = {'46616543': 'Gukesh D', '14205483': 'Sindarov, Javokhir'}
sources, games, seen = [], [], set()
counts = collections.Counter()
for month in range(1, 11):
    period = f'2026-{month:02d}'
    url = f'https://database.lichess.org/broadcast/lichess_db_broadcast_{period}.pgn.zst'
    archive = CACHE / f'history-{period}.pgn.zst'
    if not archive.exists():
        subprocess.run(['curl', '--fail', '--silent', '--show-error', '--max-time', '120', '--retry', '1', url, '-o', str(archive)], check=True)
    before = len(games)
    unpack = subprocess.Popen(['zstd', '-dc', str(archive)], stdout=subprocess.PIPE, text=True, encoding='utf-8')
    current = []
    def accept(lines):
        raw = ''.join(lines).strip()
        headers = dict(re.findall(r'^\[(\w+) "(.*)"\]$', raw, re.M))
        ids = {headers.get('WhiteFideId'), headers.get('BlackFideId')}
        if not ids.intersection(PLAYERS):
            return
        date = headers.get('Date', '')
        if not re.fullmatch(r'2026\.\d{2}\.\d{2}', date) or date >= '2026.11.01':
            return
        body = re.split(r'\n\s*\n', raw, maxsplit=1)[-1]
        moves = re.sub(r'\{[^}]*\}|\$\d+|\s+', '', body)
        key = '|'.join([date, headers.get('WhiteFideId', headers.get('White','')), headers.get('BlackFideId', headers.get('Black','')), moves])
        digest = hashlib.sha256(key.encode()).hexdigest()
        if digest in seen:
            return
        seen.add(digest)
        games.append(raw)
        for player in ids.intersection(PLAYERS):
            counts[player] += 1
    for line in unpack.stdout:
        if line.startswith('[Event ') and current:
            accept(current)
            current = []
        current.append(line)
    if current:
        accept(current)
    if unpack.wait() != 0:
        raise RuntimeError(f'decompression failed: {period}')
    sources.append({'month': period, 'url': url, 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'selectedUniqueGames': len(games)-before})
    print(f'{period}: {len(games)-before} selected; total {len(games)}', flush=True)

corpus = '\n\n\n'.join(games)+'\n'
(OUT/'games.pgn').write_text(corpus)
(OUT/'manifest.json').write_text(json.dumps({'source': 'Lichess official broadcasts', 'sourcePage': 'https://database.lichess.org/#broadcasts', 'license': 'CC-BY-SA-4.0', 'licenseURL': 'https://creativecommons.org/licenses/by-sa/4.0/', 'modifications': 'Filtered by exact FIDE IDs, valid 2026 dates before November, and duplicate game removal; original PGN retained. Includes mixed time controls; trainer must filter and report its selection.', 'players': PLAYERS, 'games': len(games), 'gamesByPlayer': dict(counts), 'corpusSha256': hashlib.sha256(corpus.encode()).hexdigest(), 'sources': sources}, indent=2)+'\n')
print(json.dumps({'games': len(games), 'counts': dict(counts), 'bytes': len(corpus.encode())}), flush=True)
