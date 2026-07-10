import json
import sqlite3
from dataclasses import dataclass

import requests


@dataclass(frozen=True)
class StoreHouseConfig:
  api_url: str
  username: str
  password: str
  timeout_seconds: int


def load_rkeeper_etl_config(db_path: str) -> dict:
  conn = sqlite3.connect(db_path)
  cur = conn.cursor()
  row = cur.execute(
    "select value from dashboard_settings where key='rkeeper_etl_config' limit 1"
  ).fetchone()
  conn.close()
  if not row or not row[0]:
    return {}
  return json.loads(row[0])


def resolve_storehouse_config(db_path: str) -> StoreHouseConfig:
  cfg = load_rkeeper_etl_config(db_path)
  return StoreHouseConfig(
    api_url=str(cfg.get("storehouseApiUrl") or "").rstrip("/"),
    username=str(cfg.get("storehouseUsername") or ""),
    password=str(cfg.get("storehousePassword") or ""),
    timeout_seconds=int(cfg.get("storehouseRequestTimeoutSeconds") or 30),
  )


def exec_proc(config: StoreHouseConfig, proc_name: str, input_payload: list[dict]) -> dict:
  payload = {
    "procName": proc_name,
    "UserName": config.username,
    "Password": config.password,
    "Input": input_payload,
  }
  resp = requests.post(
    f"{config.api_url}/api/sh5exec",
    json=payload,
    timeout=config.timeout_seconds,
    headers={"Content-Type": "application/json"},
  )
  resp.raise_for_status()
  data = resp.json()
  if isinstance(data, dict) and data.get("errCode") not in (None, 0):
    raise RuntimeError(f"StoreHouse errCode={data.get('errCode')} errText={data.get('errText')}")
  return data


def find_table_rows(sh_response: dict, head: str) -> list[dict]:
  tables = sh_response.get("shTable") or []
  for t in tables:
    if str(t.get("head")) == str(head):
      fields = [str(x) for x in (t.get("fields") or [])]
      values = t.get("values") or []
      rows: list[dict] = []
      for row_values in values:
        row: dict = {}
        for f, v in zip(fields, row_values):
          row[f] = v
        rows.append(row)
      return rows
  return []


def parse_number(value) -> float | None:
  if value is None:
    return None
  if isinstance(value, (int, float)):
    return float(value)
  try:
    raw = str(value).strip().replace("\xa0", "").replace(" ", "").replace(",", ".")
    if raw == "":
      return None
    return float(raw)
  except Exception:
    return None


def build_rptsale_input(date_from: str, date_to: str, flags: int, show_zero: int, group_by: int, sec_mode: int):
  return [
    {
      "head": "108",
      "original": ["1", "2", "30", "11", "3", "16"],
      "values": [[date_from], [date_to], [int(flags)], [int(show_zero)], [int(group_by)], [int(sec_mode)]],
    }
  ]


def main() -> None:
  sh = resolve_storehouse_config("rkeeper_etl/rkeeper_data.db")
  if not sh.api_url or not sh.username or not sh.password:
    raise SystemExit("StoreHouse config is not set in dashboard_settings (rkeeper_etl_config).")

  periods = [
    ("2026-07-01", "2026-07-08"),
    ("2026-06-01", "2026-06-30"),
    ("2026-05-01", "2026-05-31"),
    ("2026-01-01", "2026-01-31"),
    ("2025-10-25", "2025-11-05"),
  ]
  flags_list = [65, 64, 193, 320, 321, 577, 833]
  phase1 = {
    "show_zero_list": [0],
    "group_by_list": [3],
    "sec_mode_list": [0],
  }
  phase2 = {
    "show_zero_list": [0, 1],
    "group_by_list": [0, 1, 3, 4],
    "sec_mode_list": [0, 2],
  }

  def run_phase(phase: dict) -> list[tuple]:
    found: list[tuple] = []
    for date_from, date_to in periods:
      for flags in flags_list:
        for show_zero in phase["show_zero_list"]:
          for group_by in phase["group_by_list"]:
            for sec_mode in phase["sec_mode_list"]:
              try:
                resp = exec_proc(
                  sh,
                  "RptSale",
                  build_rptsale_input(date_from, date_to, flags, show_zero, group_by, sec_mode),
                )
              except Exception:
                continue
              rows = find_table_rows(resp, "300")
              if not rows:
                continue
              nonzero_cost = sum(1 for r in rows if (parse_number(r.get("40")) not in (None, 0)))
              if nonzero_cost:
                found.append(
                  (date_from, date_to, flags, show_zero, group_by, sec_mode, len(rows), nonzero_cost)
                )
    return found

  found = run_phase(phase1)
  if not found:
    found = run_phase(phase2)

  if not found:
    print("NO_NONZERO_COST_FOUND")
    return

  found.sort(key=lambda x: (-x[7], -x[6]))
  for row in found[:30]:
    print(row)


if __name__ == "__main__":
  main()
