# Whiskers

Un juego cozy en pixel art isométrico para móvil en vertical: recorre un barrio de casco
antiguo del norte de España y cuida a los gatos y perros callejeros (comida, agua y alguna
tirita) hasta que te cojan confianza. Sin estrés, sin prisas y sin castigos.

**Juega en:** https://danuve3.github.io/whiskers/ (PWA instalable, funciona sin conexión
después de la primera visita).

## Controles

| Gesto (móvil) | Ratón (escritorio) | Acción |
|---|---|---|
| Tocar el suelo | Clic en el suelo | Caminar (A* sobre la rejilla isométrica) |
| Tocar un animal | Clic en un animal | Menú radial: comida, agua, curar, acariciar, láser (gatos) y ficha |
| Arrastrar | Arrastrar | Mover la cámara (o el punto rojo del láser mientras se juega) |
| Pellizcar | Rueda | Zoom en niveles enteros |
| Tocar a un vecino | Clic | Hablar y ver su encargo |
| Tocar un regalo en el portal | Clic | Guardarlo en la vitrina |
| Tocar un cartel de salida | Clic | Ir andando a esa zona (las cerradas dicen cómo abrirlas) |
| Tocar un comedero o bebedero | Clic | Rellenarlo (8 raciones) |
| Deslizar una hoja hacia abajo | — | Cerrarla |
| Botón «atrás» de Android | Retroceso del navegador | Cerrar la hoja o el menú abierto |

- Arriba a la izquierda, la hora y el tiempo; debajo, la pestaña con los animales de la zona
  (retrato, barras y lo que necesitan; tocar uno lleva hasta él).
- Arriba a la derecha, el mapa del barrio: zonas abiertas, qué falta para abrir las demás, avisos de
  animales que necesitan algo y viaje directo.
- Sobre los animales, bocadillos de necesidad (cuenco, gota o tirita) y «+♥» al ganar confianza.
- Si mueves la cámara, un botón (o esperar unos segundos) la devuelve al personaje.
- Barra inferior: álbum, logros, misiones, armario, decoración y ajustes (mezclador de audio,
  silencio, vibración, recordatorio diario y exportar/importar partida).

## Cómo se juega

- **Confianza (0–5 corazones):** al principio los animales huyen. Después miran desde
  lejos, luego comen si te alejas, más tarde se dejan acercar y al final te siguen y se
  dejan curar. Si no los cuidas, la confianza baja muy despacio y nunca por debajo de la
  mitad de la máxima que alcanzaron. Nadie se muere ni se va para siempre.
- **Comida gratis:** el pienso es ilimitado. Las comidas especiales (atún, sardinas, jamón
  york, galletas, castañas, pollo) llegan con logros, misiones, encargos y la pesca. Cada
  animal tiene una favorita, y acertar da más confianza.
- **Barrio que se amplía:** Rúa do Portal (tu calle) → Praza da Fonte → Alameda, Mercado de
  abastos, O Descampado y O Porto. Las zonas se conectan por la calle baja.
- **Calendario real:** la luz sigue la hora del dispositivo y las horas de sol de Galicia. El
  clima es diario y con semilla (sol, nublado, lluvia, orballo, niebla y nieve en invierno).
  Hay estaciones y fiestas: Samaín, Magosto, Navidad, San Juan, Entroido y el Día de los
  animales. El gato lunar solo aparece en noches de luna llena (fase lunar calculada).
- **Sin moneda:** todo se desbloquea con logros (infinitos y algunos secretos), misiones
  diarias y semanales, encargos de los vecinos y la confianza acumulada.
- **Progreso offline:** al volver (con tope de 48 h) llegan animales nuevos, hay regalos en
  el portal y las necesidades han bajado un poco. Los comederos y bebederos que hayas colocado
  siguen sirviendo raciones mientras no estás. Te lo cuenta la pantalla «Mientras no
  estabas…», y vuelves a la misma zona y casilla en la que lo dejaste.
- **Recordatorio diario (opcional):** si pasa casi un día sin jugar, una notificación suave.
  Funciona en Chrome para Android con Whiskers instalada (Periodic Background Sync).

## Desarrollo

```bash
npm install
npm run dev            # genera el arte y arranca Vite (http://localhost:5173/whiskers/)
npm test               # Vitest: confianza, generación, logros, misiones, offline, calendario, zonas, guardado
npm run build          # arte + comprobación de tipos + build de producción con PWA
npm run shots          # capturas de revisión con Playwright (escenas de juego y galería)
npm run offline-check  # prueba de modo avión sobre el build (requiere npm run build)
```

