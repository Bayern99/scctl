#!/usr/bin/env python3
"""Grader for scctl skill-creator review outputs."""

import json
import os
import re
import sys


def load_text(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def normalize(text: str) -> str:
    return text.lower()


def contains(text: str, *tokens: str) -> bool:
    t = normalize(text)
    return any(tok in t for tok in tokens)


def contains_near_negation(text: str, token: str, window: int = 100) -> bool:
    """Check if token appears within `window` chars of a negation word."""
    t = normalize(text)
    token = token.lower()
    negations = [
        "not", "no", "never", "forbidden", "prohibited", "banned", "cannot",
        "can't", "must not", "mustn't", "wrong", "invalid", "reject", "decline",
        "do not use", "don't use", "should not use", "outside",
    ]
    # Find all token occurrences and check nearby negation
    for m in re.finditer(re.escape(token), t):
        start = max(0, m.start() - window)
        end = min(len(t), m.end() + window)
        chunk = t[start:end]
        if any(neg in chunk for neg in negations):
            return True
    return False


def grade_governed_loop_final_nrt(text: str):
    assertions = []

    def check(name: str, cond: bool, evidence: str):
        assertions.append({"text": name, "passed": cond, "evidence": evidence})

    check(
        "Mentions sc_run_probe as part of closure",
        contains(text, "sc_run_probe", "run_probe"),
        "sc_run_probe appears" if contains(text, "sc_run_probe", "run_probe") else "missing",
    )
    check(
        "Mentions NRT / render_nrt final-quality path",
        contains(text, "render_nrt", "render-nrt", "nrt"),
        "NRT path mentioned" if contains(text, "render_nrt", "render-nrt", "nrt") else "missing",
    )
    check(
        "Mentions sc_summarize_session",
        contains(text, "sc_summarize_session", "summarize_session", "summarize-session"),
        "summarize mentioned" if contains(text, "sc_summarize_session", "summarize_session", "summarize-session") else "missing",
    )
    check(
        "Mentions sc_audit_session",
        contains(text, "sc_audit_session", "audit_session", "audit-session"),
        "audit mentioned" if contains(text, "sc_audit_session", "audit_session", "audit-session") else "missing",
    )
    check(
        "Mentions sc_memory_summary",
        contains(text, "sc_memory_summary", "memory_summary", "memory-summary"),
        "memory summary mentioned" if contains(text, "sc_memory_summary", "memory_summary", "memory-summary") else "missing",
    )
    check(
        "Does not propose sc_eval as terminal step",
        not contains(text, "sc_eval") or contains_near_negation(text, "sc_eval"),
        "sc_eval rejected or absent",
    )
    check(
        "Does not propose sc_run_file as terminal step",
        not contains(text, "sc_run_file") or contains_near_negation(text, "sc_run_file"),
        "sc_run_file rejected or absent",
    )
    check(
        "Does not propose sc_render (draft) as terminal step",
        not contains(text, "sc_render") or contains_near_negation(text, "sc_render"),
        "sc_render rejected or absent",
    )
    return assertions


def grade_governed_loop_raw_eval(text: str):
    assertions = []

    def check(name: str, cond: bool, evidence: str):
        assertions.append({"text": name, "passed": cond, "evidence": evidence})

    check(
        "Refuses to mark task complete",
        contains(text, "not complete", "cannot", "can't", "reject", "refuse", "no"),
        "verdict is refusal",
    )
    check(
        "Explains sc_eval is raw/operator/debug surface",
        contains(text, "raw", "operator", "debug", "shortcut"),
        "sc_eval characterized as raw/operator/debug",
    )
    check(
        "Mentions governed loop / workflow path as alternative",
        contains(text, "run_probe", "summarize_session", "audit_session", "governed loop", "workflow"),
        "governed workflow mentioned",
    )
    check(
        "Does not say 'yes, complete it'",
        not re.search(r"\byes[.,]?\s+(the task is complete|mark.*complete|complete it)", normalize(text)),
        "no premature completion",
    )
    return assertions


def grade_draft_vs_final_draft_as_final(text: str):
    assertions = []

    def check(name: str, cond: bool, evidence: str):
        assertions.append({"text": name, "passed": cond, "evidence": evidence})

    check(
        "Answers NO to closing with draft",
        contains(text, "no", "cannot", "can't", "not sufficient"),
        "draft rejected as final",
    )
    check(
        "Mentions sc_render_nrt / NRT as required",
        contains(text, "render_nrt", "render-nrt", "nrt"),
        "NRT path mentioned",
    )
    check(
        "Mentions audit / review / summarize gate",
        contains(text, "audit", "review", "summarize"),
        "closure gate mentioned",
    )
    # Relaxed: agents may quote the user's "good enough" phrase to reject it.
    check(
        "Does not claim the draft is sufficient for final closure",
        not re.search(r"(draft|sc_render)\s+(is|would be|counts as)\s+(sufficient|enough|acceptable)\s+for\s+(final|closure|delivery)", normalize(text)),
        "no draft sufficiency claim for final closure",
    )
    return assertions


def grade_draft_vs_final_quick_draft(text: str):
    assertions = []

    def check(name: str, cond: bool, evidence: str):
        assertions.append({"text": name, "passed": cond, "evidence": evidence})

    # sc_render_nrt may appear in caveats about future promotion; that's OK.
    # We look for an explicit recommendation of sc_render / render as the answer.
    t = normalize(text)
    recommends_draft = bool(
        re.search(r"\b(use|choose|recommend|should| decision\s*[:\-]?\s*\n+\s*\*\*)\s*[`*]*\s*(sc_render|render)\b", t, re.MULTILINE)
    ) or bool(re.search(r"\bsc_render\b.{0,30}\bdraft\b", t)) or bool(re.search(r"\bdraft\b.{0,30}\bsc_render\b", t))
    check(
        "Recommends sc_render (draft) as the primary answer",
        recommends_draft,
        "sc_render recommended as primary answer" if recommends_draft else "missing explicit sc_render recommendation",
    )
    check(
        "States no final closure / no NRT required for this request",
        contains(text, "no final", "not final", "no closure", "no audit", "not close", "exploration", "draft", "preview"),
        "no final closure expectation",
    )
    # sc_render_nrt should not be recommended as the answer for this quick draft request.
    recommends_nrt = bool(
        re.search(r"\b(use|choose|recommend|should)\s+[`*]*\s*(sc_render_nrt|render-nrt)\b", t)
    ) and not contains_near_negation(text, "sc_render_nrt", window=80)
    check(
        "Does not recommend sc_render_nrt as the answer for this quick draft",
        not recommends_nrt,
        "NRT not primary answer" if not recommends_nrt else "NRT wrongly primary",
    )
    return assertions


def grade_role_handoff_builder(text: str):
    assertions = []

    def check(name: str, cond: bool, evidence: str):
        assertions.append({"text": name, "passed": cond, "evidence": evidence})

    check(
        "Lists sc_run_probe as allowed",
        contains(text, "sc_run_probe") and contains(text, "allowed"),
        "sc_run_probe allowed",
    )
    check(
        "Lists sc_render_nrt as allowed (final_nrt variant)",
        contains(text, "sc_render_nrt") and contains(text, "allowed"),
        "sc_render_nrt allowed",
    )
    check(
        "Lists sc_eval as forbidden",
        contains(text, "sc_eval") and contains(text, "forbidden"),
        "sc_eval forbidden",
    )
    check(
        "Lists sc_render as forbidden",
        contains(text, "sc_render") and contains(text, "forbidden"),
        "sc_render forbidden",
    )
    check(
        "Cites canonical role/policy files",
        contains(text, "role-tool-policies.json") and contains(text, "sc-builder.md", "builder"),
        "canonical sources cited",
    )
    return assertions


def grade_role_handoff_critic(text: str):
    assertions = []

    def check(name: str, cond: bool, evidence: str):
        assertions.append({"text": name, "passed": cond, "evidence": evidence})

    check(
        "Refuses to run sc_eval",
        contains(text, "refuse", "decline", "cannot", "can't", "not run") and contains(text, "sc_eval"),
        "sc_eval refused",
    )
    check(
        "Explains critic forbids direct SC execution",
        contains(text, "direct supercollider", "forbidden", "outside the critic role", "not a runtime executor"),
        "critic execution constraint explained",
    )
    check(
        "Redirects to sc_audit_session or add_review",
        contains(text, "sc_audit_session", "add_review", "sc_candidate_action"),
        "redirects to review/audit tools",
    )
    return assertions


GRADERS = {
    "final-nrt-closure": grade_governed_loop_final_nrt,
    "raw-eval-shortcut": grade_governed_loop_raw_eval,
    "draft-as-final": grade_draft_vs_final_draft_as_final,
    "quick-draft-explore": grade_draft_vs_final_quick_draft,
    "builder-final-nrt-allowlist": grade_role_handoff_builder,
    "critic-no-execute": grade_role_handoff_critic,
}


def grade_run(skill_dir: str, eval_name: str, config: str):
    outputs_dir = os.path.join(skill_dir, eval_name, config, "outputs")
    decision_path = os.path.join(outputs_dir, "decision.md")
    if not os.path.exists(decision_path):
        raise FileNotFoundError(decision_path)
    text = load_text(decision_path)
    grader = GRADERS[eval_name]
    expectations = grader(text)
    passed = sum(1 for e in expectations if e["passed"])
    total = len(expectations)
    failed = total - passed
    pass_rate = passed / total if total else 0
    result = {
        "run_id": f"{eval_name}-{config}",
        "skill": os.path.basename(skill_dir),
        "eval_name": eval_name,
        "config": config,
        "decision_path": decision_path,
        "expectations": expectations,
        "summary": {
            "passed": passed,
            "failed": failed,
            "total": total,
            "pass_rate": pass_rate,
        },
    }
    # Merge timing if available
    timing_path = os.path.join(skill_dir, eval_name, config, "timing.json")
    if os.path.exists(timing_path):
        try:
            with open(timing_path, "r", encoding="utf-8") as f:
                timing = json.load(f)
            result["timing"] = {
                "total_duration_seconds": timing.get("total_duration_seconds", 0.0),
                "total_tokens": timing.get("total_tokens"),
            }
        except (json.JSONDecodeError, OSError):
            pass
    out_path = os.path.join(skill_dir, eval_name, config, "grading.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    print(f"Wrote {out_path} ({passed}/{total})")


def main():
    base = os.path.dirname(os.path.abspath(__file__))
    skills = ["scctl-governed-loop", "scctl-draft-vs-final", "scctl-role-handoff"]
    for skill in skills:
        skill_dir = os.path.join(base, skill)
        for eval_name in os.listdir(skill_dir):
            eval_path = os.path.join(skill_dir, eval_name)
            if not os.path.isdir(eval_path):
                continue
            if eval_name not in GRADERS:
                continue
            for config in ["with_skill", "without_skill"]:
                try:
                    grade_run(skill_dir, eval_name, config)
                except FileNotFoundError as e:
                    print(f"Skip {skill}/{eval_name}/{config}: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
