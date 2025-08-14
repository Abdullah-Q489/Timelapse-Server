from fastapi import FastAPI, UploadFile, File, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from datetime import datetime
import shutil
import asyncio  # <-- for background broadcast tasks

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten later if you like
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Path to save uploaded images
UPLOAD_DIR = Path(__file__).resolve().parent.parent / "Images"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Mount static serving for the Images folder
app.mount("/static", StaticFiles(directory=UPLOAD_DIR), name="static")

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
    dead = []
    async with _ws_lock:
        for client in list(_ws_clients):
            try:
                await client.send_json({"type": "new_image", "url": url})
            except Exception:
                dead.append(client)
        for d in dead:
            _ws_clients.discard(d)

# -------------------------
# HTTP endpoints
# -------------------------
@app.post("/upload")
async def upload_image(file: UploadFile = File(...)):
    filename = file.filename

    try:
        dt = datetime.strptime(filename, "%d-%m-%Y_%H-%M-%S.jpg")
    except ValueError:
        dt = datetime.utcnow()

    date_path = UPLOAD_DIR / dt.strftime("%Y") / dt.strftime("%m") / dt.strftime("%d")
    date_path.mkdir(parents=True, exist_ok=True)

    save_path = date_path / filename
    with open(save_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Build the static URL used by the frontend
    relative_path = save_path.relative_to(UPLOAD_DIR)
    url = f"/static/{relative_path.as_posix()}"

    print(f"[Server] Saved: {save_path}")

    # Notify browsers immediately (fire-and-forget)
    asyncio.create_task(_broadcast_new_image(url))

    # Return a URL (more useful than a filesystem path)
    return {"status": "success", "url": url}

@app.get("/latest-image")
def latest_image():
    imgs = list(UPLOAD_DIR.rglob("*.jpg"))
    if not imgs:
        return JSONResponse({"error": "No images found"}, status_code=404)
    latest = max(imgs, key=lambda p: p.stat().st_mtime)
    rel = latest.relative_to(UPLOAD_DIR)
    return {"url": f"/static/{rel.as_posix()}"}

