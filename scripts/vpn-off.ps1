# 关闭 hide.me VPN
# 用法: powershell -ExecutionPolicy Bypass -File scripts/vpn-off.ps1
Stop-Process -Name "Hide.me" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# 验证断开
try {
    Invoke-WebRequest "https://www.google.com/generate_204" -Method Head -TimeoutSec 3 -UseBasicParsing | Out-Null
    Write-Host "WARNING: google.com still reachable, VPN may still be active"
    exit 1
} catch {
    Write-Host "VPN disconnected (google.com unreachable)"
    exit 0
}
