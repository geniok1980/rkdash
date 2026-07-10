import sqlite3


def main() -> None:
    conn = sqlite3.connect("c:/dev/dashboard/rkeeper_etl/rkeeper_data.db")
    try:
        tables = [
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            ).fetchall()
        ]
        print("tables:", tables)

        for table_name in ("rkeeper_sales", "rkeeper_menu_item_cost"):
            cols = [
                (row[1], row[2])
                for row in conn.execute(f"PRAGMA table_info({table_name})").fetchall()
            ]
            print(f"\n{table_name} cols:", cols)
            indexes = conn.execute(
                f"""
                SELECT name, sql
                FROM sqlite_master
                WHERE type='index' AND tbl_name='{table_name}'
                ORDER BY name
                """
            ).fetchall()
            print(f"{table_name} indexes:", indexes)
            rows = conn.execute(
                f"""
                SELECT SHIFTDATE, CODE, DISH
                FROM {table_name}
                WHERE date(SHIFTDATE)='2026-07-08'
                LIMIT 5
                """
            ).fetchall()
            print(f"{table_name} sample:", rows)

        matched = conn.execute(
            """
            SELECT COUNT(1)
            FROM rkeeper_sales s
            JOIN rkeeper_menu_item_cost c
              ON date(s.SHIFTDATE)=date(c.SHIFTDATE)
             AND s.RKID=CAST(c.CODE AS INTEGER)
            WHERE date(s.SHIFTDATE)='2026-07-08'
            """
        ).fetchone()[0]
        sales = conn.execute(
            "SELECT COUNT(1) FROM rkeeper_sales WHERE date(SHIFTDATE)='2026-07-08'"
        ).fetchone()[0]
        cost = conn.execute(
            "SELECT COUNT(1) FROM rkeeper_menu_item_cost WHERE date(SHIFTDATE)='2026-07-08'"
        ).fetchone()[0]
        print("\nmatch stats:", {"matched": matched, "sales": sales, "cost": cost})

        cost_stats = conn.execute(
            """
            SELECT
              MIN(COST_SUM) as min_cost_sum,
              MAX(COST_SUM) as max_cost_sum,
              MIN(cost_per_unit) as min_cpu,
              MAX(cost_per_unit) as max_cpu,
              SUM(CASE WHEN COST_SUM IS NULL THEN 1 ELSE 0 END) as null_cost_sum_rows,
              SUM(CASE WHEN COALESCE(COST_SUM, 0) != 0 THEN 1 ELSE 0 END) as nonzero_cost_sum_rows
            FROM rkeeper_menu_item_cost
            WHERE date(SHIFTDATE)='2026-07-08'
            """
        ).fetchone()
        print("cost stats:", cost_stats)

        cost_samples = conn.execute(
            """
            SELECT CODE, GOODS_RID, UNIT_RID, PLACE_RID, COST_SUM, cost_per_unit
            FROM rkeeper_menu_item_cost
            WHERE date(SHIFTDATE)='2026-07-08'
            LIMIT 5
            """
        ).fetchall()
        print("cost samples:", cost_samples)

        if (
            conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='rkeeper_storehouse_goods'"
            ).fetchone()
            is not None
        ):
            goods_stats = conn.execute(
                """
                SELECT
                  COUNT(1) as total,
                  SUM(CASE WHEN DEFAULT_DIVISION_RID IS NULL THEN 1 ELSE 0 END) as null_division,
                  MIN(DEFAULT_DIVISION_RID) as min_division,
                  MAX(DEFAULT_DIVISION_RID) as max_division
                FROM rkeeper_storehouse_goods
                """
            ).fetchone()
            print("goods stats:", goods_stats)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
