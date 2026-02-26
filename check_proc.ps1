$targetPid = 14176
$proc = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
Write-Host "Name:" $proc.Name
Write-Host "Path:" $proc.Path
$wmi = Get-WmiObject Win32_Process -Filter "ProcessId=$targetPid" -ErrorAction SilentlyContinue
Write-Host "CommandLine:" $wmi.CommandLine
