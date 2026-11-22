"""Prints a before/after Markdown table from two bench results, with the load at the start of each film's run.

Usage: python3 scripts/perf/pair_table.py <before label> <after label> <log file with the bench lines>
A load under 10 (on this 10-core Mac) is "quiet"; above it, "under load".
"""
import json
import re
import sys

before, after, logf = sys.argv[1:4]
loads = {}
for line in open(logf):
    m = re.match(r"^(\S+): (\w+) .*load ([\d.]+)", line)
    if m:
        loads[(m.group(1), m.group(2))] = float(m.group(3))
R = lambda l: {r["film"]: r for r in json.load(open(f"out/perf/results/{l}.json"))["runs"]}  # noqa: E731
b, a = R(before), R(after)
q = lambda x: "?" if x is None else f"{'quiet' if x < 10 else 'under load'} {x:.1f}"  # noqa: E731
print("| Film | Before wall / CPU / peak | Load | After wall / CPU / peak | Load | Wall | CPU |")
print("| --- | --- | --- | --- | --- | --- | --- |")
for film in b:
    if film not in a:
        continue
    x, y = b[film], a[film]
    print(f"| {film} | {x['wall']:.1f} s / {x['cpu']:.1f} s / {x['peakMB']:.0f} MB | {q(loads.get((before, film)))} | "
          f"{y['wall']:.1f} s / {y['cpu']:.1f} s / {y['peakMB']:.0f} MB | {q(loads.get((after, film)))} | {x['wall'] / y['wall']:.1f}x | {x['cpu'] / y['cpu']:.1f}x |")
