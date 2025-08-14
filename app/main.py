from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from datetime import datetime
import shutil
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Or specify ["http://localhost:3000"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Path to save uploaded images
UPLOAD_DIR = Path(__file__).resolve().parent.parent / "Images"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Mount static serving for the Images folder
app.mount("/static", StaticFiles(directory=UPLOAD_DIR), name="static")


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

    print(f"[Server] Saved: {save_path}")
    return JSONResponse(content={"status": "success", "path": str(save_path)})


@app.get("/latest-image")
def latest_image():
    """Return the latest image file path as a static URL"""
    images = sorted(UPLOAD_DIR.rglob("*.jpg"), reverse=True)
    if not images:
        return JSONResponse(content={"error": "No images found"}, status_code=404)

    latest = images[0]
    relative_path = latest.relative_to(UPLOAD_DIR)
    url = f"/static/{relative_path.as_posix()}"
    return {"url": url}

@app.get("/all-images")
def all_images():
    """
    Return all image file paths as static URLs, sorted newest first.
    """
    images = sorted(UPLOAD_DIR.rglob("*.jpg"), reverse=True)
    urls = [f"/static/{img.relative_to(UPLOAD_DIR).as_posix()}" for img in images]
    return {"images": urls}
