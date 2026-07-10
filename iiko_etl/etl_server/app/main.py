from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
import os

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

from .worker import ETLWorker

worker = ETLWorker()


class DateRange(BaseModel):
    date_from: str
    date_to: str


@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(worker.start_hourly_scheduler())
    yield


app = FastAPI(title="IIKO ETL Service", lifespan=lifespan)


@app.get("/")
def read_root():
    return {"status": "online", "service": "iiko-etl"}


@app.get("/status")
def get_status():
    return worker.get_status()


@app.get("/tables")
def get_tables():
    tables = worker.db_manager.get_table_list()
    return {"count": len(tables), "tables": tables}


@app.post("/sync")
async def trigger_dict_sync():
    if worker.is_running:
        raise HTTPException(status_code=409, detail="Sync already in progress")

    asyncio.create_task(worker.run_sync())
    return {"status": "accepted", "message": "IIKO dictionary sync started"}


@app.post("/sync/products")
async def trigger_products_sync():
    if worker.is_running:
        raise HTTPException(status_code=409, detail="Worker is busy")

    asyncio.create_task(worker.run_products_sync())
    return {"status": "accepted", "message": "IIKO products sync started"}


@app.post("/sync/sales")
async def trigger_sales_sync(date_range: DateRange):
    if worker.is_running:
        raise HTTPException(status_code=409, detail="Worker is busy")

    asyncio.create_task(worker.run_sales_sync(date_range.date_from, date_range.date_to))
    return {
        "status": "accepted",
        "message": f"IIKO sales sync started for {date_range.date_from} - {date_range.date_to}",
    }


@app.post("/sync/all")
async def trigger_all_sync(date_range: DateRange):
    if worker.is_running:
        raise HTTPException(status_code=409, detail="Worker is busy")

    asyncio.create_task(worker.run_all_sync(date_range.date_from, date_range.date_to))
    return {
        "status": "accepted",
        "message": f"IIKO full sync started for {date_range.date_from} - {date_range.date_to}",
    }


if __name__ == "__main__":
    port = int(os.getenv("IIKO_ETL_PORT", "8791"))
    uvicorn.run("iiko_etl.etl_server.app.main:app", host="0.0.0.0", port=port, reload=True)
