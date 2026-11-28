#!/bin/sh
# Prüfbefehl: die Testsuite des Forks. Setzt eine Installation mit dem
# festgeschriebenen Stand voraus (pnpm install --frozen-lockfile); mit npm
# entsteht ein anderer Abhängigkeitsbaum und Tests schlagen scheinbar fehl.
set -e
cd "$(dirname "$0")"
exec pnpm test
