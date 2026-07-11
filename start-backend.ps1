Write-Host "Starting AI Finance MVP Backend..." -ForegroundColor Green

cd backend
.\venv\Scripts\Activate.ps1
python -m uvicorn main:app --reload