$path = "C:\Users\bingw\AppData\Roaming\Hide.me\vpn.settings"
$content = Get-Content $path -Raw -Encoding UTF8

# ConnectAfterStart: false -> true
$content = $content -replace '"ConnectAfterStart":\s*false', '"ConnectAfterStart":  true'

# defaultLocation hostname: nl.hideservers.net -> ep-jp.hideservers.net
$content = $content -replace '"hostname":\s*"nl\.hideservers\.net"', '"hostname":  "ep-jp.hideservers.net"'

Set-Content $path -Value $content -Encoding UTF8 -NoNewline

# 验证
$result = Get-Content $path -Raw
if ($result -match '"ConnectAfterStart":\s*true') { Write-Host "ConnectAfterStart=true OK" } else { Write-Host "ConnectAfterStart FAILED" }
if ($result -match '"hostname":\s*"ep-jp\.hideservers\.net"') { Write-Host "defaultLocation=jp OK" } else { Write-Host "defaultLocation FAILED" }
