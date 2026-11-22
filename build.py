#!/usr/bin/env python3
"""Baut dist/sol-luna-card.js aus den Dateien in src/ (alphabetische Reihenfolge)."""
import pathlib
root = pathlib.Path(__file__).parent
parts = sorted((root / 'src').glob('*.js'))
out = '\n'.join(p.read_text(encoding='utf-8').rstrip() + '\n' for p in parts)
(root / 'dist' / 'sol-luna-card.js').write_text(out, encoding='utf-8')
print(f'dist/sol-luna-card.js: {len(out.splitlines())} Zeilen aus {len(parts)} Dateien')
