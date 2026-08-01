# clima.ps1 - Consulta el clima actual y el pronostico sin API key.
# Fuente primaria: wttr.in. Fallback: Open-Meteo (+ geocoding y geolocalizacion por IP).
# Por defecto consulta Buenos Aires, Argentina.
# Uso:
#   powershell -ExecutionPolicy Bypass -File clima.ps1
#   powershell -ExecutionPolicy Bypass -File clima.ps1 -Ciudad "Cordoba, AR" -Dias 3
#   powershell -ExecutionPolicy Bypass -File clima.ps1 -PorIP
#   powershell -ExecutionPolicy Bypass -File clima.ps1 -Json

[CmdletBinding()]
param(
    [string]$Ciudad = 'Buenos Aires, Argentina',
    [switch]$PorIP,
    [ValidateRange(1, 3)]
    [int]$Dias = 2,
    [switch]$Json,
    [int]$TimeoutSec = 15
)

# -PorIP gana sobre -Ciudad: vacia la ciudad para que ambas fuentes geolocalicen.
if ($PorIP) { $Ciudad = '' }

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Get-Json($Url) {
    # curl.exe es mas confiable que Invoke-RestMethod para estos endpoints.
    $raw = & curl.exe -s -L --max-time $TimeoutSec -H 'User-Agent: curl/8' $Url
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($raw)) {
        throw "Sin respuesta de $Url"
    }
    return $raw | ConvertFrom-Json
}

# ---------------------------------------------------------------- wttr.in ---
function Get-ClimaWttr {
    $slug = if ($Ciudad) { [Uri]::EscapeDataString($Ciudad) } else { '' }
    $data = Get-Json "https://wttr.in/$slug`?format=j1&lang=es"

    $actual = $data.current_condition[0]
    $area = $data.nearest_area[0]
    $lugar = @($area.areaName[0].value, $area.region[0].value, $area.country[0].value) |
        Where-Object { $_ } | Select-Object -Unique
    $desc = if ($actual.lang_es) { $actual.lang_es[0].value } else { $actual.weatherDesc[0].value }

    $pronostico = @()
    foreach ($d in ($data.weather | Select-Object -First $Dias)) {
        $pronostico += [pscustomobject]@{
            fecha        = $d.date
            min_c        = [double]$d.mintempC
            max_c        = [double]$d.maxtempC
            lluvia_mm    = [double]($d.hourly | Measure-Object -Property precipMM -Sum).Sum
            descripcion  = $(if ($d.hourly[4].lang_es) { $d.hourly[4].lang_es[0].value } else { $d.hourly[4].weatherDesc[0].value })
        }
    }

    return [pscustomobject]@{
        fuente          = 'wttr.in'
        lugar           = ($lugar -join ', ')
        observado       = $(if ($actual.localObsDateTime) { $actual.localObsDateTime } else { "$($actual.observation_time) UTC" })
        temp_c          = [double]$actual.temp_C
        sensacion_c     = [double]$actual.FeelsLikeC
        descripcion     = $desc
        humedad_pct     = [int]$actual.humidity
        viento_kmh      = [double]$actual.windspeedKmph
        viento_dir      = $actual.winddir16Point
        presion_hpa     = [double]$actual.pressure
        visibilidad_km  = [double]$actual.visibility
        uv              = $actual.uvIndex
        pronostico      = $pronostico
    }
}

# ------------------------------------------------------------- Open-Meteo ---
$WMO = @{
    0='Despejado'; 1='Mayormente despejado'; 2='Parcialmente nublado'; 3='Nublado';
    45='Niebla'; 48='Niebla con escarcha'; 51='Llovizna leve'; 53='Llovizna'; 55='Llovizna intensa';
    56='Llovizna helada leve'; 57='Llovizna helada intensa'; 61='Lluvia leve'; 63='Lluvia'; 65='Lluvia intensa';
    66='Lluvia helada leve'; 67='Lluvia helada intensa'; 71='Nieve leve'; 73='Nieve'; 75='Nieve intensa';
    77='Granos de nieve'; 80='Chubascos leves'; 81='Chubascos'; 82='Chubascos violentos';
    85='Chubascos de nieve leves'; 86='Chubascos de nieve'; 95='Tormenta'; 96='Tormenta con granizo leve'; 99='Tormenta con granizo'
}