- Galería de sprites (solo en desarrollo): `/whiskers/dev-sprites.html`, con los parámetros
  `?only=gatos|perros|razas|fila|player|props|tabby|galgo`, `&clip=walk` y `&scale=1|3`.
- Escenas fijas para revisar: `?shot=1&hora=22&clima=lluvia&estacion=invierno&evento=navidad&zona=puerto`.
- `npm run shots` levanta su propio servidor temporal y lo cierra al terminar.
- Playwright usa el Chromium instalado; si no tienes ninguno, ejecuta `npx playwright install chromium`.

## Estructura

```
art/                  Pipeline de arte (Node, en el build)
  voxel/              Mundo de vóxeles disperso, materiales, primitivas y render isométrico
  modules/            Casas modulares y mobiliario (fuente, farolas, puestos, barcas…)
  zones/              Las seis zonas del barrio, modeladas en vóxeles
  decals.ts           Retoques a mano proyectados con el cizallado 2:1 (rótulos, cortinas…)
  zoneRender.ts       Suelo troceado, sprites por objeto, variantes de estación y capas de noche/nieve
  icons.ts            Iconos de la PWA (dibujados a mano)
scripts/              build-art, shots, offline-check, preview-zone y utilidades PNG
src/
  engine/             Vista con zoom entero, cámara en píxel entero, input, proyección y assets
  world/              Zonas, entidades, A*, población y comportamiento de los animales
  sprites/            Rig por capas (animales y personaje), razas, armario
  fx/                 Luz y gradación por momento del día, clima, vida ambiental y fiestas
  sim/                Modelo puro: necesidades/confianza, calendario, clima, progreso, offline
  meta/               Controlador de logros, misiones, regalos y encargos
  audio/              Web Audio: música generativa, ambiente, efectos y mezclador
  ui/                 Interfaz pixel art (marcos 9-slice, iconos, hojas inferiores, título, tutorial)
  save/               Guardado versionado con migraciones y exportar/importar
tests/                Vitest
docs/ART_BIBLE.md     Biblia de arte
docs/art-review/      Capturas finales de cada bucle de revisión visual
```

## Pipeline de arte

1. **Escenario en vóxeles** (`art/`): cada zona se modela en código como un mundo de
   vóxeles. Hay 16 vóxeles por tile y 1 vóxel de altura equivale a 1 px. Un rayo
   ortográfico por centro de píxel, con DDA en la dirección de la vista, encuentra la cara
   visible, y las aristas caen en patrón 2:1 exacto. La luz (siempre desde arriba a la
   izquierda), las sombras proyectadas, la oclusión ambiental y las texturas de material son
   desplazamientos de índice dentro de rampas de la paleta, así que todo sale cuantizado y
   con cambio de tono. Después vienen el contorno selectivo, la limpieza de píxeles
   huérfanos y los **retoques a mano**: matrices de píxeles proyectadas sobre las
   fachadas con su cizallado (rótulos, cortinas, pan en el escaparate, azulejos, musgo,
   desconchones y la rayuela de tiza).
2. **Variantes horneadas:** cada objeto lleva una capa nocturna (ventanas encendidas) y una
   de nieve (caras superiores). Los árboles y las jardineras tienen además una versión por
   estación (otoño, invierno y primavera).
3. **Atlas:** todo se empaqueta en atlas PNG con JSON de metadatos (cajas para la
   ordenación, luces, humo, vapor, ropa tendida y rejilla transitable) en `public/gen/`,
   dentro del precache de la PWA.
4. **Animales y personaje** (`src/sprites/`): se componen por capas indexadas en tiempo de
   ejecución. Cada pieza (tronco, patas con cinemática inversa, cabeza, orejas, cola,
   ropa…) se rasteriza píxel a píxel con luz cuantizada a la rampa, contorno selectivo y
   líneas interiores mínimas. Ojos, narices y expresiones son matrices hechas a mano. Las
   cuatro diagonales se generan con la luz bien orientada. Las 26 razas salen de 8 siluetas
   base y cada animal se cachea en canvas offscreen.

Las reglas de estilo (paleta, proyección, luz y animación) están en `docs/ART_BIBLE.md`.

## Despliegue

`.github/workflows/deploy.yml` compila y despliega en GitHub Pages en cada push a `main`
(`actions/upload-pages-artifact` + `actions/deploy-pages`). En el repositorio, Pages tiene
que estar configurado con *Source: GitHub Actions* (Settings → Pages).
El entorno `github-pages` solo acepta despliegues de la rama por defecto, así que `main`
tiene que ser la rama por defecto (o estar permitida en Settings → Environments).

## Licencias

Código y arte originales del proyecto. Fuente: Pixelify Sans (SIL Open Font License),
empaquetada vía `@fontsource/pixelify-sans`.
