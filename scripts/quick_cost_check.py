import sqlite3
import sys


def main() -> None:
  business_date = sys.argv[1] if len(sys.argv) > 1 else "2026-07-08"
  conn = sqlite3.connect("rkeeper_etl/rkeeper_data.db")
  cur = conn.cursor()
  goods_total = cur.execute("select count(*) from rkeeper_storehouse_goods").fetchone()[0]
  goods_with_division = cur.execute(
    "select count(*) from rkeeper_storehouse_goods where DEFAULT_DIVISION_RID is not null and DEFAULT_DIVISION_RID != ''"
  ).fetchone()[0]
  unmatched_sales = cur.execute("select count(*) from rkeeper_storehouse_unmatched_sales").fetchone()[0]
  cost_rows = cur.execute(
    "select count(*) from rkeeper_menu_item_cost where date(SHIFTDATE)=date(?)",
    (business_date,),
  ).fetchone()[0]
  cost_nonzero = cur.execute(
    "select count(*) from rkeeper_menu_item_cost where date(SHIFTDATE)=date(?) and COALESCE(COST_SUM,0) != 0",
    (business_date,),
  ).fetchone()[0]
  conn.close()
  print("goods_total", goods_total)
  print("goods_with_division", goods_with_division)
  print("unmatched_sales", unmatched_sales)
  print("cost_rows", business_date, cost_rows)
  print("cost_nonzero", business_date, cost_nonzero)


if __name__ == "__main__":
  main()
