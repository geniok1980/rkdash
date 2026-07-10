import sqlite3


DB_PATH = "c:/dev/dashboard/rkeeper_etl/rkeeper_data.db"


def get_sqlite_normalized_code_expression(column: str) -> str:
    casted = f"CAST({column} AS TEXT)"
    stripped = f"REPLACE(REPLACE({casted}, ' ', ''), '.0', '')"
    trimmed = f"LTRIM({stripped}, '0')"
    return f"CASE WHEN {trimmed} = '' THEN '0' ELSE {trimmed} END"


def table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1",
        (table_name,),
    ).fetchone()
    return row is not None


def main() -> None:
    conn = sqlite3.connect(DB_PATH)
    try:
        statements = [
            "CREATE INDEX IF NOT EXISTS idx_fc_sales_shiftdate ON rkeeper_sales(date(SHIFTDATE))",
            "CREATE INDEX IF NOT EXISTS idx_fc_sales_rest_shiftdate ON rkeeper_sales(RESTAURANTNAME, date(SHIFTDATE))",
            "CREATE INDEX IF NOT EXISTS idx_fc_sales_net_shiftdate ON rkeeper_sales(NETNAME, date(SHIFTDATE))",
            f"CREATE INDEX IF NOT EXISTS idx_fc_sales_rkid_norm_shiftdate ON rkeeper_sales({get_sqlite_normalized_code_expression('RKID')}, date(SHIFTDATE))",
            f"CREATE INDEX IF NOT EXISTS idx_fc_sales_code_norm_shiftdate ON rkeeper_sales({get_sqlite_normalized_code_expression('CODE')}, date(SHIFTDATE))",
        ]

        if table_exists(conn, "rkeeper_sales_gold"):
            statements.append(
                "CREATE INDEX IF NOT EXISTS idx_fc_sales_gold_shiftdate ON rkeeper_sales_gold(date(SHIFTDATE))"
            )

        for cost_table_name in (
            "rkeeper_menu_item_cost",
            "menu_item_cost",
            "foodcost_menu_item_cost",
        ):
            if table_exists(conn, cost_table_name):
                statements.append(
                    f"CREATE INDEX IF NOT EXISTS idx_fc_{cost_table_name}_shiftdate ON {cost_table_name}(date(SHIFTDATE))"
                )
                statements.append(
                    f"CREATE INDEX IF NOT EXISTS idx_fc_{cost_table_name}_code_norm_shiftdate ON {cost_table_name}({get_sqlite_normalized_code_expression('CODE')}, date(SHIFTDATE))"
                )

        for statement in statements:
            conn.execute(statement)

        conn.commit()
        print(f"created_or_verified_indexes={len(statements)}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
