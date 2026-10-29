$ErrorActionPreference = 'Stop'
$snapshotRoot = Join-Path $PSScriptRoot '../../apps/playground/public/data/earth/real/raw'
$catalogSources = @{
  'cosc' = 'geos/current/current-cosc-geos.epak'
  'so2smass' = 'geos/current/current-so2smass-geos.epak'
  'no2' = 'cams/current/current-no2-cams.epak'
  'pm1' = 'cams/current/current-pm1-cams.epak'
  'pm10' = 'cams/current/current-pm10-cams.epak'
  'dust' = 'geos/current/current-duexttau-geos.epak'
  'sulfate' = 'geos/current/current-suexttau-geos.epak'
  'organic' = 'cams/current/current-omaod-cams.epak'
  'temperature' = 'gfs/current/current-temp-surface-level-gfs-0.5.epak'
  'humidity' = 'gfs/current/current-relative_humidity-surface-level-gfs-0.5.epak'
  'dewpoint' = 'gfs/current/current-dew_point_temp-2m-gfs-0.5.epak'
  'wetbulb' = 'gfs/current/current-wet_bulb_temp-2m-gfs-0.5.epak'
  'rain' = 'gfs/current/current-precip_3hr-gfs-0.5.epak'
  'cape' = 'gfs/current/current-cape-gfs-0.5.epak'
  'water' = 'gfs/current/current-total_precipitable_water-gfs-0.5.epak'
  'cloud' = 'gfs/current/current-total_cloud_water-gfs-0.5.epak'
  'pressure' = 'gfs/current/current-mean_sea_level_pressure-gfs-0.5.epak'
  'feels-like' = 'gfs/current/current-misery_index-gfs-0.5.epak'
  'uvi' = 'cpcuvi/current/current-cpcuvi.epak'
  'sst' = 'ostia/current/current-sea_surface_temp-ostia-0.5.epak'
  'sst-anomaly-oisst' = 'oisst/current/current-sea_surface_temp_anomaly-oisst-0.5.epak'
  'wave-height' = 'ww3/current/current-sig_height-wave-30m.epak'
  'waves' = 'ww3/current/current-primary-wave-30m.epak'
  'currents' = 'glophy/current/current-uvo-1d_m-5m-glophy-1d4.epak'
  'coral' = 'crw/current/current-baa5-crw-0.15.epak'
  'aurora' = 'ovation/current/current-ovation.json'
  'fires' = 'firms/current/current-firms.epak'
}
foreach ($pressureLevel in @('1000hPa','850hPa','700hPa','500hPa','250hPa','70hPa','10hPa')) {
  foreach ($field in @('wind','temp','relative_humidity','air_density')) {
    $catalogSources["$field-$pressureLevel"] = "gfs/current/current-$field-isobaric-$pressureLevel-gfs-0.5.epak"
  }
}
$downloadRecords = @()
foreach ($catalogKey in $catalogSources.Keys | Sort-Object) {
  $extension = if ($catalogKey -eq 'aurora') { 'json' } else { 'epak' }
  $targetFile = Join-Path $snapshotRoot "$catalogKey-current.$extension"
  $sourceUrl = 'https://gaia.nullschool.net/data/' + $catalogSources[$catalogKey]
  $replaceDensity = $false
  if ($catalogKey.StartsWith('air_density-')) {
    $densityLevel = $catalogKey.Substring(12)
    $windBytes = [IO.File]::ReadAllBytes((Join-Path $snapshotRoot "wind-$densityLevel-current.epak"))
    $headBytes = $windBytes[4..7]
    [Array]::Reverse($headBytes)
    $headLength = [BitConverter]::ToUInt32($headBytes, 0)
    $windHeader = [Text.Encoding]::UTF8.GetString($windBytes, 8, $headLength) | ConvertFrom-Json
    $windTime = [DateTimeOffset]::Parse($windHeader.variables.time.data[0]).UtcDateTime
    $sourceUrl = 'https://gaia.nullschool.net/data/gfs/' + $windTime.ToString('yyyy/MM/dd/HHmm') + "-air_density-isobaric-$densityLevel-gfs-0.5.epak"
    $replaceDensity = $true
  }
  if ($replaceDensity -or !(Test-Path -LiteralPath $targetFile)) {
    for ($downloadAttempt = 0; $downloadAttempt -lt 3; $downloadAttempt++) {
      try {
        Invoke-WebRequest -Uri $sourceUrl -OutFile $targetFile -TimeoutSec 45
        break
      } catch {
        if ($downloadAttempt -eq 2) { throw }
      }
    }
  }
  $downloadRecords += @{ key = $catalogKey; file = "raw/$catalogKey-current.$extension"; url = $sourceUrl }
  Write-Output "$catalogKey downloaded"
}
$downloadRecords | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $snapshotRoot 'catalog-sources.json') -Encoding utf8
