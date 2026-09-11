<#
.SYNOPSIS
    一键从生产服务器（火山引擎 aihr.top）下载用户与导师分身的聊天记录，按导师分 Markdown 文件。

.DESCRIPTION
    自动完成：上传/更新服务器端导出脚本 -> 在生产容器内只读导出（自动排除榨职机 ai-guide）
    -> 下载到本地 outbox/chats-时间戳/ 目录。需要本机已配置好对生产服务器的 SSH 密钥。

.EXAMPLE
    .\scripts\download-chats.ps1
    下载全部历史记录（不含 ai-guide），按 lydia.md / winnie.md / tina.md 分文件

.EXAMPLE
    .\scripts\download-chats.ps1 -Days 7
    只下载最近 7 天

.EXAMPLE
    .\scripts\download-chats.ps1 -Mentor lydia
    只下载 Lydia 的全部记录
#>
param(
    [int]$Days = 0,
    [string]$Mentor = ""
)

$ErrorActionPreference = "Stop"

$Server   = "14.103.104.122"
$User     = "root"
$Key      = Join-Path $env:USERPROFILE ".ssh\id_ed25519"
$RemoteSh = "/opt/xinzang-data/export-md.cjs"   # 容器内对应 /app/data/export-md.cjs
$Container = "xinzang"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LocalScript = Join-Path $PSScriptRoot "server-export-chats.cjs"
$Stamp       = Get-Date -Format "yyyyMMdd-HHmmss"
$LocalOut    = Join-Path $ProjectRoot "outbox\chats-$Stamp"

if (-not (Test-Path $Key)) { throw "找不到 SSH 密钥：$Key" }
if (-not (Test-Path $LocalScript)) { throw "找不到服务器端脚本：$LocalScript" }

$sshOpts = @("-i", $Key, "-o", "BatchMode=yes", "-o", "ConnectTimeout=20")

Write-Host "==> [1/4] 上传/更新服务器端导出脚本..." -ForegroundColor Cyan
& scp @sshOpts $LocalScript "${User}@${Server}:$RemoteSh"
if ($LASTEXITCODE -ne 0) { throw "上传脚本失败" }
# 确保容器内运行用户（nextjs, uid 1001）可读
& ssh @sshOpts "${User}@${Server}" "chown 1001:1001 $RemoteSh && chmod 644 $RemoteSh"
if ($LASTEXITCODE -ne 0) { throw "设置脚本权限失败" }

Write-Host "==> [2/4] 在生产容器内导出（只读，排除 ai-guide）..." -ForegroundColor Cyan
$envArgs = @("-e", "DATABASE_URL=file:/app/data/prod.db")
if ($Days -gt 0)   { $envArgs += @("-e", "DAYS=$Days") }
if ($Mentor -ne "") { $envArgs += @("-e", "ONLY_MENTOR=$Mentor") }

$remoteCmd = "docker exec $($envArgs -join ' ') $Container node /app/data/export-md.cjs"
$exportOut = & ssh @sshOpts "${User}@${Server}" $remoteCmd
if ($LASTEXITCODE -ne 0) { throw "容器内导出失败：$exportOut" }
$exportOut | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }

if ($exportOut -match "no-sessions") {
    Write-Host "没有匹配的聊天记录，未下载任何文件。" -ForegroundColor Yellow
    return
}

Write-Host "==> [3/4] 下载到本地：$LocalOut" -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $LocalOut | Out-Null
& scp @sshOpts -r "${User}@${Server}:/opt/xinzang-data/export/latest/*" "$LocalOut/"
if ($LASTEXITCODE -ne 0) { throw "下载文件失败" }

Write-Host "==> [4/4] 完成，本地文件：" -ForegroundColor Green
Get-ChildItem -Path $LocalOut -Filter *.md | ForEach-Object {
    $kb = [math]::Round($_.Length / 1024, 1)
    Write-Host ("    {0}  ({1} KB)" -f $_.Name, $kb) -ForegroundColor Green
}
Write-Host "目录：$LocalOut" -ForegroundColor Green
