"""Export the saved model grids and player contact from an executed notebook."""
import argparse
import base64
import gzip
import html
import json
import re
from pathlib import Path


def write_json(path, value, compressed=False):
    raw = json.dumps(value, separators=(',', ':'), ensure_ascii=False)
    if compressed:
        raw = json.dumps(base64.b64encode(gzip.compress(raw.encode(), mtime=0)).decode())
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(raw, encoding='utf-8')


def export(notebook, destination):
    contents = json.loads(notebook.read_text(encoding='utf-8'))
    for cell in reversed(contents['cells']):
        for output in cell.get('outputs', []):
            frame = ''.join(output.get('data', {}).get('text/html', []))
            match = re.search(r'srcdoc="(.*?)"></iframe>', frame, re.S)
            if not match:
                continue
            document = html.unescape(match.group(1))
            payload = re.search(r'const CONTACT_PAYLOAD=(.*?);\n', document, re.S)
            if payload:
                grids, records, report = json.loads(payload.group(1))
                break
        else:
            continue
        break
    else:
        raise ValueError('No saved explorer data found. Execute the notebook and save its output first.')

    destination.mkdir(parents=True, exist_ok=True)
    write_json(destination / 'grid.json', grids, compressed=True)
    summaries = [{key: value for key, value in player.items() if key != 'balls'} for player in records]
    for year in sorted({player['year'] for player in summaries}):
        season = [(summary, record) for summary, record in zip(summaries, records) if summary['year'] == year]
        for start in range(0, len(season), 50):
            name = f'contacts-{year}-{start // 50}.json'
            chunk = season[start:start + 50]
            write_json(destination / name, {str(record['id']): record['balls'] for _, record in chunk}, compressed=True)
            for summary, _ in chunk:
                summary['chunk'] = name
    write_json(destination / 'players.json', summaries)
    write_json(destination / 'summary.json', {key: report[key] for key in ['audit', 'source', 'test_coverage']})
    print(f'Exported {len(records):,} player seasons to {destination}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('notebook', type=Path)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'data')
    arguments = parser.parse_args()
    export(arguments.notebook, arguments.output)
