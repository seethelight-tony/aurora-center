# 極光盾發文中心一鍵部署＋驗證腳本（v2：路徑自動偵測，家裡/公司電腦都能跑）
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File deploy.ps1 "commit訊息"
param([string]$msg = "update")
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 路徑自動偵測：repo = 本腳本所在資料夾；主檔 = 上一層的 發文中心_W28.html
$repo = $PSScriptRoot
$src = Join-Path (Split-Path $repo -Parent) "發文中心_W28.html"
$dest = Join-Path $repo "index.html"
$url = "https://seethelight-tony.github.io/aurora-center/"

# 0. 主檔不存在就直接部署 repo 裡的 index.html（以 repo 為準）
$useSrc = Test-Path $src
$checkFile = if ($useSrc) { $src } else { $dest }

# 1. 語法檢查（本機有 node 才做；沒有就跳過，改由部署後人工/瀏覽器驗證）
if (Get-Command node -ErrorAction SilentlyContinue) {
    $html = [System.IO.File]::ReadAllText($checkFile, [System.Text.Encoding]::UTF8)
    $js = [regex]::Match($html, '(?s)<script>(.*)</script>').Groups[1].Value
    $tmp = Join-Path $env:TEMP "aurora_check.js"
    [System.IO.File]::WriteAllText($tmp, $js, (New-Object System.Text.UTF8Encoding($false)))
    node --check $tmp
    if ($LASTEXITCODE -ne 0) { Write-Output "❌ JS 語法錯誤，部署中止"; exit 1 }
    Write-Output "1/4 JS 語法 ✅"
} else {
    Write-Output "1/4 ⚠️ 本機無 node，跳過語法檢查（部署後請開頁面確認無錯誤）"
}

# 2. 複製 + 推送
if ($useSrc) { Copy-Item $src $dest -Force }
Set-Location $repo
git add -A
git -c user.name="seethelight-tony" -c user.email="antonyw829@gmail.com" commit -m $msg 2>&1 | Out-Null
git push 2>&1 | Out-Null
$localHash = (Get-FileHash $dest -Algorithm MD5).Hash
Write-Output "2/4 已推送 GitHub ✅"

# 3. 等待 Pages 部署並驗證內容一致
$ok = $false
for ($i = 0; $i -lt 24; $i++) {
    Start-Sleep -Seconds 10
    try {
        $live = Invoke-WebRequest -Uri "$url`?d=$(Get-Date -Format FFFFFFF)" -UseBasicParsing -ErrorAction Stop
        $liveBytes = [System.Text.Encoding]::UTF8.GetBytes($live.Content)
        $liveHash = [System.BitConverter]::ToString([System.Security.Cryptography.MD5]::Create().ComputeHash($liveBytes)).Replace("-","")
        if ($liveHash -eq $localHash) { $ok = $true; break }
    } catch {}
}
if ($ok) { Write-Output "3/4 線上內容 = 本地內容 ✅（雜湊一致）" }
else { Write-Output "3/4 ⚠️ 4 分鐘內線上內容尚未與本地一致——請再等或手動檢查！"; exit 2 }

Write-Output "4/4 部署完成並驗證 ✅ $url"
