# 开启 hide.me VPN（连接到默认服务器 ep-jp.hideservers.net）
# 用法: powershell -ExecutionPolicy Bypass -File scripts/vpn-on.ps1
$ErrorActionPreference = "Continue"
$exe = "C:\Program Files (x86)\hide.me VPN\Hide.me.exe"

function Test-Vpn {
    try {
        $r = Invoke-WebRequest "https://www.google.com/generate_204" -Method Head -TimeoutSec 4 -UseBasicParsing
        return ($r.StatusCode -eq 204)
    } catch {
        return $false
    }
}

if (Test-Vpn) {
    Write-Host "VPN already connected"
    exit 0
}

$retry = 0
while ($retry -lt 2) {
    $retry++
    Stop-Process -Name "Hide.me" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2

    Write-Host "Starting hide.me GUI (attempt $retry)..."
    Start-Process $exe

    $i = 0
    while ($i -lt 45) {
        if (Test-Vpn) {
            $elapsed = $i * 2
            Write-Host "VPN connected after ~${elapsed}s (attempt $retry)"
            exit 0
        }
        Start-Sleep -Seconds 2
        $i++
    }
    Write-Host "Attempt $retry timed out, restarting..."
}

Write-Host "Failed to connect VPN after 2 attempts"
exit 1
