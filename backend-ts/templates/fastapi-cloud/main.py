from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import Base, engine, get_db
from models import Item

BASE_DIR = Path(__file__).resolve().parent

# ── Create tables ────────────────────────────────────────────
Base.metadata.create_all(bind=engine)

app = FastAPI(title="MyApp", version="1.0.0")

app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")

templates = Jinja2Templates(directory=BASE_DIR / "templates")


# ── Pydantic schemas ────────────────────────────────────────
class ItemCreate(BaseModel):
    title: str
    description: str = ""
    status: str = "active"


class ItemUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None


# ── Seed data on startup ────────────────────────────────────
@app.on_event("startup")
def seed_data():
    db = next(get_db())
    try:
        if db.query(Item).count() == 0:
            seeds = [
                Item(
                    title="Welcome to Cloud Mode",
                    description="This is your first item. Edit or delete it to get started.",
                    status="active",
                ),
                Item(
                    title="Build Something Amazing",
                    description="Use the dashboard to manage your items with full CRUD support.",
                    status="active",
                ),
                Item(
                    title="Deploy with Confidence",
                    description="SQLite database persists your data. Ready for production with minimal setup.",
                    status="completed",
                ),
            ]
            db.add_all(seeds)
            db.commit()
    finally:
        db.close()


# ── Pages ────────────────────────────────────────────────────
@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse(request, "index.html")


@app.get("/about", response_class=HTMLResponse)
async def about(request: Request):
    return templates.TemplateResponse(request, "about.html")


@app.get("/dashboard", response_class=HTMLResponse)
async def dashboard(request: Request, db: Session = Depends(get_db)):
    items = db.query(Item).order_by(Item.created_at.desc()).all()
    return templates.TemplateResponse(request, "dashboard.html", {"items": items})


# ── API: Health ──────────────────────────────────────────────
@app.get("/api/health")
async def health():
    return {"status": "ok", "version": app.version}


# ── API: List items ──────────────────────────────────────────
@app.get("/api/items")
def list_items(db: Session = Depends(get_db)):
    items = db.query(Item).order_by(Item.created_at.desc()).all()
    return [item.to_dict() for item in items]


# ── API: Create item ─────────────────────────────────────────
@app.post("/api/items", status_code=201)
def create_item(payload: ItemCreate, db: Session = Depends(get_db)):
    if not payload.title.strip():
        raise HTTPException(status_code=400, detail="Title is required")

    item = Item(
        title=payload.title.strip(),
        description=payload.description.strip(),
        status=payload.status,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item.to_dict()


# ── API: Get single item ─────────────────────────────────────
@app.get("/api/items/{item_id}")
def get_item(item_id: int, db: Session = Depends(get_db)):
    item = db.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item.to_dict()


# ── API: Update item ─────────────────────────────────────────
@app.put("/api/items/{item_id}")
def update_item(item_id: int, payload: ItemUpdate, db: Session = Depends(get_db)):
    item = db.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    if payload.title is not None:
        if not payload.title.strip():
            raise HTTPException(status_code=400, detail="Title cannot be empty")
        item.title = payload.title.strip()
    if payload.description is not None:
        item.description = payload.description.strip()
    if payload.status is not None:
        item.status = payload.status

    db.commit()
    db.refresh(item)
    return item.to_dict()


# ── API: Delete item ─────────────────────────────────────────
@app.delete("/api/items/{item_id}")
def delete_item(item_id: int, db: Session = Depends(get_db)):
    item = db.get(Item, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    db.delete(item)
    db.commit()
    return {"message": "Item deleted"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=3000, reload=True)
