$targetPid = (Get-NetTCPConnection -LocalPort 1421 -ErrorAction SilentlyContinue).OwningProcess
if ($targetPid) {
    Write-Host "Killing PID $targetPid on port 1421..."
    Stop-Process -Id $targetPid -Force
    Start-Sleep -Seconds 1
}
Write-Host "Starting tauri dev..."
Set-Location "D:\Job Hunt 2025\l5-prep-desktop"
Start-Process "cmd.exe" -ArgumentList "/c","npm run tauri dev" -NoNewWindow
