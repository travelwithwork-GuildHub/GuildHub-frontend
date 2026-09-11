#!/usr/bin/env python3
"""契約測試在 CI 的形狀（規格 FE-O05-S15）。

    python3 .github/scripts/check-contract-ci.py .github/workflows/ci.yml

要成立的三件事（解析 YAML，看 job／step 的結構，不看整檔文字 —— 註解、step 名稱裡出現字都不算）：
  1. 存在一個 job，`services` 裡有 `postgres`，而且它的某個 step 的 `run` 含 `test:contract:internal`。
  2. 所有 job 的所有 step 的 `run` 與 `uses` 都沒有 `contract-guildhub`、`run.sh`、`CONTRACT_TARGET=guildhub`。
  3. 沒有任何 job／step 的 `env` 設 `GUILDHUB_BACKEND_DIR`。
任何一件不成立 → 非零結束並說是哪一件。
"""

import sys

try:
    import yaml  # PyYAML：ubuntu runner 與這台機器都有
except ImportError:  # pragma: no cover
    print("需要 PyYAML（python3 -c 'import yaml'）", file=sys.stderr)
    sys.exit(2)

FORBIDDEN = ("contract-guildhub", "run.sh", "CONTRACT_TARGET=guildhub")


def steps_of(job: dict) -> list:
    return [s for s in (job.get("steps") or []) if isinstance(s, dict)]


def main(path: str) -> int:
    with open(path, encoding="utf-8") as f:
        doc = yaml.safe_load(f)
    jobs = (doc or {}).get("jobs") or {}
    problems = []

    internal_ok = False
    for name, job in jobs.items():
        if not isinstance(job, dict):
            continue
        services = job.get("services") or {}
        has_pg = "postgres" in services
        runs_internal = any("test:contract:internal" in str(s.get("run", "")) for s in steps_of(job))
        if has_pg and runs_internal:
            internal_ok = True
        if runs_internal and not has_pg:
            problems.append(f"job `{name}` 跑 test:contract:internal 但 services 裡沒有 postgres")
        for s in steps_of(job):
            for field in ("run", "uses"):
                text = str(s.get(field, ""))
                for bad in FORBIDDEN:
                    if bad in text:
                        problems.append(f"job `{name}` 的 step `{s.get('name', '?')}` 的 {field} 含 `{bad}` —— guildhub 那一輪不在 CI")
            env = s.get("env") or {}
            if isinstance(env, dict) and "GUILDHUB_BACKEND_DIR" in env:
                problems.append(f"job `{name}` 的 step `{s.get('name', '?')}` 設了 GUILDHUB_BACKEND_DIR")
        env = job.get("env") or {}
        if isinstance(env, dict) and "GUILDHUB_BACKEND_DIR" in env:
            problems.append(f"job `{name}` 設了 GUILDHUB_BACKEND_DIR")
    if not internal_ok:
        problems.append("沒有任何一個 job 同時有 postgres service 與跑 test:contract:internal 的 step")

    for p in problems:
        print(f"✗ {p}")
    if problems:
        return 1
    print("✓ 契約測試在 CI 的形狀正確：internal 有 postgres service；沒有 guildhub 那一輪")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else ".github/workflows/ci.yml"))
