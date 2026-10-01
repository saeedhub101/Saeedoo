param(
  [int]$DurationSeconds = 20,
  [string]$ReportPath = "ci-runtime-report.json"
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$electron = Join-Path $root "node_modules/electron/dist/electron.exe"
$entry = Join-Path $root "out/main/index.js"
if (!(Test-Path $electron)) { throw "Electron executable not found: $electron" }
if (!(Test-Path $entry)) { throw "Built entry not found: $entry" }

$userData = Join-Path $env:TEMP ("saeed-smoke-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $userData | Out-Null
$proc = Start-Process -FilePath $electron -ArgumentList @("--user-data-dir=$userData", $entry) -PassThru

try {
  Start-Sleep -Seconds 5
  $samples = @()
  $previousCpu = @{}
  $logical = [Environment]::ProcessorCount
  $end = (Get-Date).AddSeconds($DurationSeconds)

  while ((Get-Date) -lt $end) {
    $rootProc = Get-Process -Id $proc.Id -ErrorAction SilentlyContinue
    if (!$rootProc) { break }

    $all = @(Get-CimInstance Win32_Process | Where-Object {
      $_.ParentProcessId -eq $proc.Id -or $_.ProcessId -eq $proc.Id
    })
    $rows = @()
    foreach ($p in $all) {
      $gp = Get-Process -Id $p.ProcessId -ErrorAction SilentlyContinue
      if (!$gp) { continue }
      $type = "main"
      if ($p.CommandLine -match "--type=renderer") { $type = "renderer" }
      elseif ($p.CommandLine -match "--type=gpu-process") { $type = "gpu-process" }
      elseif ($p.CommandLine -match "--type=utility") { $type = "utility" }
      elseif ($p.CommandLine -match "--type=crashpad-handler") { $type = "crashpad" }
      $pid = [int]$p.ProcessId
      $cpuSeconds = [double]$gp.CPU
      $cpuPercent = $null
      if ($previousCpu.ContainsKey($pid)) {
        $deltaCpu = $cpuSeconds - [double]$previousCpu[$pid].cpu
        $deltaTime = ((Get-Date) - $previousCpu[$pid].time).TotalSeconds
        if ($deltaTime -gt 0) { $cpuPercent = [math]::Round(($deltaCpu / $deltaTime / $logical) * 100, 2) }
      }
      $previousCpu[$pid] = @{ cpu = $cpuSeconds; time = Get-Date }
      $rows += [pscustomobject]@{
        pid = $pid
        type = $type
        cpuSeconds = $cpuSeconds
        cpuPercent = $cpuPercent
        workingSetMB = [math]::Round($gp.WorkingSet64 / 1MB, 2)
        privateMB = [math]::Round($gp.PrivateMemorySize64 / 1MB, 2)
      }
    }

    $gpuRows = @()
    try {
      $gpu = Get-Counter '\GPU Engine(*)\Utilization Percentage' -ErrorAction Stop
      $gpuRows = @($gpu.CounterSamples | Where-Object {
        $_.InstanceName -match 'pid_([0-9]+)_'
      } | ForEach-Object {
        $m = [regex]::Match($_.InstanceName, 'pid_([0-9]+)_')
        [pscustomobject]@{
          pid = [int]$m.Groups[1].Value
          engine = $_.InstanceName
          utilization = [math]::Round([double]$_.CookedValue, 2)
        }
      } | Where-Object { $_.pid -eq $proc.Id -or ($all.ProcessId -contains $_.pid) })
    } catch {
      $gpuRows = @()
    }

    $samples += [pscustomobject]@{
      timestamp = (Get-Date).ToString("o")
      processes = $rows
      gpu = $gpuRows
    }
    Start-Sleep -Seconds 2
  }

  $groups = @()
  foreach ($type in @("main","renderer","gpu-process","utility","crashpad")) {
    $items = @($samples | ForEach-Object { $_.processes } | Where-Object { $_.type -eq $type })
    if ($items.Count -gt 0) {
      $groups += [pscustomobject]@{
        component = $type
        maxRamMB = [math]::Round((($items | Measure-Object workingSetMB -Maximum).Maximum), 2)
        avgRamMB = [math]::Round((($items | Measure-Object workingSetMB -Average).Average), 2)
        peakPrivateMB = [math]::Round((($items | Measure-Object privateMB -Maximum).Maximum), 2)
        avgCpuPercent = if (@($items | Where-Object { $null -ne $_.cpuPercent }).Count) { [math]::Round((($items | Where-Object { $null -ne $_.cpuPercent } | Measure-Object cpuPercent -Average).Average), 2) } else { $null }
        peakCpuPercent = if (@($items | Where-Object { $null -ne $_.cpuPercent }).Count) { [math]::Round((($items | Where-Object { $null -ne $_.cpuPercent } | Measure-Object cpuPercent -Maximum).Maximum), 2) } else { $null }
      }
    }
  }

  $gpuSummary = @($samples | ForEach-Object { $_.gpu })
  $report = [pscustomobject]@{
    generatedAt = (Get-Date).ToString("o")
    durationSeconds = $DurationSeconds
    logicalProcessors = $logical
    processComponentMemory = $groups
    gpu = [pscustomobject]@{
      samples = $gpuSummary.Count
      peakUtilizationPercent = if ($gpuSummary.Count) { [math]::Round((($gpuSummary | Measure-Object utilization -Maximum).Maximum), 2) } else { $null }
      avgUtilizationPercent = if ($gpuSummary.Count) { [math]::Round((($gpuSummary | Measure-Object utilization -Average).Average), 2) } else { $null }
      note = if ($gpuSummary.Count) { "GPU Engine counters were available." } else { "GPU Engine counters were unavailable on this runner." }
    }
    samples = $samples
  }
  $report | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $ReportPath
  Write-Host "Runtime diagnostics written to $ReportPath"
}
finally {
  Get-Process -Name electron -ErrorAction SilentlyContinue | Where-Object { $_.Id -eq $proc.Id -or $_.Parent.Id -eq $proc.Id } | Stop-Process -Force -ErrorAction SilentlyContinue
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force $userData -ErrorAction SilentlyContinue
}
