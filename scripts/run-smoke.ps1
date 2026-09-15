param([switch]$Cleanup)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
if ($Cleanup) {
    $testRoot = [IO.Path]::GetFullPath((Join-Path $taskRoot 'work')) + [IO.Path]::DirectorySeparatorChar
    $stopped = 0
    foreach ($testProcess in (Get-CimInstance Win32_Process -Filter "name='zotero.exe'")) {
        if ($testProcess.CommandLine -notmatch '-no-remote' -or $testProcess.CommandLine -notmatch '-profile\s+"([^"]+)"') { continue }
        $testProfile = [IO.Path]::GetFullPath($Matches[1])
        if (-not $testProfile.StartsWith($testRoot, [StringComparison]::OrdinalIgnoreCase)) { continue }
        if ($testProfile.Substring($testRoot.Length) -notmatch '^smoke-\d+\\profile$') { continue }
        Stop-Process -Id $testProcess.ProcessId -ErrorAction SilentlyContinue
        $stopped++
    }
    Write-Output ('Closed remaining isolated Zotero test processes: ' + $stopped)
    exit
}
$smokeConfig = Get-Content -LiteralPath (Join-Path $taskRoot 'work/smoke-current.json') -Raw | ConvertFrom-Json
$smokeProfile = [IO.Path]::GetFullPath($smokeConfig.profile)
$smokeWorkspace = [IO.Path]::GetFullPath((Join-Path $taskRoot 'work')) + [IO.Path]::DirectorySeparatorChar
if (-not $smokeProfile.StartsWith($smokeWorkspace, [StringComparison]::OrdinalIgnoreCase)) { throw 'Test profile must be inside workspace/work.' }
$smokeProcess = Start-Process -FilePath 'C:\Program Files\Zotero\zotero.exe' -ArgumentList @('-no-remote', '-ZoteroDebugText', '-profile', ('"' + $smokeProfile + '"')) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $smokeConfig.run 'stdout.log') -RedirectStandardError (Join-Path $smokeConfig.run 'stderr.log')
$smokeProcess.Id | Set-Content -LiteralPath (Join-Path $smokeConfig.run 'pid.txt')
Write-Output ('Isolated Zotero process: ' + $smokeProcess.Id)
Write-Output ('Result: ' + $smokeConfig.result)
