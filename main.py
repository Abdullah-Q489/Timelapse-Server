from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
from pathlib import Path
import shutil
from datetime import datetime

app = FastAPI()
UPLOAD_DIR = Path("Images")

@app.post("/upload")
async def upload_image(file: UploadFile = File(...)):
    filename = file.filename  # e.g. "17-07-2025_23-57-36.jpg"
    
    # Parse date from filename: "DD-MM-YYYY_HH-MM-SS.jpg"
    try:
        dt = datetime.strptime(filename, "%d-%m-%Y_%H-%M-%S.jpg")
    except ValueError:
        # If parsing fails, fallback to current UTC
        dt = datetime.utcnow()

    # Build folder path from the *capture time*
    date_path = UPLOAD_DIR / dt.strftime("%Y") / dt.strftime("%m") / dt.strftime("%d")
    date_path.mkdir(parents=True, exist_ok=True)

    save_path = date_path / filename
    with open(save_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    print(f"[Server] Saved: {save_path}")
    return JSONResponse(content={"status": "success", "path": str(save_path)})
