# Whiskers · Biblia de arte

Documento de referencia para todo el arte del juego. Cualquier sprite, efecto o pieza de
interfaz se revisa contra esta biblia antes de darlo por bueno.

## 1. Identidad

**Un casco antiguo del norte de España al que dan ganas de mudarse.** Piedra granítica con
musgo, fachadas encaladas, galerías acristaladas blancas, tejados de teja, geranios en los
balcones, ropa tendida, la panadería que echa vapor por la mañana, un quiosco, una fuente
que suena y un puertito con barcas de colores. Llueve a menudo, y está bien: la lluvia
también es acogedora.

Palabras clave: **cálido, suave, húmedo, artesanal, tranquilo.**
Lo que evitamos: el negro puro, los colores saturados en el decorado, el ruido de textura,
el aspecto de “render 3D” y el de asset pack genérico.

## 2. Proyección y escala

| Concepto | Valor |
|---|---|
| Proyección | Isométrica 2:1 (dimétrica de pixel art) |
| Tile de suelo | 64 × 32 px |
| Alturas | múltiplos de 16 px (planta baja 96 px, plantas altas 80 px) |
| Rejilla de vóxeles | 16 × 16 vóxeles por tile; 1 vóxel de altura = 1 px |
| Paso de un vóxel | eje X → (+2, +1) px · eje Y → (−2, +1) px · eje Z → (0, −1) px |
| Personaje | ~56 px de alto (proporción chibi, cabeza grande) |
| Gatos | 34–42 px · Perros: chihuahua ~30 px, medianos ~48 px, mastín ~62 px |

- Las aristas horizontales del mundo caen siempre en patrón **2:1 exacto** (2 px en horizontal
  por 1 en vertical). Esto lo garantiza la proyección: las esquinas de los vóxeles caen en
  coordenadas enteras y el muestreo es por centro de píxel.
- El zoom es siempre entero (×1, ×2, ×3… en píxeles de dispositivo), con
  `imageSmoothingEnabled = false`, y la cámara se dibuja en posiciones de píxel entero.

## 3. Luz

- La luz principal viene **siempre de arriba a la izquierda**. Vector hacia la luz en
  coordenadas del mundo: `L = normalize(−0.5, +0.5, 1)`.
- En cualquier volumen: **cara superior = la más clara** (tono 3), **cara izquierda (+Y) =
  tono medio** (tono 2) y **cara derecha (+X) = sombra** (tono 1).
- Las sombras proyectadas bajan un tono. La oclusión ambiental (rincones, pie de los muros)
  baja otro. El tono 4 se reserva para los brillos (aristas iluminadas, reflejos) y el 0
  para las sombras profundas y los contornos.
- Las sombras proyectadas caen hacia abajo a la derecha en pantalla.

## 4. Color

### Paleta maestra (44 colores)

| Material | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| Piedra / adoquín | `#3b3149` | `#5a4e68` | `#7d7289` | `#a39aa8` | `#cfc6c4` |
| Teja / ladrillo | `#4a2430` | `#7a3a3a` | `#a8573f` | `#d2804f` | `#f0b27a` |
| Madera | `#3d2a2e` | `#5e3f36` | `#85603f` | `#b08a57` | `#d9b77e` |
| Vegetación | `#1f3a3d` | `#2f5d4a` | `#4c8a4f` | `#7fb85a` | `#c2de7a` |
| Agua | `#1c2f4f` | `#2a4f78` | `#3f7ea3` | `#6fb2c4` | `#b5e3e0` |
| Cal / crema | `#6b5a6e` | `#9c8a8f` | `#c9b8a8` | `#ead9c0` | `#fff4dc` |

- Acentos: `#e86a5c` coral · `#f2c14e` mostaza · `#7ec4cf` cielo · `#c98bd1` lila
- Noche: tinte `#2b2d5c` · luz de farola `#ffd27a`
- Extras: tinta `#1d1828` y `#2e2639` (hierro, pelaje negro, pupilas) · rosa `#f4a3a8` ·
  rosa viejo `#c4626e` · ciruela `#8e5fa8` · mantequilla `#fbe7a1` · melocotón `#f7d3b5` ·
  canela `#e3a582`

La fuente de verdad es `src/gfx/palette.ts`. El techo es de 48 colores.

### Reglas

- **Rampas con cambio de tono**: las sombras viran hacia el azul o el violeta y las luces
  hacia el amarillo cálido. Nunca oscurecemos ni aclaramos “en gris”.
- Iluminar es **mover un índice dentro de la rampa**, no mezclar colores. Por eso todo el
  arte horneado está cuantizado a la paleta por construcción.
- Hay rampas compuestas (hierro, granito, rojo, amarillo, azul, violeta, blanco, cristal,
  otoño y nieve) que reutilizan colores de la paleta.
- **Legibilidad**: el decorado usa sobre todo piedra, cal, madera, teja y vegetación
  (rampas apagadas). Los animales y el personaje usan los tonos más limpios y los acentos,
  y siempre llevan contorno, así que destacan en cualquier fondo. Prueba: mirar la captura a
  ×1 durante un segundo; los animales tienen que verse al instante.

## 5. Técnica de píxel

- **Contorno selectivo (sel-out)**: el borde exterior usa el tono más oscuro del propio
  material (nunca negro puro) y se aclara un tono en el lado iluminado (arriba-izquierda).
