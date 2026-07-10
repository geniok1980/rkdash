import sqlite3


def main() -> None:
  conn = sqlite3.connect("rkeeper_etl/rkeeper_data.db")
  cur = conn.cursor()
  count = cur.execute("select count(*) from rkeeper_storehouse_goods").fetchone()[0]
  print("goods_count", count)
  row = cur.execute(
    "select GOODS_RID, CODE, GOODS_GROUP_RID, GOODS_GROUP_NAME, DEFAULT_DIVISION_RID, LINKED_KIT_RID from rkeeper_storehouse_goods where GOODS_RID=12908"
  ).fetchone()
  print("row_12908", row)
  conn.close()


if __name__ == "__main__":
  main()
