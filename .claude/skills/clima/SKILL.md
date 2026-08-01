---
name: clima
description: Consulta el clima actual y el pronostico desde la terminal, sin API key ni registro. Por defecto Buenos Aires, Argentina; acepta otra ciudad o deteccion por IP. Usar cuando el usuario pregunte por el clima, el tiempo, la temperatura, si va a llover, el pronostico, o escriba /clima.
---

# Clima

Obtiene clima actual + pronostico ejecutando un script local. Sin API key, sin cuenta, sin dependencias.

**Ubicacion por defecto: Buenos Aires, Argentina.** Si el usuario no nombra una ciudad, ejecuta el script sin `-Ciudad`.

## Ejecutar

Buenos Aires, Argentina (default, 2 dias de pronostico):

```powershell
powershell -ExecutionPolicy Bypass -File .claude/skills/clima/scripts/clima.ps1
```

Otra ciudad y 3 dias:

```powershell
powershell -ExecutionPolicy Bypass -File .claude/skills/clima/scripts/clima.ps1 -Ciudad "Cordoba, AR" -Dias 3
```

Ubicacion real detectada por IP (solo si el usuario lo pide, p. ej. "donde estoy ahora"):

```powershell
powershell -ExecutionPolicy Bypass -File .claude/skills/clima/scripts/clima.ps1 -PorIP
```

Salida JSON (para encadenar con otra logica):

```powershell
powershell -ExecutionPolicy Bypass -File .claude/skills/clima/scripts/clima.ps1 -Json
```

### Parametros

| Parametro | Default | Descripcion |
|---|---|---|
| `-Ciudad` | `"Buenos Aires, Argentina"` | Nombre de ciudad, opcionalmente `"Ciudad, PAIS"` |
| `-PorIP` | off | Ignora `-Ciudad` y geolocaliza por IP |
| `-Dias` | `2` | Dias de pronostico, 1 a 3 (limite de wttr.in) |
| `-Json` | off | Emite el objeto crudo en JSON en vez del texto formateado |
| `-TimeoutSec` | `15` | Timeout por request HTTP |

## Como funciona

1. **wttr.in** (`https://wttr.in/<ciudad>?format=j1&lang=es`) es la fuente primaria: un solo request devuelve clima actual, area detectada y 3 dias por hora, con descripciones ya en espanol.
2. Si wttr.in falla o esta limitado por rate, el script cae automaticamente a **Open-Meteo**:
   - con ciudad (el caso normal, incluido el default Buenos Aires): geocodifica con `geocoding-api.open-meteo.com`;
   - con `-PorIP`: geolocaliza con `ip-api.com`;
   - luego consulta `api.open-meteo.com/v1/forecast` y traduce los codigos WMO a texto en espanol con la tabla `$WMO` del script.
3. Ambas ramas normalizan al mismo objeto de salida, asi que el formato impreso y el JSON son identicos salvo por el campo `fuente` (`wttr.in` u `open-meteo`) y `uv`, que solo trae wttr.in.

Todo el trafico sale por `curl.exe` (viene con Windows 10/11). No se escribe nada en disco ni se cachea.

## Al responder al usuario

- Ejecuta el script y responde con los datos reales; nunca inventes valores ni uses conocimiento previo (el modelo no sabe el clima de hoy).
- Menciona la ubicacion que el script resolvio. Con `-PorIP` puede apuntar al nodo del proveedor y no a la ciudad exacta; si el lugar se ve raro, sugiere repetir con `-Ciudad`.
- Nota las unidades: temperatura en C, viento en km/h, lluvia en mm, presion en hPa.
- El campo `observado` puede venir en UTC cuando la fuente es wttr.in.
- Si ambas fuentes fallan (sin red, firewall, DNS), dilo tal cual con el error del script en vez de estimar.
