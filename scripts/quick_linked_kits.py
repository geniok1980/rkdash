import sqlite3


def main() -> None:
  conn = sqlite3.connect("rkeeper_etl/rkeeper_data.db")
  cur = conn.cursor()
  rows = cur.execute(
    "select GOODS_RID, CODE, DISH, LINKED_KIT_RID from rkeeper_storehouse_goods where LINKED_KIT_RID is not null limit 10"
  ).fetchall()
  for r in rows:
    print(r)
  conn.close()


if __name__ == "__main__":
  main()

