#!/usr/bin/env python3
import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BINARY = ROOT / "engine2048.exe"
PRESETS_FILE = ROOT / "configs" / "presets.json"

WEIGHT_FLAGS = {
    "lost_penalty": "--lost-penalty",
    "monotonicity_power": "--mono-power",
    "monotonicity_weight": "--mono-weight",
    "sum_power": "--sum-power",
    "sum_weight": "--sum-weight",
    "merges_weight": "--merges-weight",
    "empty_weight": "--empty-weight",
    "corner_weight": "--corner-weight",
}

SUMMARY_RE = re.compile(
    r"avg_score=(?P<avg_score>[\d.]+) avg_max_tile=(?P<avg_max_tile>[\d.]+) "
    r"win_rate_2048=(?P<win_rate>[\d.]+)%.*?"
    r"total_time=(?P<total_time>[\d.]+)s avg_time_per_game=(?P<avg_time>[\d.]+)s.*?"
    r"total_moves_evaled=(?P<evaled>\d+) total_cache_hits=(?P<hits>\d+) cache_hit_rate=(?P<hit_rate>[\d.]+)%.*?"
    r"tt_capacity=(?P<tt_cap>\d+) tt_stores=(?P<tt_stores>\d+)",
    re.DOTALL,
)


def build_command(preset_name, preset, games, seed):
    cmd = [str(BINARY), "--games", str(games), "--seed", str(seed)]
    cmd += ["--tt-bits", str(preset.get("tt_bits", 22))]
    cmd += ["--cache-depth-limit", str(preset.get("cache_depth_limit", 15))]
    cmd += ["--min-depth", str(preset.get("min_depth", 3))]
    cmd += ["--depth-bias", str(preset.get("depth_bias", 2))]
    cmd += ["--max-depth", str(preset.get("max_depth", 8))]
    if preset.get("no_cache"):
        cmd.append("--no-cache")
    for key, flag in WEIGHT_FLAGS.items():
        if key in preset.get("weights", {}):
            cmd += [flag, str(preset["weights"][key])]
    return cmd


def run_preset(preset_name, preset, games, seed, timeout):
    cmd = build_command(preset_name, preset, games, seed)
    print(f"\n=== {preset_name} ===")
    print(f"  {preset.get('description', '')}")
    print(f"  cmd: {' '.join(cmd)}")

    start = time.time()
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        print(f"  TIMEOUT after {timeout}s — reduce --games or lower this preset's max_depth")
        return {"preset": preset_name, "error": "timeout"}
    wall = time.time() - start

    if result.returncode != 0:
        print(f"  ERROR (exit {result.returncode}): {result.stderr[-500:]}")
        return {"preset": preset_name, "error": "nonzero_exit", "stderr": result.stderr[-500:]}

    match = SUMMARY_RE.search(result.stdout)
    if not match:
        print("  Could not parse output:")
        print(result.stdout[-500:])
        return {"preset": preset_name, "error": "parse_failed", "raw": result.stdout}

    data = match.groupdict()
    data = {k: float(v) if "." in v else int(v) for k, v in data.items()}
    data["preset"] = preset_name
    data["wall_seconds"] = round(wall, 2)

    print(f"  avg_score={data['avg_score']:.0f}  avg_max_tile={data['avg_max_tile']:.0f}  "
          f"win_rate_2048={data['win_rate']:.1f}%  avg_time/game={data['avg_time']:.3f}s  "
          f"cache_hit_rate={data['hit_rate']:.1f}%  wall={wall:.1f}s")
    return data


def main():
    parser = argparse.ArgumentParser(description="Run 2048 engine benchmark presets")
    parser.add_argument("--presets", nargs="*", default=None,
                         help="Subset of preset names to run (default: all)")
    parser.add_argument("--games", type=int, default=5, help="Games per preset")
    parser.add_argument("--seed", type=int, default=1, help="Base RNG seed")
    parser.add_argument("--timeout", type=int, default=1800,
                         help="Per-preset timeout in seconds (games can run 500-2000+ moves each; "
                              "default is generous, lower only if you reduce --games)")
    parser.add_argument("--out", default=None, help="Write JSON results to this file")
    args = parser.parse_args()

    if not BINARY.exists():
        print(f"Binary not found at {BINARY}. Run scripts/build.sh first.", file=sys.stderr)
        sys.exit(1)

    presets = json.loads(PRESETS_FILE.read_text())
    names = args.presets if args.presets else list(presets.keys())

    results = []
    for name in names:
        if name not in presets:
            print(f"Unknown preset: {name}", file=sys.stderr)
            continue
        results.append(run_preset(name, presets[name], args.games, args.seed, args.timeout))

    print("\n\n=== Comparison table ===")
    header = f"{'preset':<24}{'avg_score':>12}{'avg_tile':>10}{'win%':>8}{'s/move avg':>12}{'hit%':>8}{'wall_s':>10}"
    print(header)
    print("-" * len(header))
    for r in results:
        if "error" in r:
            print(f"{r['preset']:<24}{'ERROR: ' + r['error']:>12}")
            continue
        print(f"{r['preset']:<24}{r['avg_score']:>12.0f}{r['avg_max_tile']:>10.0f}"
              f"{r['win_rate']:>8.1f}{r['avg_time']:>12.3f}{r['hit_rate']:>8.1f}{r['wall_seconds']:>10.1f}")

    if args.out:
        Path(args.out).write_text(json.dumps(results, indent=2))
        print(f"\nWrote results to {args.out}")


if __name__ == "__main__":
    main()