- **Pocas líneas interiores**: solo donde una pieza se superpone a otra (una pata delante
  del vientre, la galería delante de la fachada).
- Antialiasing manual solo en curvas. Prohibido dejar píxeles huérfanos (un píxel aislado
  de un color distinto a todos sus vecinos), ruido, *pillow shading* (sombrear desde el
  centro hacia fuera) o degradados suaves.
- **Tramado (dithering)** solo puntual: agua profunda, cielo y transiciones de niebla.
- **Sombras de contacto**: todo lo que se apoya en el suelo lleva una elipse de 1–2 tonos
  bajo los pies o la base.
- **Texturas sugeridas**: en un tile de adoquín se marcan unas pocas juntas y algunos
  brillos, no cada piedra. Igual con la teja (hileras alternas) y la madera (vetas
  sueltas).

## 6. Pipeline

### Escenario (vóxeles → sprites, en el build)
1. Cada pieza se modela en código como vóxeles: material, id de objeto y, opcionalmente, una
   normal (tejados inclinados, piedra redonda de la fuente).
2. Se trazan rayos ortográficos por centro de píxel con un DDA en la dirección de la vista
   `(−1, −1, −2)`. La cara por la que entra el rayo (superior, izquierda o derecha) o la
   normal del vóxel decide el tono base.
3. Encima se aplican textura del material, sombra proyectada (rayo hacia `L`) y oclusión
   ambiental. Todo son desplazamientos de índice dentro de la rampa.
4. Sel-out y limpieza de píxeles huérfanos.
5. **Retoques a mano**: calcomanías de píxeles dibujadas en el espacio de la fachada
   (ventanas, cortinas, macetas, carteles, musgo, desconchones) que se proyectan con el
   cizallado 2:1 de su cara.
6. Empaquetado en atlas PNG + JSON de frames (en `public/gen/`, dentro del precache de la
   PWA).

Los edificios salen de **piezas modulares**: planta baja, fachada de piedra o encalada,
galería, balcón, tejado, puerta y retoques, combinados con semilla.

### Animales y personaje (en tiempo de ejecución)
- Se componen por **capas indexadas**: cuerpo, patas lejanas, patas cercanas, cabeza,
  orejas, cola y cara. Cada capa se rasteriza píxel a píxel con reglas de pixel art (luz
  cuantizada a la rampa, sel-out, limpieza). Ojos, nariz, boca, marcas y detalles
  especiales son **matrices dibujadas a mano** que se estampan sobre la cabeza.
- Cada raza = silueta base + orejas + cola + hocico + rampas de pelaje + patrón (atigrado,
  manchas, bicolor, carey, punta de color…).
- Se generan las **cuatro diagonales** con la luz bien orientada (no se refleja la luz al
  hacer espejo). Las variantes se cachean en canvas offscreen.

## 7. Animación

- Principios: anticipación, *squash & stretch* sutil (±1 px) y movimiento secundario (cola,
  orejas, ropa, pelo).
- Andar de 8 frames, trote de 6 frames e idle con respiración de 1 px más parpadeo
  aleatorio.
- Transiciones entre estados (sentarse, tumbarse, levantarse) en vez de cortes bruscos.
- **Tiempos variables por frame**: los contactos duran más que los pasos intermedios y las
  pausas se mantienen.

## 8. Vida ambiental

Hojas que caen, mariposas de día, luciérnagas de noche, palomas que se posan y salen
volando, humo de chimeneas, vapor en la panadería, ropa tendida que se mece, ondas en la
fuente y en el agua del puerto, charcos con reflejo cuando llueve, gotas que salpican,
farolas con un leve parpadeo, ventanas que se encienden al anochecer y sombras de nubes que
cruzan el suelo. Todas las partículas salen de pools y se dibujan en píxeles enteros con
colores de la paleta.

## 9. Día y noche

- Nada de capas negras semitransparentes. Se aplica un **tinte por canal** (multiplicar con
  un color por momento del día) más un levantamiento de sombras hacia `#2b2d5c` de noche:

| Momento | Tinte | Sensación |
|---|---|---|
| Amanecer | rosado | frío limpio, rosas en la cal |
| Mediodía | neutro | paleta tal cual |
| Atardecer | dorado | sombras lilas, luces naranjas |
| Noche | azul `#2b2d5c` | la cal se vuelve lavanda |

- Las luces (farolas, ventanas, escaparates) se pintan **después** del tinte: charcos de
  luz `#ffd27a` en escalones de píxel concéntricos (2–3 anillos), sin blur.

## 10. Interfaz

- Paneles de madera clara con papel crema, esquinas trabajadas y clavos. Hojas inferiores
  que se manejan con el pulgar.
- Iconos de 16 y 24 px dibujados a mano con la misma paleta y contorno de tinta.
- Tipografía: Pixelify Sans (OFL), a tamaños enteros.

## 11. Lista de comprobación (cada iteración)

1. Líneas 2:1 limpias, sin dientes de sierra.
2. Luz coherente desde arriba a la izquierda en todo.
3. Rampas con cambio de tono, sin oscurecer “en gris”.
4. Contornos selectivos, nunca negro puro.
5. Animales legibles al instante en cualquier fondo.
6. Sin ruido ni píxeles sueltos.
7. Encanto y personalidad: ¿dan ganas de vivir ahí y de achuchar al gato?