function Get-ClimaOpenMeteo {
    if ($Ciudad) {
        $q = [Uri]::EscapeDataString($Ciudad)
        $geo = Get-Json "https://geocoding-api.open-meteo.com/v1/search?name=$q&count=1&language=es&format=json"
        if (-not $geo.results) { throw "Ciudad no encontrada: $Ciudad" }
        $lat = $geo.results[0].latitude; $lon = $geo.results[0].longitude
        $lugar = @($geo.results[0].name, $geo.results[0].admin1, $geo.results[0].country) |
            Where-Object { $_ } | Select-Object -Unique
        $lugar = $lugar -join ', '
    } else {
        $ip = Get-Json 'http://ip-api.com/json/?fields=status,country,regionName,city,lat,lon'
        if ($ip.status -ne 'success') { throw 'Geolocalizacion por IP fallida' }
        $lat = $ip.lat; $lon = $ip.lon
        $lugar = @($ip.city, $ip.regionName, $ip.country) | Where-Object { $_ } | Select-Object -Unique
        $lugar = $lugar -join ', '
    }

    $url = "https://api.open-meteo.com/v1/forecast?latitude=$lat&longitude=$lon" +
           '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure' +
           '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum' +
           "&timezone=auto&forecast_days=$Dias"
    $data = Get-Json $url
    $c = $data.current

    $pronostico = @()
    for ($i = 0; $i -lt $data.daily.time.Count; $i++) {
        $code = [int]$data.daily.weather_code[$i]
        $pronostico += [pscustomobject]@{
            fecha       = $data.daily.time[$i]
            min_c       = [double]$data.daily.temperature_2m_min[$i]
            max_c       = [double]$data.daily.temperature_2m_max[$i]
            lluvia_mm   = [double]$data.daily.precipitation_sum[$i]
            descripcion = $(if ($WMO.ContainsKey($code)) { $WMO[$code] } else { "Codigo WMO $code" })
        }
    }

    $ccode = [int]$c.weather_code
    return [pscustomobject]@{
        fuente       = 'open-meteo'
        lugar        = $lugar
        observado    = $c.time
        temp_c       = [double]$c.temperature_2m
        sensacion_c  = [double]$c.apparent_temperature
        descripcion  = $(if ($WMO.ContainsKey($ccode)) { $WMO[$ccode] } else { "Codigo WMO $ccode" })
        humedad_pct  = [int]$c.relative_humidity_2m
        viento_kmh   = [double]$c.wind_speed_10m
        viento_dir   = "$([int]$c.wind_direction_10m) grados"
        presion_hpa  = [double]$c.surface_pressure
        pronostico   = $pronostico
    }
}

# ------------------------------------------------------------------ main ----
$resultado = $null
$errores = @()

foreach ($fn in @('Get-ClimaWttr', 'Get-ClimaOpenMeteo')) {
    try {
        $resultado = & $fn
        if ($resultado) { break }
    } catch {
        $errores += "$fn -> $($_.Exception.Message)"
    }
}

if (-not $resultado) {
    Write-Error ("No se pudo obtener el clima.`n" + ($errores -join "`n"))
    exit 1
}

if ($Json) {
    $resultado | ConvertTo-Json -Depth 5
    exit 0
}

$r = $resultado
Write-Output "Clima en $($r.lugar)  [fuente: $($r.fuente)]"
Write-Output "Observado: $($r.observado)"
Write-Output ''
Write-Output "  $($r.descripcion)"
Write-Output "  Temperatura : $($r.temp_c) C (sensacion $($r.sensacion_c) C)"
Write-Output "  Humedad     : $($r.humedad_pct) %"
Write-Output "  Viento      : $($r.viento_kmh) km/h $($r.viento_dir)"
Write-Output "  Presion     : $($r.presion_hpa) hPa"
if ($null -ne $r.uv) { Write-Output "  Indice UV   : $($r.uv)" }
Write-Output ''
Write-Output 'Pronostico:'
foreach ($d in $r.pronostico) {
    Write-Output ("  {0}  min {1,5} C  max {2,5} C  lluvia {3,5} mm  {4}" -f `
        $d.fecha, $d.min_c, $d.max_c, $d.lluvia_mm, $d.descripcion)
}
