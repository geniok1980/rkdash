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


def normalize_code(value) -> str | None:
  if value is None:
    return None
  raw = str(value).strip().replace(" ", "")
  if raw.endswith(".0"):
    raw = raw[:-2]
  raw = raw.lstrip("0")
  return raw or "0"


def build_rptsale_input(date_from: str, date_to: str, flags: int, show_zero: int, group_by: int, sec_mode: int):
  return [
    {
      "head": "108",
      "original": ["1", "2", "30", "11", "3", "16"],
      "values": [[date_from], [date_to], [int(flags)], [int(show_zero)], [int(group_by)], [int(sec_mode)]],
    }
  ]


def load_sales_rkids(db_path: str, business_date: str) -> set[str]:
  conn = sqlite3.connect(db_path)
  cur = conn.cursor()
  rows = cur.execute(
    "select distinct RKID from rkeeper_sales where date(SHIFTDATE)=date(?) and RKID is not null",
    (business_date,),
  ).fetchall()
  conn.close()
  return {normalize_code(r[0]) for r in rows if r and r[0] is not None}


def main() -> None:
  db_path = "rkeeper_etl/rkeeper_data.db"
  business_date = "2026-07-08"

  sh = resolve_storehouse_config(db_path)
  if not sh.api_url or not sh.username or not sh.password:
    raise SystemExit("StoreHouse config is not set in dashboard_settings (rkeeper_etl_config).")

  sales_rkids = load_sales_rkids(db_path, business_date)
  print("sales_rkids", len(sales_rkids))

  flags_list = [1, 65, 64, 193, 320, 321, 577, 833]
  show_zero_list = [0, 1]
  group_by_list = [0, 1, 3, 4]
  sec_mode_list = [0, 2]

  scored: list[tuple] = []
  for flags in flags_list:
    for show_zero in show_zero_list:
      for group_by in group_by_list:
        for sec_mode in sec_mode_list:
          try:
            resp = exec_proc(
              sh,
              "RptSale",
              build_rptsale_input(business_date, business_date, flags, show_zero, group_by, sec_mode),
            )
          except Exception:
            continue

          rows = find_table_rows(resp, "300")
          if not rows:
            continue

          rkids = {normalize_code(r.get("210\\242")) for r in rows if r.get("210\\242") is not None}
          nonzero_cost = sum(1 for r in rows if (parse_number(r.get("40")) not in (None, 0)))
          intersection = len(rkids.intersection(sales_rkids))
          scored.append((intersection, nonzero_cost, len(rows), flags, show_zero, group_by, sec_mode))

  if not scored:
    print("NO_RESULTS")
    return

  scored.sort(reverse=True)
  for s in scored[:20]:
    print(s)


if __name__ == "__main__":
  main()

