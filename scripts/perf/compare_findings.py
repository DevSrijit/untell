"""Compares the detector's output of two check runs of one film: the findings, and the capture they read.

Usage: python3 scripts/perf/compare_findings.py <findings A.json> <findings B.json> [<capture A.json> <capture B.json>]
The findings must be the same list (same checks, times, nodes, measures). The capture must hold the same nodes,
ink and shapes, frame by frame. It prints what differs and exits 1 when anything does.
"""
import json
import sys


def load(p):
    with open(p) as f:
        d = json.load(f)
    return d[0] if isinstance(d, list) else d


a, b = load(sys.argv[1]), load(sys.argv[2])
key = lambda f: json.dumps(f, sort_keys=True)  # noqa: E731
fa, fb = sorted(map(key, a["findings"])), sorted(map(key, b["findings"]))
ok = fa == fb and a.get("skipped") == b.get("skipped")
print(f"findings: {len(fa)} vs {len(fb)}, {'equal' if fa == fb else 'DIFFERENT'}; skipped {'equal' if a.get('skipped') == b.get('skipped') else 'DIFFERENT'}")
if fa != fb:
    for x in sorted(set(fa) ^ set(fb))[:6]:
        print("  only in", "A" if x in fa else "B", x[:300])
if len(sys.argv) > 4:
    ca, cb = load(sys.argv[3]), load(sys.argv[4])
    for part in ("nodes", "ink"):
        same = json.dumps(ca.get(part)) == json.dumps(cb.get(part))
        ok &= same
        if not same and part == "ink":
            bad = [i for i, (x, y) in enumerate(zip(ca["ink"], cb["ink"])) if json.dumps(x) != json.dumps(y)]
            print(f"capture ink: {len(bad)} frame(s) differ, first {bad[:5]}")
        else:
            print(f"capture {part}: {'equal' if same else 'DIFFERENT'}")
    same = json.dumps(ca.get("shapes")) == json.dumps(cb.get("shapes"))
    ok &= same
    print(f"capture shapes: {'equal' if same else 'DIFFERENT'}")
print("SAME" if ok else "DIFFERENT")
sys.exit(0 if ok else 1)
