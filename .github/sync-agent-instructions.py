#!/usr/bin/env python3
"""Generate Claude's startup instructions from the shared source, or check drift."""
import argparse
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
header = (
    b'<!-- Generated from AGENTS.md; do not edit directly.\n'
    b'Regenerate: python3 .github/sync-agent-instructions.py --write\n'
    b'A full copy keeps Claude startup instructions available from subdirectories. -->\n\n'
)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--write', action='store_true', help='Regenerate CLAUDE.md')
args = parser.parse_args()
source = root / 'AGENTS.md'
target = root / 'CLAUDE.md'
if source.is_symlink() or target.is_symlink():
    sys.exit('AGENTS.md and CLAUDE.md must be regular files, not symlinks.')
expected = header + source.read_bytes()
if args.write:
    target.write_bytes(expected)
    print('Generated CLAUDE.md from AGENTS.md.')
elif not target.is_file() or target.read_bytes() != expected:
    sys.exit('CLAUDE.md is out of sync. Run: python3 .github/sync-agent-instructions.py --write')
else:
    print('CLAUDE.md matches AGENTS.md.')
