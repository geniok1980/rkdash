import sqlite3


def main() -> None:
  conn = sqlite3.connect("rkeeper_etl/rkeeper_data.db")
  cur = conn.cursor()

  sales_codes = [
    str(r[0])
    for r in cur.execute(
      "select distinct RKID from rkeeper_sales where date(SHIFTDATE)='2026-07-08' and RKID is not null limit 30"
    ).fetchall()
    if r[0] is not None
  ]
  goods_codes = [
    str(r[0])
    for r in cur.execute(
      "select distinct CODE from rkeeper_storehouse_goods where CODE is not null and CODE != '' limit 30"
    ).fetchall()
    if r[0] is not None
  ]
  cost_codes = [
    str(r[0])
    for r in cur.execute(
      "select distinct CODE from rkeeper_menu_item_cost where date(SHIFTDATE)='2026-07-08' and CODE is not null and CODE != '' limit 30"
    ).fetchall()
    if r[0] is not None
  ]

  sales_set = set(sales_codes)
  goods_set = set(goods_codes)
  cost_set = set(cost_codes)
  intersection = list(sorted(sales_set.intersection(goods_set)))[:30]

  print("sales_codes_sample", sales_codes[:20])
  print("goods_codes_sample", goods_codes[:20])
  print("cost_codes_sample", cost_codes[:20])
  print("intersection_sample", intersection)
  print("sales_codes_count", len(sales_set))
  print("goods_codes_count", len(goods_set))
  print("cost_codes_count", len(cost_set))
  print("intersection_count", len(sales_set.intersection(goods_set)))

  conn.close()


if __name__ == "__main__":
  main()
