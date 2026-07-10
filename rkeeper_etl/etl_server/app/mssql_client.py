
import pyodbc
import os
import pandas as pd
from datetime import datetime, timedelta

class MSSQLClient:
    def __init__(self, config=None):
        config = config or {}
        self.server = config.get('server') or os.getenv('MSSQL_SERVER')
        self.database = config.get('database') or os.getenv('MSSQL_DATABASE')
        self.user = config.get('user') or os.getenv('MSSQL_USER')
        self.password = config.get('password') or os.getenv('MSSQL_PASSWORD')
        self.port = str(config.get('port') or os.getenv('MSSQL_PORT', '1433'))
        self.driver = self._resolve_driver()
        
        self.conn_str = (
            f"DRIVER={{{self.driver}}};"
            f"SERVER={self.server},{self.port};"
            f"DATABASE={self.database};"
            f"UID={self.user};"
            f"PWD={self.password};"
            "Encrypt=no;"
            "TrustServerCertificate=yes"
        )

    def _resolve_driver(self) -> str:
        configured_driver = os.getenv('MSSQL_DRIVER')
        if configured_driver:
            return configured_driver

        available_drivers = set(pyodbc.drivers())
        for driver_name in (
            'ODBC Driver 18 for SQL Server',
            'ODBC Driver 17 for SQL Server',
            'ODBC Driver 11 for SQL Server',
            'SQL Server'
        ):
            if driver_name in available_drivers:
                return driver_name

        return 'SQL Server'

    def _get_datetime_range(self, date_from: str, date_to: str) -> tuple[datetime, datetime]:
        start = datetime.fromisoformat(date_from)
        end = datetime.fromisoformat(date_to) + timedelta(days=1) - timedelta(microseconds=1)
        return start, end

    def fetch_sales_data(self, date_from: str, date_to: str):
        """
        Fetches sales data from MSSQL for the given date range.
        Dates should be in 'YYYY-MM-DD' format.
        """
        # Convert string dates to datetime objects for pyodbc parameters if necessary, 
        # but usually string 'YYYY-MM-DD' works fine with SQL Server date parameters.
        # However, to match the BETWEEN clause which expects DATETIME or similar, strings are usually implicitly converted.

        query = '''
        SELECT
  EMPLOYEES00."NAME" AS "WAITER",
  SaleObjects00."CODE" AS "CODE",
  MENUITEMS00."SIFR" AS "RKID",
  SaleObjects00."NAME" AS "DISH",
  PayBindings."QUANTITY" AS "QUANTITY",
  PayBindings."PAYSUM" AS "PAYSUM",
  PayBindings."PRICESUM" AS "PRLISTSUM",
  DishDiscounts00."EXCLUDEFROMEARNINGS" AS "EXCLUDEFROMEARNINGS",
  UNCHANGEABLEORDERTYPES00."NAME" AS "ORDERCATEGORY",
  PrintChecks00."CHECKNUM" AS "CHECKNUM",
  GLOBALSHIFTS00."SHIFTNUM" AS "SHIFTNUM",
  OrderSessions00."PRINTAT" AS "PRINTAT___12",
  GLOBALSHIFTS00."SHIFTDATE" AS "SHIFTDATE",
  dbo.propCategPath(MENUITEMS00.SIFR) AS "CATEGPATH",
  CASHES00."NAME" AS "CLOSESTATION",
  CASHGROUPS00."NETNAME" AS "NETNAME",
  CURRENCYTYPES00."NAME" AS "CURRENCYTYPE",
  CURRENCIES00."NAME" AS "CURRENCY",
  CURRENCIES00."CODE" AS "CURRENCYCODE",
  Shifts00."PRINTSHIFTNUM" AS "CASHSHIFTNUM",
  TABLES00."NAME" AS "TABLE",
  Orders00."ORDERNAME" AS "ORDERNAME",
  PaymentsExtra00."CARDNUM" AS "CARDNUM",
  trk7EnumsValues1E00.UserMName AS "OBJKIND",
  PayBindings."TAXESADDED" AS "TAXESADDED",
  RESTAURANTS00."NAME" AS "RESTAURANTNAME",
  EMPLOYEES01."NAME" AS "DISHCREATOR",
  CurrLines00."DBKURS" AS "DBKURS",
  MENUITEMS01."NAME" AS "COMBODISH",
  PrintChecks00."CLOSEDATETIME" AS "CLOSEDATETIME___35",
  trk7EnumsValues3600.UserMName AS "STATUS",
  CATEGLIST00."NAME" AS "NAME1",
  CATEGLIST00."CODE" AS "CODE1",
  CURRENCIES01."NAME" AS "ORIGCURRENCY",
  TaxParts00."TAXRATE" AS "TAXRATE",
  TaxParts00."SUM" AS "SUM",
  PrintChecks00."EXTFISCID" AS "EXTFISCID",
  PrintChecks00."FISCDOCNUMBER" AS "FISCDOCNUMBER",
  PrintChecks00."DELETEFISCDOCNUMBER" AS "DELETEFISCDOCNUMBER",
  HALLPLANS00."NAME" AS "NAME",
  CLASSIFICATORGROUPS0000.NAME AS "F0000005A",
  CLASSIFICATORGROUPS0001.NAME AS "F0000005B",
  TAXDISHTYPES00."NAME" AS "NAME2"
FROM "PayBindings"
JOIN "CURRLINES" CurrLines00
  ON (CurrLines00."VISIT" = PayBindings."VISIT") AND (CurrLines00."MIDSERVER" = PayBindings."MIDSERVER") AND (CurrLines00."UNI" = PayBindings."CURRUNI")
JOIN "PRINTCHECKS" PrintChecks00
  ON (PrintChecks00."VISIT" = CurrLines00."VISIT") AND (PrintChecks00."MIDSERVER" = CurrLines00."MIDSERVER") AND (PrintChecks00."UNI" = CurrLines00."CHECKUNI")
JOIN "ORDERS" Orders00
  ON (Orders00."VISIT" = PayBindings."VISIT") AND (Orders00."MIDSERVER" = PayBindings."MIDSERVER") AND (Orders00."IDENTINVISIT" = PayBindings."ORDERIDENT")
LEFT JOIN "EMPLOYEES" EMPLOYEES00
  ON (EMPLOYEES00."SIFR" = Orders00."MAINWAITER")
LEFT JOIN "SALEOBJECTS" SaleObjects00
  ON (SaleObjects00."VISIT" = PayBindings."VISIT") AND (SaleObjects00."MIDSERVER" = PayBindings."MIDSERVER") AND (SaleObjects00."DISHUNI" = PayBindings."DISHUNI")
LEFT JOIN "DISHDISCOUNTS" DishDiscounts00
  ON (DishDiscounts00."VISIT" = SaleObjects00."VISIT") AND (DishDiscounts00."MIDSERVER" = SaleObjects00."MIDSERVER") AND (DishDiscounts00."UNI" = SaleObjects00."CHARGEUNI")
LEFT JOIN "UNCHANGEABLEORDERTYPES" UNCHANGEABLEORDERTYPES00
  ON (UNCHANGEABLEORDERTYPES00."SIFR" = Orders00."UOT")
JOIN "GLOBALSHIFTS" GLOBALSHIFTS00
  ON (GLOBALSHIFTS00."MIDSERVER" = Orders00."MIDSERVER") AND (GLOBALSHIFTS00."SHIFTNUM" = Orders00."ICOMMONSHIFT")
LEFT JOIN "ORDERSESSIONS" OrderSessions00
  ON (OrderSessions00."VISIT" = SaleObjects00."VISIT") AND (OrderSessions00."MIDSERVER" = SaleObjects00."MIDSERVER") AND (OrderSessions00."UNI" = SaleObjects00."SESSIONUNI")
LEFT JOIN "SESSIONDISHES" SessionDishes00
  ON (SessionDishes00."VISIT" = SaleObjects00."VISIT") AND (SessionDishes00."MIDSERVER" = SaleObjects00."MIDSERVER") AND (SessionDishes00."UNI" = SaleObjects00."DISHUNI")
LEFT JOIN "MENUITEMS" MENUITEMS00
  ON (MENUITEMS00."SIFR" = SessionDishes00."SIFR")
LEFT JOIN "CASHES" CASHES00
  ON (CASHES00."SIFR" = PrintChecks00."ICLOSESTATION")
LEFT JOIN "CASHGROUPS" CASHGROUPS00
  ON (CASHGROUPS00."SIFR" = PayBindings."MIDSERVER")
LEFT JOIN "CURRENCYTYPES" CURRENCYTYPES00
  ON (CURRENCYTYPES00."SIFR" = CurrLines00."IHIGHLEVELTYPE")
LEFT JOIN "CURRENCIES" CURRENCIES00
  ON (CURRENCIES00."SIFR" = CurrLines00."SIFR")
LEFT JOIN "SHIFTS" Shifts00
  ON (Shifts00."MIDSERVER" = PrintChecks00."MIDSERVER") AND (Shifts00."ISTATION" = PrintChecks00."ICLOSESTATION") AND (Shifts00."SHIFTNUM" = PrintChecks00."ISHIFT")
LEFT JOIN "TABLES" TABLES00
  ON (TABLES00."SIFR" = Orders00."TABLEID")
LEFT JOIN "PAYMENTSEXTRA" PaymentsExtra00
  ON (PaymentsExtra00."VISIT" = CurrLines00."VISIT") AND (PaymentsExtra00."MIDSERVER" = CurrLines00."MIDSERVER") AND (PaymentsExtra00."PAYUNI" = CurrLines00."PAYUNIFOROWNERINFO")
LEFT JOIN trk7EnumsValues trk7EnumsValues1E00
  ON (trk7EnumsValues1E00.EnumData = SaleObjects00."OBJKIND") AND (trk7EnumsValues1E00.EnumName = 'tSaleObjectKind')
LEFT JOIN "RESTAURANTS" RESTAURANTS00
  ON (RESTAURANTS00."SIFR" = CASHGROUPS00."RESTAURANT")
LEFT JOIN "EMPLOYEES" EMPLOYEES01
  ON (EMPLOYEES01."SIFR" = SaleObjects00."IAUTHOR")
LEFT JOIN "SESSIONDISHES" SessionDishes01
  ON (SessionDishes01."VISIT" = SessionDishes00."VISIT") AND (SessionDishes01."MIDSERVER" = SessionDishes00."MIDSERVER") AND (SessionDishes01."UNI" = SessionDishes00."COMBODISHUNI")
LEFT JOIN "MENUITEMS" MENUITEMS01
  ON (MENUITEMS01."SIFR" = SessionDishes01."SIFR")
LEFT JOIN trk7EnumsValues trk7EnumsValues3600
  ON (trk7EnumsValues3600.EnumData = GLOBALSHIFTS00."STATUS") AND (trk7EnumsValues3600.EnumName = 'TRecordStatus')
LEFT JOIN "CATEGLIST" CATEGLIST00
  ON (CATEGLIST00."SIFR" = MENUITEMS00."PARENT")
LEFT JOIN "PAYMENTS" Payments00
  ON (Payments00."VISIT" = CurrLines00."VISIT") AND (Payments00."MIDSERVER" = CurrLines00."MIDSERVER") AND (Payments00."UNI" = CurrLines00."PAYUNIFOROWNERINFO")
LEFT JOIN "CURRENCIES" CURRENCIES01
  ON (CURRENCIES01."SIFR" = Payments00."SIFR")
LEFT JOIN "TAXPARTS" TaxParts00
  ON (TaxParts00."VISIT" = PayBindings."VISIT") AND (TaxParts00."MIDSERVER" = PayBindings."MIDSERVER") AND (TaxParts00."ORDERIDENT" = PayBindings."ORDERIDENT") AND (TaxParts00."BINDINGUNI" = PayBindings."UNI") AND (TaxParts00."SIFR" = 1)
LEFT JOIN "HALLPLANS" HALLPLANS00
  ON (HALLPLANS00."SIFR" = TABLES00."HALL")
LEFT JOIN DISHGROUPS DISHGROUPS0000
  ON (DISHGROUPS0000.CHILD = MENUITEMS00.SIFR) AND (DISHGROUPS0000.CLASSIFICATION = 2304)
LEFT JOIN CLASSIFICATORGROUPS CLASSIFICATORGROUPS0000
  ON CLASSIFICATORGROUPS0000.IDENT = DISHGROUPS0000.PARENT  
LEFT JOIN DISHGROUPS DISHGROUPS0001
  ON (DISHGROUPS0001.CHILD = MENUITEMS00.SIFR) AND (DISHGROUPS0001.CLASSIFICATION = 2560)
LEFT JOIN CLASSIFICATORGROUPS CLASSIFICATORGROUPS0001
  ON CLASSIFICATORGROUPS0001.IDENT = DISHGROUPS0001.PARENT  
LEFT JOIN "SESSIONDISHES" SessionDishes02
  ON (SessionDishes02."VISIT" = PayBindings."VISIT") AND (SessionDishes02."MIDSERVER" = PayBindings."MIDSERVER") AND (SessionDishes02."UNI" = PayBindings."DISHUNI")
LEFT JOIN "TAXDISHTYPES" TAXDISHTYPES00
  ON (TAXDISHTYPES00."SIFR" = SessionDishes02."ITAXDISHTYPE")
WHERE
  ((PrintChecks00."STATE" = 6))
  AND (PrintChecks00."IGNOREINREP" = 0)
  AND (PrintChecks00."CLOSEDATETIME" BETWEEN ? AND ?)
        '''
        
        try:
            start, end = self._get_datetime_range(date_from, date_to)
            conn = pyodbc.connect(self.conn_str)
            df = pd.read_sql(query, conn, params=[start, end])
            conn.close()
            return df
        except Exception as e:
            print(f"MSSQL Error: {e}")
            return None

    def fetch_payments_data(self, date_from: str, date_to: str):
        """
        Fetches payments data from MSSQL for the given date range.
        Dates should be in 'YYYY-MM-DD' format.
        """
        query = '''
        SELECT 
           EMPLOYEES00.NAME AS "WAITER", 
           EMPLOYEES00.CODE AS "WAITERCODE", 
           Payments.BASICSUM AS "BASICSUM", 
           Payments.ORIGINALSUM AS "ORIGINALSUM", 
           CURRENCIES00.NAME AS "CURRENCY", 
           CURRENCIES00.CODE AS "CURRENCYCODE", 
           CURRENCYTYPES00.NAME AS "CURRENCYTYPE", 
           PrintChecks00.CHECKNUM AS "CHECKNUM", 
           EMPLOYEES01.CODE AS "CASHIERCODE", 
           EMPLOYEES01.NAME AS "CASHIER", 
           GLOBALSHIFTS00.SHIFTNUM AS "SHIFTNUM", 
           GLOBALSHIFTS00.SHIFTDATE AS "SHIFTDATE", 
           CASHGROUPS00.NETNAME AS "NETNAME", 
           trk7EnumsValues2800.UserMName AS "PAYLINETYPE", 
           PaymentsExtra00.CARDNUM AS "CARDNUM", 
           TABLES00.NAME AS "TABLE", 
           Orders00.ORDERNAME AS "ORDERNAME", 
           Orders00.OPENTIME AS "OPENTIME", 
           UNCHANGEABLEORDERTYPES00.NAME AS "ORDERCATEGORY", 
           RESTAURANTS00.NAME AS "RESTAURANTNAME", 
           CASHES00.NAME AS "CLOSESTATION", 
           Shifts00.PRINTSHIFTNUM AS "SHIFTNUM1", 
           PaymentsExtra00.OWNER AS "OWNER", 
           PrintChecks00.CLOSEDATETIME AS "CLOSEDATETIME___28", 
           trk7EnumsValues3400.UserMName AS "STATUS", 
           CHANGEABLEORDERTYPES00.NAME AS "ORDERTYPE", 
           CURRENCIES01.NAME AS "USECURRENCYAS", 
           Payments.SHOWINREP AS "SHOWINREP", 
           GLOBALSHIFTS00.IRESTAURANT AS "RESTAURANTID", 
           ENUMSTYPESDATAS00.NAME AS "SOURCENAME" 
         FROM Payments 
         JOIN ORDERSESSIONS OrderSessions00 
           ON (OrderSessions00.VISIT = Payments.VISIT) AND (OrderSessions00.MIDSERVER = Payments.MIDSERVER) AND (OrderSessions00.UNI = Payments.SESSIONUNI) 
         JOIN ORDERS Orders00 
           ON (Orders00.VISIT = OrderSessions00.VISIT) AND (Orders00.MIDSERVER = OrderSessions00.MIDSERVER) AND (Orders00.IDENTINVISIT = OrderSessions00.ORDERIDENT) 
         LEFT JOIN EMPLOYEES EMPLOYEES00 
           ON (EMPLOYEES00.SIFR = Orders00.MAINWAITER) 
         LEFT JOIN CURRENCIES CURRENCIES00 
           ON (CURRENCIES00.SIFR = Payments.SIFR) 
         LEFT JOIN CURRENCYTYPES CURRENCYTYPES00 
           ON (CURRENCYTYPES00.SIFR = CURRENCIES00.PARENT) 
         LEFT JOIN CURRLINES CurrLines00 
           ON (CurrLines00.VISIT = Payments.VISIT) AND (CurrLines00.MIDSERVER = Payments.MIDSERVER) AND (CurrLines00.UNI = Payments.CURRLINEUNI) 
         LEFT JOIN PRINTCHECKS PrintChecks00 
           ON (PrintChecks00.VISIT = CurrLines00.VISIT) AND (PrintChecks00.MIDSERVER = CurrLines00.MIDSERVER) AND (PrintChecks00.UNI = CurrLines00.CHECKUNI) 
         LEFT JOIN EMPLOYEES EMPLOYEES01 
           ON (EMPLOYEES01.SIFR = Payments.IAUTHOR) 
         JOIN GLOBALSHIFTS GLOBALSHIFTS00 
           ON (GLOBALSHIFTS00.MIDSERVER = Orders00.MIDSERVER) AND (GLOBALSHIFTS00.SHIFTNUM = Orders00.ICOMMONSHIFT) 
         LEFT JOIN CASHGROUPS CASHGROUPS00 
           ON (CASHGROUPS00.SIFR = Payments.MIDSERVER) 
         LEFT JOIN trk7EnumsValues trk7EnumsValues2800 
           ON (trk7EnumsValues2800.EnumData = Payments.PAYLINETYPE) AND (trk7EnumsValues2800.EnumName = 'tPayLineType') 
         LEFT JOIN PAYMENTSEXTRA PaymentsExtra00 
           ON (PaymentsExtra00.VISIT = Payments.VISIT) AND (PaymentsExtra00.MIDSERVER = Payments.MIDSERVER) AND (PaymentsExtra00.PAYUNI = Payments.UNI) 
         LEFT JOIN TABLES TABLES00 
           ON (TABLES00.SIFR = Orders00.TABLEID) 
         LEFT JOIN UNCHANGEABLEORDERTYPES UNCHANGEABLEORDERTYPES00 
           ON (UNCHANGEABLEORDERTYPES00.SIFR = Orders00.UOT) 
         LEFT JOIN RESTAURANTS RESTAURANTS00 
           ON (RESTAURANTS00.SIFR = CASHGROUPS00.RESTAURANT) 
         LEFT JOIN CASHES CASHES00 
           ON (CASHES00.SIFR = Payments.ISTATION) 
         LEFT JOIN SHIFTS Shifts00 
           ON (Shifts00.MIDSERVER = Payments.MIDSERVER) AND (Shifts00.ISTATION = Payments.ISTATION) AND (Shifts00.SHIFTNUM = Payments.ISHIFT) 
         LEFT JOIN trk7EnumsValues trk7EnumsValues3400 
           ON (trk7EnumsValues3400.EnumData = GLOBALSHIFTS00.STATUS) AND (trk7EnumsValues3400.EnumName = 'TRecordStatus') 
         LEFT JOIN CHANGEABLEORDERTYPES CHANGEABLEORDERTYPES00 
           ON (CHANGEABLEORDERTYPES00.SIFR = Orders00.COT) 
         LEFT JOIN CURRENCIES CURRENCIES01 
           ON (CURRENCIES01.SIFR = CurrLines00.SIFR) 
         LEFT JOIN EXTERNALIDS EXTERNALIDS00 
           ON (EXTERNALIDS00.VISIT = PAYMENTS.VISIT) AND (EXTERNALIDS00.MIDSERVER = PAYMENTS.MIDSERVER) AND (EXTERNALIDS00."order" = PAYMENTS.ORDERIDENT) AND (EXTERNALIDS00.SIFR = 10024) 
         LEFT JOIN ENUMSTYPESDATAS ENUMSTYPESDATAS00 
           ON (ENUMSTYPESDATAS00.GUIDSTRING = EXTERNALIDS00.EXTID) 
         WHERE 
           (Payments.IGNOREINREP = 0) 
           AND (Payments.STATE = 6) 
           AND (GLOBALSHIFTS00.STATUS = 3) 
           AND (Payments.SHOWINREP BETWEEN 0 AND 2)
           AND (GLOBALSHIFTS00.SHIFTDATE BETWEEN ? AND ?)
        '''
        
        try:
            start, end = self._get_datetime_range(date_from, date_to)
            conn = pyodbc.connect(self.conn_str)
            df = pd.read_sql(query, conn, params=[start, end])
            conn.close()
            return df
        except Exception as e:
            print(f"MSSQL Error: {e}")
            return None

    def fetch_operations_data(self, date_from: str, date_to: str):
        """
        Fetches operations data from MSSQL for the given date range.
        Dates should be in 'YYYY-MM-DD' format.
        """
        query = '''
        SELECT 
           1 AS "F00000002", 
           MENUITEMS00."NAME" AS "DISH", 
           OPERATIONS00."NAME" AS "OPERATION", 
           OperationLog."DATETIME" AS "DATETIME___3", 
           CONVERT(VARCHAR(8), OperationLog."DATETIME", 108) AS "DATETIME_12", 
           OperationLog."QNT" AS "QNT", 
           Orders00."TABLENAME" AS "TABLENAME", 
           TABLES00."NAME" AS "TABLE", 
           EMPLOYEES00."NAME" AS "WAITER", 
           EMPLOYEES01."NAME" AS "ACCESS", 
           EMPLOYEES02."NAME" AS "MANAGER", 
           GLOBALSHIFTS00."SHIFTNUM" AS "SHIFTNUM", 
           GLOBALSHIFTS00.SHIFTDATE AS "SHIFTDATE", 
           Orders00."ORDERNAME" AS "ORDERNAME", 
           CASHGROUPS00."NETNAME" AS "NETNAME", 
           Orders00."PAIDSUM" AS "PAIDSUM", 
           RESTAURANTS00."NAME" AS "RESTAURANTNAME", 
           MAKETSCHEMEDETAILS00."NAME" AS "MAKETSCHEMEDETAIL", 
           OperationLog."PARAMETER" AS "PARAMETER", 
           Shifts00."PRINTSHIFTNUM" AS "PRINTSHIFTNUM", 
           Orders01."ORDERNAME" AS "SOURCEORDER", 
           Orders01."TABLENAME" AS "SOURCETABLE", 
           OrderSessions01."REMINDAT" AS "REMINDAT", 
           trk7EnumsValues2200.UserMName AS "STATUS", 
           OperationLog."ORDERSUMBEFORE" AS "ORDERSUMBEFORE", 
           OperationLog."ORDERSUMAFTER" AS "ORDERSUMAFTER", 
           ORDERVOIDS00."NAME" AS "REASON", 
           GLOBALSHIFTS00."IRESTAURANT" AS "RESTAURANTID" 
         FROM "OperationLog" 
         LEFT JOIN "MENUITEMS" MENUITEMS00 
           ON (MENUITEMS00."SIFR" = OperationLog."MENUITEM") 
         LEFT JOIN "OPERATIONS" OPERATIONS00 
           ON (OPERATIONS00."SIFR" = OperationLog."OPERATION") 
         LEFT JOIN "ORDERS" Orders00 
           ON (Orders00."VISIT" = OperationLog."VISIT") AND (Orders00."MIDSERVER" = OperationLog."MIDSERVER") AND (Orders00."IDENTINVISIT" = OperationLog."ORDERIDENT") 
         LEFT JOIN "TABLES" TABLES00 
           ON (TABLES00."SIFR" = Orders00."TABLEID") 
         LEFT JOIN "EMPLOYEES" EMPLOYEES00 
           ON (EMPLOYEES00."SIFR" = Orders00."MAINWAITER") 
         LEFT JOIN "EMPLOYEES" EMPLOYEES01 
           ON (EMPLOYEES01."SIFR" = OperationLog."OPERATOR") 
         LEFT JOIN "EMPLOYEES" EMPLOYEES02 
           ON (EMPLOYEES02."SIFR" = OperationLog."MANAGER") 
         JOIN "GLOBALSHIFTS" GLOBALSHIFTS00 
           ON (GLOBALSHIFTS00."MIDSERVER" = OperationLog."MIDSERVER") AND (GLOBALSHIFTS00."SHIFTNUM" = OperationLog."ICOMMONSHIFT") 
         LEFT JOIN "CASHGROUPS" CASHGROUPS00 
           ON (CASHGROUPS00."SIFR" = OperationLog."MIDSERVER") 
         LEFT JOIN "RESTAURANTS" RESTAURANTS00 
           ON (RESTAURANTS00."SIFR" = CASHGROUPS00."RESTAURANT") 
         LEFT JOIN "MAKETSCHEMEDETAILS" MAKETSCHEMEDETAILS00 
           ON (MAKETSCHEMEDETAILS00."SIFR" = OperationLog."MAKETSCHEMEDETAIL") 
         LEFT JOIN "PRINTCHECKS" PrintChecks00 
           ON (PrintChecks00."VISIT" = Orders00."VISIT") AND (PrintChecks00."MIDSERVER" = Orders00."MIDSERVER") AND (PrintChecks00."UNI" = Orders00."LASTCHECKUNI") 
         LEFT JOIN "SHIFTS" Shifts00 
           ON (Shifts00."MIDSERVER" = PrintChecks00."MIDSERVER") AND (Shifts00."ISTATION" = PrintChecks00."ICLOSESTATION") AND (Shifts00."SHIFTNUM" = PrintChecks00."ISHIFT") 
         LEFT JOIN "ORDERSESSIONS" OrderSessions00 
           ON (OrderSessions00."VISIT" = OperationLog."VISIT") AND (OrderSessions00."MIDSERVER" = OperationLog."MIDSERVER") AND (OrderSessions00."UNI" = OperationLog."SESSIONUNI") 
         LEFT JOIN "ORDERSESSIONS" OrderSessions01 
           ON (OrderSessions01."VISIT" = OrderSessions00."COMMONVISIT") AND (OrderSessions01."MIDSERVER" = OrderSessions00."MIDSERVER") AND (OrderSessions01."UNI" = OrderSessions00."COMMONUNI") 
         LEFT JOIN "ORDERS" Orders01 
           ON (Orders01."VISIT" = OrderSessions01."VISIT") AND (Orders01."MIDSERVER" = OrderSessions01."MIDSERVER") AND (Orders01."IDENTINVISIT" = OrderSessions01."ORDERIDENT") 
         LEFT JOIN trk7EnumsValues trk7EnumsValues2200 
           ON (trk7EnumsValues2200.EnumData = GLOBALSHIFTS00."STATUS") AND (trk7EnumsValues2200.EnumName = 'TRecordStatus') 
         LEFT JOIN "ORDERVOIDS" ORDERVOIDS00 
           ON (ORDERVOIDS00."SIFR" = OperationLog."REASONID") 
         WHERE 
           ((GLOBALSHIFTS00."STATUS" = 3))
           AND (GLOBALSHIFTS00.SHIFTDATE BETWEEN ? AND ?)
        '''
        
        try:
            start, end = self._get_datetime_range(date_from, date_to)
            conn = pyodbc.connect(self.conn_str)
            df = pd.read_sql(query, conn, params=[start, end])
            conn.close()
            return df
        except Exception as e:
            print(f"MSSQL Error: {e}")
            return None
