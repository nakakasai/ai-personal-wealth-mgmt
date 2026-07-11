Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
Write-Host "Starting AI Finance MVP Frontend..." -ForegroundColor Green

# Navigate to frontend folder
cd frontend

# Install dependencies if needed
if (!(Test-Path "node_modules")) {
    Write-Host "Installing dependencies..."
    npm install
}

# Start Next.js development server
npm run dev