
import asyncio
from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel
from .worker import ETLWorker
from contextlib import asynccontextmanager
import uvicorn

worker = ETLWorker()

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Server starting...")
    # Start the scheduler in the background
    asyncio.create_task(worker.start_hourly_scheduler())
    yield
    print("Server shutting down...")

app = FastAPI(title="RKeeper ETL Service", lifespan=lifespan)

class DateRange(BaseModel):
    date_from: str # YYYY-MM-DD
    date_to: str   # YYYY-MM-DD

@app.get("/")
def read_root():
    return {"status": "online", "service": "rkeeper-etl"}

@app.post("/sync")
async def trigger_sync(background_tasks: BackgroundTasks):
    if worker.is_running:
        raise HTTPException(status_code=409, detail="Sync already in progress")
    
    background_tasks.add_task(worker.run_sync)
    return {"status": "accepted", "message": "Dictionary sync started in background"}

@app.post("/sync/sales")
async def trigger_sales_sync(range: DateRange, background_tasks: BackgroundTasks):
    if worker.is_running:
        raise HTTPException(status_code=409, detail="Worker is busy")
    
    background_tasks.add_task(worker.run_sales_sync, range.date_from, range.date_to)
    return {"status": "accepted", "message": f"Sales sync started for {range.date_from} - {range.date_to}"}

@app.post("/sync/payments")
async def trigger_payments_sync(range: DateRange, background_tasks: BackgroundTasks):
    if worker.is_running:
        raise HTTPException(status_code=409, detail="Worker is busy")
    
    background_tasks.add_task(worker.run_payments_sync, range.date_from, range.date_to)
    return {"status": "accepted", "message": f"Payments sync started for {range.date_from} - {range.date_to}"}

@app.post("/sync/operations")
async def trigger_operations_sync(range: DateRange, background_tasks: BackgroundTasks):
    if worker.is_running:
        raise HTTPException(status_code=409, detail="Worker is busy")
    
    background_tasks.add_task(worker.run_operations_sync, range.date_from, range.date_to)
    return {"status": "accepted", "message": f"Operations sync started for {range.date_from} - {range.date_to}"}

@app.get("/status")
def get_status():
    return {
        "is_running": worker.is_running,
        "last_dict_status": worker.last_run_status,
        "last_sales_status": worker.last_sales_run_status,
        "last_run_time": worker.last_run_time
    }

@app.get("/tables")
def get_tables():
    tables = worker.db_manager.get_table_list()
    return {"count": len(tables), "tables": tables}

if __name__ == "__main__":
    uvicorn.run("rkeeper_etl.etl_server.app.main:app", host="0.0.0.0", port=8200, reload=True)
