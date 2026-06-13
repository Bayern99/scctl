#!/usr/bin/env python3
"""Aggregate skill-creator review results from nested multi-skill workspace."""

import json
import math
from datetime import datetime, timezone
from pathlib import Path


def calculate_stats(values: list[float]) -> dict:
    if not values:
        return {"mean": 0.0, "stddev": 0.0, "min": 0.0, "max": 0.0}
    n = len(values)
    mean = sum(values) / n
    if n > 1:
        variance = sum((x - mean) ** 2 for x in values) / (n - 1)
        stddev = math.sqrt(variance)
    else:
        stddev = 0.0
    return {
        "mean": round(mean, 4),
        "stddev": round(stddev, 4),
        "min": round(min(values), 4),
        "max": round(max(values), 4),
    }


def main():
    base = Path(__file__).parent
    runs = []
    eval_counter = 0

    eval_id_map = {}
    for skill_dir in sorted(base.iterdir()):
        if not skill_dir.is_dir() or skill_dir.name in ("scripts", "assets", "evals"):
            continue
        for eval_dir in sorted(skill_dir.iterdir()):
            if not eval_dir.is_dir():
                continue
            metadata_path = eval_dir / "eval_metadata.json"
            if not metadata_path.exists():
                continue
            metadata = json.loads(metadata_path.read_text())
            eval_name = metadata.get("eval_name", eval_dir.name)
            eval_key = f"{skill_dir.name}/{eval_name}"
            if eval_key not in eval_id_map:
                eval_id_map[eval_key] = eval_counter
                eval_counter += 1
            eval_id = eval_id_map[eval_key]

            for config in ("with_skill", "without_skill"):
                run_dir = eval_dir / config
                grading_path = run_dir / "grading.json"
                timing_path = run_dir / "timing.json"
                if not grading_path.exists():
                    continue
                grading = json.loads(grading_path.read_text())
                summary = grading.get("summary", {})
                timing = grading.get("timing", {})
                if not timing and timing_path.exists():
                    try:
                        timing = json.loads(timing_path.read_text())
                    except (json.JSONDecodeError, OSError):
                        pass

                runs.append({
                    "eval_id": eval_id,
                    "eval_name": f"{skill_dir.name} / {eval_name}",
                    "configuration": config,
                    "run_number": 1,
                    "result": {
                        "pass_rate": summary.get("pass_rate", 0.0),
                        "passed": summary.get("passed", 0),
                        "failed": summary.get("failed", 0),
                        "total": summary.get("total", 0),
                        "time_seconds": timing.get("total_duration_seconds", 0.0),
                        "tokens": timing.get("total_tokens") or 0,
                        "tool_calls": 0,
                        "errors": 0,
                    },
                    "expectations": grading.get("expectations", []),
                    "notes": [],
                })

    # Aggregate by configuration
    configs = ["with_skill", "without_skill"]
    run_summary = {}
    for config in configs:
        config_runs = [r for r in runs if r["configuration"] == config]
        if not config_runs:
            run_summary[config] = {
                "pass_rate": {"mean": 0.0, "stddev": 0.0, "min": 0.0, "max": 0.0},
                "time_seconds": {"mean": 0.0, "stddev": 0.0, "min": 0.0, "max": 0.0},
                "tokens": {"mean": 0, "stddev": 0, "min": 0, "max": 0},
            }
            continue
        pass_rates = [r["result"]["pass_rate"] for r in config_runs]
        times = [r["result"]["time_seconds"] for r in config_runs]
        tokens = [r["result"]["tokens"] for r in config_runs]
        run_summary[config] = {
            "pass_rate": calculate_stats(pass_rates),
            "time_seconds": calculate_stats(times),
            "tokens": calculate_stats(tokens),
        }

    delta = {
        "pass_rate": f"{run_summary['with_skill']['pass_rate']['mean'] - run_summary['without_skill']['pass_rate']['mean']:+.2f}",
        "time_seconds": f"{run_summary['with_skill']['time_seconds']['mean'] - run_summary['without_skill']['time_seconds']['mean']:+.1f}",
        "tokens": f"{run_summary['with_skill']['tokens']['mean'] - run_summary['without_skill']['tokens']['mean']:+.0f}",
    }
    run_summary["delta"] = delta

    benchmark = {
        "metadata": {
            "skill_name": "scctl-skills-review",
            "skill_path": "/Users/dmus/Transverse Sound Lab/super/.agents/skills",
            "executor_model": "<model-name>",
            "analyzer_model": "<model-name>",
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "evals_run": sorted(set(r["eval_id"] for r in runs)),
            "runs_per_configuration": 1,
        },
        "runs": runs,
        "run_summary": run_summary,
        "notes": [
            "All evals achieved 100% pass rate in both with-skill and without-skill configurations.",
            "Baseline (without skill) performs correctly because project docs (AGENTS.md, role-tool-policies.json, operator-runbook.md) are explicit.",
            "Skill value is qualitative: with-skill outputs cite the skill and canonical files more directly; without-skill outputs perform broader file searches.",
            "Average execution time is similar between configurations; per-skill variance is high due to only one run per eval.",
        ],
    }

    benchmark_path = base / "benchmark.json"
    benchmark_path.write_text(json.dumps(benchmark, indent=2, ensure_ascii=False))
    print(f"Wrote {benchmark_path}")

    # Markdown summary
    lines = [
        "# Skill Benchmark: scctl-skills-review",
        "",
        f"**Date**: {benchmark['metadata']['timestamp']}",
        f"**Evals**: {len(benchmark['metadata']['evals_run'])}",
        "",
        "## Summary",
        "",
        "| Metric | With Skill | Without Skill | Delta |",
        "|--------|-----------|---------------|-------|",
    ]
    ws = run_summary["with_skill"]
    ns = run_summary["without_skill"]
    lines.append(f"| Pass Rate | {ws['pass_rate']['mean']*100:.0f}% ± {ws['pass_rate']['stddev']*100:.0f}% | {ns['pass_rate']['mean']*100:.0f}% ± {ns['pass_rate']['stddev']*100:.0f}% | {delta['pass_rate']} |")
    lines.append(f"| Time | {ws['time_seconds']['mean']:.1f}s ± {ws['time_seconds']['stddev']:.1f}s | {ns['time_seconds']['mean']:.1f}s ± {ns['time_seconds']['stddev']:.1f}s | {delta['time_seconds']}s |")
    lines.append(f"| Tokens | {ws['tokens']['mean']:.0f} ± {ws['tokens']['stddev']:.0f} | {ns['tokens']['mean']:.0f} ± {ns['tokens']['stddev']:.0f} | {delta['tokens']} |")
    lines.append("")
    lines.append("## Notes")
    lines.append("")
    for note in benchmark["notes"]:
        lines.append(f"- {note}")
    lines.append("")
    lines.append("## Per-run Results")
    lines.append("")
    lines.append("| Eval | Config | Pass Rate | Time |")
    lines.append("|------|--------|-----------|------|")
    for run in runs:
        res = run["result"]
        lines.append(f"| {run['eval_name']} | {run['configuration']} | {res['passed']}/{res['total']} | {res['time_seconds']:.1f}s |")

    md_path = base / "benchmark.md"
    md_path.write_text("\n".join(lines))
    print(f"Wrote {md_path}")


if __name__ == "__main__":
    main()
