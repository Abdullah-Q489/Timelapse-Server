from fastapi import FastAPI, UploadFile, File, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional, List
import shutil
import asyncio
import re

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------
# Storage
# -------------------------
UPLOAD_DIR = Path(__file__).resolve().parent.parent / "Images"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Static files
app.mount("/static", StaticFiles(directory=UPLOAD_DIR), name="static")

# Filename pattern: dd-mm-YYYY_HH-MM-SS.jpg
NAME_RE = re.compile(
    r"(?P<dd>\d{2})-(?P<mm>\d{2})-(?P<yyyy>\d{4})_(?P<hh>\d{2})-(?P<mi>\d{2})-(?P<ss>\d{2})\.jpe?g$",
    re.IGNORECASE,
)

def capture_dt_from_name(p: Path) -> datetime:
    m = NAME_RE.search(p.name)
    if not m:
        return datetime.min.replace(tzinfo=timezone.utc)
    d = {k: int(v) for k, v in m.groupdict().items()}
    return datetime(d["yyyy"], d["mm"], d["dd"], d["hh"], d["mi"], d["ss"], tzinfo=timezone.utc)

def iter_images(exts=(".jpg", ".jpeg")) -> List[Path]:
    imgs = []
    for ext in exts:
        imgs.extend(UPLOAD_DIR.rglob(f"*{ext}"))
    return imgs

# Cache the most recently arrived file's URL (helps /latest-image & WS sync)
_latest_url: Optional[str] = None

@app.on_event("startup")
def seed_latest_url():
    global _latest_url
    imgs = iter_images()
    if imgs:
        latest = max(imgs, key=lambda p: p.stat().st_mtime)
        rel = latest.relative_to(UPLOAD_DIR)
        _latest_url = f"/static/{rel.as_posix()}"

# -------------------------
# WebSocket: push updates
# -------------------------
_ws_clients: set[WebSocket] = set()
_ws_lock = asyncio.Lock()

@app.websocket("/ws/updates")
async def ws_updates(ws: WebSocket):
    await ws.accept()
    async with _ws_lock:
        _ws_clients.add(ws)

    # Immediately sync the current latest to this client
    if _latest_url:
        try:
            await ws.send_json({"type": "new_image", "url": _latest_url})
        except Exception:
            pass

    async def keepalive():
        while True:
            try:
                await asyncio.sleep(30)
                await ws.send_json({"type": "ping"})
            except Exception:
                break

    ka = asyncio.create_task(keepalive())
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        ka.cancel()
        async with _ws_lock:
            _ws_clients.discard(ws)

async def _broadcast_new_image(url: str):
    """Send {'type':'new_image','url': url} to all clients; prune dead sockets."""
    # Snapshot clients outside of sends to avoid holding the lock while awaiting I/O
    async with _ws_lock:
        targets = list(_ws_clients)
    dead = []
    for client in targets:
        try:
            await client.send_json({"type": "new_image", "url": url})
        except Exception:
            dead.append(client)
    if dead:
        async with _ws_lock:
            for d in dead:
                _ws_clients.discard(d)

# -------------------------
# HTTP endpoints
# -------------------------
@app.post("/upload")
async def upload_image(file: UploadFile = File(...)):
    # Sanitize filename (strip directories)
    raw = Path(file.filename or "image.jpg").name

    # Parse capture time from filename; fallback to current UTC for foldering
    try:
        dt = datetime.strptime(raw, "%d-%m-%Y_%H-%M-%S.jpg").replace(tzinfo=timezone.utc)
    except ValueError:
        dt = datetime.now(timezone.utc)

    date_path = UPLOAD_DIR / dt.strftime("%Y") / dt.strftime("%m") / dt.strftime("%d")
    date_path.mkdir(parents=True, exist_ok=True)

    save_path = date_path / raw

    # Atomic write to avoid half-written files being served
    tmp = save_path.with_suffix(save_path.suffix + ".part")
    with open(tmp, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    tmp.replace(save_path)

    # Build static URL
    relative_path = save_path.relative_to(UPLOAD_DIR)
    url = f"/static/{relative_path.as_posix()}"

    # Update cache and notify clients
    global _latest_url
    _latest_url = url
    print(f"[Server] Saved: {save_path}")
    asyncio.create_task(_broadcast_new_image(url))

    return {"status": "success", "url": url}

@app.get("/latest-image")
def latest_image():
    """Return the latest image by arrival time (filesystem mtime)."""
    global _latest_url
    if _latest_url:
        return {"url": _latest_url}

    imgs = iter_images()
    if not imgs:
        return JSONResponse({"error": "No images found"}, status_code=404)
    latest = max(imgs, key=lambda p: p.stat().st_mtime)
    rel = latest.relative_to(UPLOAD_DIR)
    _latest_url = f"/static/{rel.as_posix()}"
    return {"url": _latest_url}

@app.get("/images")
def images(page: int = 1, per_page: int = 60, order: str = "arrival"):
    """
    Paginated list of image URLs, newest first.
    - order=arrival  -> sort by filesystem mtime (when the server finished writing)
    - order=capture  -> sort by timestamp parsed from filename (dd-mm-YYYY_HH-MM-SS.jpg)
    """
    if page < 1 or per_page < 1 or per_page > 500:
        return JSONResponse({"error": "bad paging"}, status_code=400)

    imgs = iter_images()
    if not imgs:
        return {"images": [], "page": page, "per_page": per_page, "total": 0, "has_more": False}

    if order.lower() == "capture":
        keyfunc = capture_dt_from_name
    else:
        keyfunc = lambda p: p.stat().st_mtime

    imgs.sort(key=keyfunc, reverse=True)
    total = len(imgs)
    start = (page - 1) * per_page
    end = min(start + per_page, total)
    slice_imgs = imgs[start:end]

    urls = [f"/static/{p.relative_to(UPLOAD_DIR).as_posix()}" for p in slice_imgs]
    return {
        "images": urls,
        "page": page,
        "per_page": per_page,
        "total": total,
        "has_more": end < total,
    }
