# 🧳 TravelCheck

App móvil (PWA) para preparar viajes sin olvidar nada. A partir de **destino, fechas, transporte, alojamiento, tipo de viaje, acompañantes y el tiempo previsto** genera automáticamente:

- **Maleta**: lista por categorías con cantidades calculadas (ropa según los días, pañales según bebés y días...).
- **Documentación**: DNI o pasaporte, visado, Tarjeta Sanitaria Europea o seguro de viaje, carné y papeles del coche, tarjetas de embarque...
- **Tareas antes de salir** con fecha: check-in online, revisar pasaporte, avisar al banco, roaming, revisar el coche, regar plantas, cerrar gas y agua...
- **Tiempo del destino** (Open-Meteo): previsión real hasta 15 días vista; para viajes más lejanos, estimación con los datos del mismo periodo del año anterior. La lista se reajusta sola cuando cambia la previsión (paraguas si llueve, abrigo si hace frío, bañador y protector si hace calor...).

Además:
- Marca lo que ya has guardado, cambia cantidades, elimina lo que no necesites (no vuelve a aparecer) y añade tus propios elementos y tareas.
- Tiene en cuenta si el destino está fuera de España/UE: enchufes (adaptador), moneda, roaming, vacunas, permiso internacional de conducir.
- Funciona **sin conexión** una vez instalada. Los datos se guardan **solo en tu móvil** (con opción de exportar/importar copia de seguridad en Ajustes).

## Instalar en el móvil

La app se publica con GitHub Pages:

1. En GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Haz merge de los cambios a `main`; el workflow `.github/workflows/pages.yml` ejecuta los tests y publica la web en `https://<usuario>.github.io/TravelCheck/`.
3. Abre esa dirección en el móvil:
   - **Android (Chrome)**: menú ⋮ → *Instalar aplicación*.
   - **iPhone (Safari)**: botón compartir → *Añadir a pantalla de inicio*.

> GitHub Pages es gratis para repositorios públicos. Si el repositorio es privado, necesitas un plan de pago de GitHub (o publicarla en otro hosting estático como Netlify o Cloudflare Pages: basta con subir la carpeta tal cual).

## Desarrollo

No hay dependencias ni paso de compilación: HTML, CSS y JavaScript (módulos ES).

```bash
npm start      # sirve la app en http://localhost:8080
npm test       # tests del motor de reglas (Node 18+)
```

Estructura:

| Archivo | Qué hace |
| --- | --- |
| `js/rules.js` | Motor de reglas: genera maleta y tareas a partir del viaje y el tiempo |
| `js/weather.js` | Búsqueda de destinos y tiempo con Open-Meteo |
| `js/countries.js` | Datos por país: UE, euro, enchufes, moneda, roaming |
| `js/app.js` | Interfaz, navegación y almacenamiento local |
| `sw.js` | Service worker para uso sin conexión |

Para añadir o cambiar recomendaciones, edita `js/rules.js` (cada elemento tiene una clave estable para conservar lo que hayas marcado).
