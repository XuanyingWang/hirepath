param([int]$port = 1421)
$conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
if ($conns) {
    foreach ($c in $conns) {
        $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
        Write-Host "Port $port | PID:" $c.OwningProcess "| Name:" $proc.Name "| State:" $c.State "| Path:" $proc.Path
    }
} else {
    Write-Host "Port $port is FREE"
}
