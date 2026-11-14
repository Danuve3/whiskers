// Catálogo de razas: silueta base + orejas, cola, hocico, talla y variantes de pelaje.
import type { ColorName, RampName } from '../gfx/palette.ts';
import type { Shape } from './quadruped.ts';
import type { Coat, Look, Pattern } from './animals.ts';

// ---------------------------------------------------------------- Siluetas base (8)
const catShort: Shape = {
  species: 'cat', legH: 8.5, bodyLen: 10, chest: [6, 5.2, 5.8], hips: [6.2, 5.4, 6], belly: [7.6, 5.2, 5.4], tuck: 0.2,
  neckLen: 5, neckR: 3.8, neckAngle: 1.05, head: [6.6, 7.2, 6.3], snout: [2.2, 3.0, 1.9], snoutLen: 5.6, stop: 1.9,
  ear: 'cat', earSize: 6.2, tail: 'cat', tailLen: 15, tailR: 1.9, legR: [2.3, 1.9], paw: 2.2, legSpread: 2.9, fluff: 0, eyeSize: 3,
};
const catLong: Shape = { ...catShort, fluff: 1.5, legH: 7.8, chest: [6.6, 5.8, 6.2], hips: [6.6, 6, 6.2], belly: [8, 5.8, 5.8], tail: 'fluffy', tailR: 2.1, earSize: 5.4 };
const catHairless: Shape = { ...catShort, fluff: -0.7, ear: 'big', earSize: 7.6, legR: [1.9, 1.5], tail: 'whip', tailR: 1.35, tailLen: 16, head: [6.3, 6.8, 6.1], snout: [2.2, 2.6, 1.8] };
const dogTiny: Shape = {
  species: 'dog', legH: 6.5, bodyLen: 8, chest: [5, 4, 4.6], hips: [4.6, 3.8, 4.2], belly: [6, 3.8, 4], tuck: 0.6,
  neckLen: 3.6, neckR: 2.6, neckAngle: 1.1, head: [5.4, 5.8, 5.2], snout: [2, 2.2, 1.6], snoutLen: 5, stop: 1.6,
  ear: 'big', earSize: 6.2, tail: 'curl', tailLen: 9, tailR: 1.1, legR: [1.4, 1.1], paw: 1.3, legSpread: 2.2, fluff: 0, eyeSize: 3,
};
const sighthound: Shape = {
  species: 'dog', legH: 23, bodyLen: 21, chest: [8.5, 5, 8.2], hips: [6.8, 4.4, 5], belly: [9, 3.6, 3.4], tuck: 2.6,
  neckLen: 9, neckR: 2.9, neckAngle: 0.62, head: [4.6, 3.3, 3.7], snout: [5.2, 2.0, 2.0], snoutLen: 6.2, stop: 1.0,
  ear: 'rose', earSize: 4.4, tail: 'whip', tailLen: 22, tailR: 1.25, legR: [2.0, 1.15], paw: 1.6, legSpread: 2.8, fluff: 0, eyeSize: 2,
};
const longLow: Shape = {
  species: 'dog', legH: 5.5, bodyLen: 20, chest: [7, 4.6, 5.2], hips: [5.6, 4.2, 4.6], belly: [10, 4.4, 4.6], tuck: 0.2,
  neckLen: 5, neckR: 2.8, neckAngle: 0.8, head: [4.6, 3.8, 4], snout: [4.4, 2.2, 2.1], snoutLen: 5.4, stop: 1,
  ear: 'long', earSize: 5.2, tail: 'whip', tailLen: 12, tailR: 1.4, legR: [1.9, 1.6], paw: 1.7, legSpread: 2.7, fluff: 0, eyeSize: 2,
};
const dogMedium: Shape = {
  species: 'dog', legH: 14, bodyLen: 15, chest: [7, 4.8, 6.4], hips: [6, 4.4, 5.2], belly: [8, 4.4, 4.6], tuck: 1,
  neckLen: 6.5, neckR: 3.2, neckAngle: 0.9, head: [5, 4.4, 4.6], snout: [3.6, 2.5, 2.4], snoutLen: 5.2, stop: 1.4,
  ear: 'fold', earSize: 4.6, tail: 'sabre', tailLen: 13, tailR: 1.6, legR: [2, 1.5], paw: 1.8, legSpread: 2.8, fluff: 0, eyeSize: 2,
};
const dogLarge: Shape = {
  species: 'dog', legH: 18, bodyLen: 21, chest: [9, 6, 8], hips: [7.6, 5.6, 6.6], belly: [10, 5.8, 6.2], tuck: 0.6,
  neckLen: 7.5, neckR: 4.4, neckAngle: 0.85, head: [5.8, 5.2, 5.4], snout: [4.2, 3, 2.8], snoutLen: 6.2, stop: 1.6,
  ear: 'drop', earSize: 5.6, tail: 'otter', tailLen: 15, tailR: 2.4, legR: [2.8, 2.1], paw: 2.4, legSpread: 3.4, fluff: 0, eyeSize: 2,
};

export const BASES = { catShort, catLong, catHairless, dogTiny, sighthound, longLow, dogMedium, dogLarge };

export function scaleShape(S: Shape, k: number): Shape {
  const v = (a: [number, number, number]): [number, number, number] => [a[0] * k, a[1] * k, a[2] * k];
  return {
    ...S, legH: S.legH * k, bodyLen: S.bodyLen * k, chest: v(S.chest), hips: v(S.hips), belly: v(S.belly), tuck: S.tuck * k,
    neckLen: S.neckLen * k, neckR: S.neckR * k, head: v(S.head), snout: v(S.snout), snoutLen: S.snoutLen * k, stop: S.stop * k,
    earSize: S.earSize * k, tailLen: S.tailLen * k, tailR: S.tailR * k, legR: [S.legR[0] * k, S.legR[1] * k], paw: S.paw * k, legSpread: S.legSpread * k,
  };
}

// ---------------------------------------------------------------- Pelajes
type C = Partial<Coat> & { base: RampName };
function coat(c: C): Coat {
  return {
    second: c.base, light: 'white', pattern: 'solid', whiteChest: false, socks: false,
    eye: 'veg4', nose: 'pink', seed: 1, ...c,
  } as Coat;
}

export interface Breed {
  id: string;
  name: string;
  species: 'cat' | 'dog';
  base: keyof typeof BASES;
  shape: Shape;
  coats: Coat[];
  /** nombres de las variantes de color */
  coatNames: string[];
  /** frecuencia relativa de aparición */
  weight: number;
  blurb: string;
}

function breed(id: string, name: string, base: keyof typeof BASES, shape: Partial<Shape>, coats: [string, C][], weight: number, blurb: string): Breed {
  const s = { ...BASES[base], ...shape };
  return { id, name, species: s.species, base, shape: s, coats: coats.map(([, c]) => coat(c)), coatNames: coats.map(([n]) => n), weight, blurb };
}

const CAT_EYES: ColorName[] = ['veg4', 'mustard', 'tile3', 'veg3'];

export const BREEDS: Breed[] = [
  // ---------------- Gatos
  breed('europeo', 'Común europeo atigrado', 'catShort', {}, [
    ['pardo', { base: 'wood', second: 'woodDark', pattern: 'tabby', whiteChest: true }],
    ['gris', { base: 'grey', second: 'black', pattern: 'tabby', whiteChest: true, eye: 'mustard' }],
  ], 10, 'El gato de toda la vida. Rayas, una «M» en la frente y opiniones firmes.'),
  breed('negro', 'Negro', 'catShort', {}, [
    ['negro', { base: 'black', pattern: 'solid', eye: 'mustard', nose: 'ink' }],
    ['negro con corbata', { base: 'black', pattern: 'solid', whiteChest: true, eye: 'mustard', nose: 'ink' }],
  ], 8, 'Elegante, misterioso y, en realidad, un poco torpe.'),
  breed('naranja', 'Naranja', 'catShort', { chest: [6.4, 5.6, 6], belly: [8, 5.6, 5.8] }, [
    ['naranja', { base: 'orange', second: 'orangeDark', pattern: 'tabby', whiteChest: true, eye: 'tile4', nose: 'rose' }],
    ['crema', { base: 'cream', second: 'fawn', pattern: 'tabby', whiteChest: true, eye: 'mustard', nose: 'pink' }],
  ], 8, 'Comparten una única neurona entre todos. Hoy le toca a otro.'),
  breed('bicolor', 'Bicolor', 'catShort', {}, [
    ['blanco y negro', { base: 'black', pattern: 'bicolor', whiteChest: true, socks: true, eye: 'veg4', nose: 'pink' }],
    ['blanco y gris', { base: 'grey', pattern: 'bicolor', whiteChest: true, socks: true, eye: 'mustard', nose: 'pink' }],
  ], 7, 'Lleva esmoquin a todas horas, por si acaso.'),
  breed('carey', 'Carey', 'catShort', {}, [
    ['carey', { base: 'black', second: 'orange', pattern: 'tortie', eye: 'mustard', nose: 'rose' }],
  ], 5, 'Pelaje de concha y carácter de tormenta de verano.'),
  breed('calico', 'Calicó', 'catShort', {}, [
    ['calicó', { base: 'orange', second: 'black', pattern: 'calico', whiteChest: true, socks: true, eye: 'veg4', nose: 'pink' }],
  ], 5, 'Tres colores y ni una sola duda.'),
  breed('siames', 'Siamés', 'catShort', { legH: 9.5, bodyLen: 11, chest: [5.6, 4.6, 5.2], hips: [5.8, 4.8, 5.4], belly: [7, 4.6, 4.8], snoutLen: 6.2, earSize: 7, tailLen: 17, tailR: 1.5 }, [
    ['punta foca', { base: 'cream', second: 'woodDark', pattern: 'point', eye: 'sky', nose: 'ink' }],
    ['punta azul', { base: 'white', second: 'grey', pattern: 'point', eye: 'sky', nose: 'ink2' }],
  ], 3, 'Habla. Mucho. Sobre todo a las seis de la mañana.'),
  breed('persa', 'Persa', 'catLong', { head: [6.8, 7.6, 6.4], snout: [1.5, 2.6, 1.5], snoutLen: 5.9, stop: 2.3, earSize: 4.4 }, [
    ['blanco', { base: 'white', pattern: 'solid', eye: 'tile3', nose: 'pink', tex: 'shaggy' }],
    ['crema', { base: 'cream', pattern: 'solid', eye: 'tile3', nose: 'pink', tex: 'shaggy' }],
  ], 2, 'Una nube con cara de pocos amigos. Pura ternura.'),
  breed('mainecoon', 'Maine Coon', 'catLong', { ...scaleShape(catLong, 1.22), ear: 'tuft', fluff: 1.1, tailLen: 20 }, [
    ['atigrado pardo', { base: 'wood', second: 'woodDark', pattern: 'tabby', whiteChest: true, eye: 'mustard', nose: 'rose', tex: 'shaggy' }],
  ], 2, 'Un gigante amable con pinceles en las orejas.'),
  breed('azulruso', 'Azul ruso', 'catShort', { legH: 9.2, chest: [5.8, 4.8, 5.4], snoutLen: 5.9, earSize: 6.8 }, [
    ['azul', { base: 'blueGrey', pattern: 'solid', eye: 'veg3', nose: 'ink2' }],
  ], 3, 'Gris plata, ojos verdes y una timidez de libro.'),
  breed('bengali', 'Bengalí', 'catShort', { legH: 9.4, bodyLen: 11.5 }, [
    ['dorado', { base: 'gold', second: 'woodDark', pattern: 'spots', whiteChest: true, eye: 'veg4', nose: 'rose' }],
  ], 2, 'Leopardo de salón. Le encanta el agua de la fuente.'),
  breed('esfinge', 'Esfinge', 'catHairless', {}, [
    ['rosado', { base: 'sphynx', pattern: 'solid', eye: 'veg4', nose: 'rose', tex: 'wrinkle' }],
  ], 1, 'Sin pelo, con mucho corazón. Busca mantas calentitas.'),
  // ---------------- Perros
  breed('chihuahua', 'Chihuahua', 'dogTiny', {}, [
    ['canela', { base: 'fawn', pattern: 'solid', whiteChest: true, eye: 'ink', nose: 'ink' }],
    ['negro y fuego', { base: 'black', second: 'orange', pattern: 'blackTan', eye: 'ink', nose: 'ink' }],
  ], 6, 'Diez centímetros de valentía y temblores.'),
  breed('galgo', 'Galgo', 'sighthound', {}, [
    ['arena', { base: 'fawn', second: 'wood', pattern: 'solid', whiteChest: true, socks: true, eye: 'ink', nose: 'ink' }],
    ['atigrado', { base: 'wood', second: 'woodDark', pattern: 'brindle', whiteChest: true, eye: 'ink', nose: 'ink' }],
    ['negro', { base: 'black', pattern: 'solid', whiteChest: true, eye: 'ink', nose: 'ink' }],
  ], 6, 'Corre como el viento y luego duerme dieciocho horas.'),
  breed('galgoit', 'Galgo italiano', 'sighthound', { ...scaleShape(sighthound, 0.6), eyeSize: 2 }, [
    ['azul', { base: 'blueGrey', pattern: 'solid', whiteChest: true, eye: 'ink', nose: 'ink2' }],
    ['isabela', { base: 'fawn', pattern: 'solid', whiteChest: true, eye: 'ink', nose: 'ink' }],
  ], 3, 'Un galgo de bolsillo que tirita con elegancia.'),
  breed('salchicha', 'Perro salchicha', 'longLow', {}, [
    ['rojo', { base: 'orange', pattern: 'solid', eye: 'ink', nose: 'ink' }],
    ['negro y fuego', { base: 'black', second: 'orange', pattern: 'blackTan', eye: 'ink', nose: 'ink' }],
  ], 6, 'Medio perro de alto por perro y medio de largo.'),
  breed('podenco', 'Podenco', 'sighthound', {
    legH: 18, bodyLen: 17, chest: [7, 4.4, 6.6], hips: [5.8, 4, 4.6], belly: [7.6, 3.4, 3.2], tuck: 2, neckLen: 7.5, neckR: 2.6, neckAngle: 0.8,
    head: [4.4, 3.4, 3.8], snout: [4.4, 1.9, 1.9], snoutLen: 5.6, ear: 'prick', earSize: 6.6, tail: 'sabre', tailLen: 15, tailR: 1.3, legR: [1.8, 1.1], paw: 1.5, legSpread: 2.6,
  }, [
    ['rojo y blanco', { base: 'orange', pattern: 'bicolor', whiteChest: true, socks: true, eye: 'mustard', nose: 'rose' }],
    ['canela', { base: 'cinnamon', pattern: 'solid', whiteChest: true, eye: 'mustard', nose: 'rose' }],
  ], 5, 'Orejas de radar y nariz de detective.'),
  breed('mestizo', 'Mestizo canelo', 'dogMedium', {}, [
    ['canelo', { base: 'cinnamon', pattern: 'solid', whiteChest: true, eye: 'ink', nose: 'ink' }],
    ['canelo con calcetines', { base: 'cinnamon', pattern: 'solid', whiteChest: true, socks: true, eye: 'ink', nose: 'ink' }],
  ], 10, 'De ninguna raza y de todas las calles. El mejor amigo.'),
  breed('bodeguero', 'Bodeguero', 'dogMedium', {
    legH: 10, bodyLen: 12, chest: [5.8, 4, 5.2], hips: [5, 3.8, 4.4], belly: [6.6, 3.8, 4], tuck: 0.8, neckLen: 5, neckR: 2.6, neckAngle: 1,
    head: [4.4, 4, 4.2], snout: [3, 2.1, 2], snoutLen: 4.6, stop: 1.2, ear: 'prick', earSize: 4.4, tail: 'sabre', tailLen: 8, tailR: 1.2, legR: [1.7, 1.3], paw: 1.5, legSpread: 2.4,
  }, [
    ['tricolor', { base: 'white', second: 'black', third: 'orange', pattern: 'patches', eye: 'ink', nose: 'ink' }],
  ], 6, 'Cazador de ratones de bodega, jubilado con honores.'),
  breed('beagle', 'Beagle', 'dogMedium', { legH: 12, ear: 'long', earSize: 5.6, tail: 'sabre', tailLen: 11, tailR: 1.5, chest: [6.8, 4.8, 6], hips: [6, 4.6, 5.2], belly: [8, 4.6, 4.8] }, [
    ['tricolor', { base: 'cinnamon', second: 'black', pattern: 'tricolor', whiteChest: true, socks: true, eye: 'ink', nose: 'ink', tailTip: true }],
  ], 4, 'Sigue su nariz a cualquier parte. Su nariz no sabe volver.'),
  breed('bulldog', 'Bulldog francés', 'dogMedium', {
    legH: 7.5, bodyLen: 11, chest: [6.6, 5.6, 6.2], hips: [5.2, 4.6, 4.8], belly: [7, 5, 5], tuck: 0.8, neckLen: 3.5, neckR: 4, neckAngle: 1,
    head: [5.8, 6.2, 5.4], snout: [1.8, 3.2, 2.2], snoutLen: 5.4, stop: 1.6, ear: 'bat', earSize: 5.4, tail: 'stub', tailLen: 3, tailR: 1.4, legR: [2.2, 1.8], paw: 1.8, legSpread: 3.2, eyeSize: 3, jowls: true,
  }, [
    ['atigrado', { base: 'woodDark', second: 'black', pattern: 'brindle', whiteChest: true, eye: 'ink', nose: 'ink' }],
    ['leonado', { base: 'fawn', pattern: 'solid', mask: true, second: 'black', eye: 'ink', nose: 'ink' }],
  ], 4, 'Ronca, resopla y te mira como si fueras lo mejor del mundo.'),
  breed('carlino', 'Carlino', 'dogMedium', {
    legH: 7.5, bodyLen: 11, chest: [6.4, 5.4, 6], hips: [6, 5.2, 5.6], belly: [7.6, 5.4, 5.6], tuck: 0, neckLen: 3, neckR: 4, neckAngle: 1,
    head: [5.8, 6, 5.6], snout: [1.7, 3, 2.2], snoutLen: 5.4, ear: 'fold', earSize: 3.6, tail: 'curl', tailLen: 8, tailR: 1.6, legR: [2, 1.7], paw: 1.7, legSpread: 3, eyeSize: 3, jowls: true,
  }, [
    ['leonado', { base: 'fawn', second: 'black', pattern: 'solid', mask: true, eye: 'ink', nose: 'ink' }],
    ['negro', { base: 'black', pattern: 'solid', eye: 'ink', nose: 'ink' }],
  ], 4, 'Una croqueta con patas y un suspiro constante.'),
  breed('caniche', 'Caniche', 'dogMedium', {
    legH: 14, bodyLen: 12, chest: [6.2, 4.6, 6], hips: [5.6, 4.4, 5], belly: [7, 4.2, 4.4], neckLen: 7, neckR: 3, neckAngle: 1.15,
    head: [4.6, 4.2, 4.8], snout: [3.6, 1.9, 1.9], ear: 'drop', earSize: 5.6, tail: 'plume', tailLen: 7, tailR: 2.2, legR: [1.8, 1.4], paw: 2.2, legSpread: 2.6, fluff: 1.4, pompom: true,
  }, [
    ['albaricoque', { base: 'apricot', pattern: 'solid', eye: 'ink', nose: 'wood1', tex: 'curly' }],
    ['blanco', { base: 'white', pattern: 'solid', eye: 'ink', nose: 'ink', tex: 'curly' }],
    ['negro', { base: 'black', pattern: 'solid', eye: 'ink', nose: 'ink', tex: 'curly' }],
  ], 3, 'Peinado impecable incluso bajo el orballo.'),
  breed('pastor', 'Pastor alemán', 'dogLarge', {
    legH: 20, bodyLen: 23, chest: [9, 5.6, 8], hips: [7.4, 5.2, 6.4], belly: [10, 5.2, 5.6], tuck: 1.4, neckLen: 9, neckR: 4, neckAngle: 0.75,
    head: [5.6, 4.8, 5], snout: [5, 2.6, 2.6], snoutLen: 6.6, ear: 'prick', earSize: 7, tail: 'sabre', tailLen: 18, tailR: 2.2, legR: [2.6, 1.8], paw: 2.2, legSpread: 3.2, fluff: 0.4,
  }, [
    ['negro y fuego', { base: 'tanFire', second: 'black', pattern: 'saddle', mask: true, eye: 'ink', nose: 'ink' }],
  ], 4, 'Serio por fuera, peluche por dentro.'),
  breed('labrador', 'Labrador', 'dogLarge', {}, [
    ['dorado', { base: 'fawn', pattern: 'solid', eye: 'ink', nose: 'ink' }],
    ['negro', { base: 'black', pattern: 'solid', eye: 'ink', nose: 'ink' }],
    ['chocolate', { base: 'chocolate', pattern: 'solid', eye: 'mustard', nose: 'wood1' }],
  ], 5, 'Sonrisa permanente y estómago sin fondo.'),
  breed('mastin', 'Mastín', 'dogLarge', {
    legH: 23, bodyLen: 26, chest: [11.5, 7.6, 10.5], hips: [9.2, 7, 8.4], belly: [12.5, 7.4, 8.4], tuck: 0.8, neckLen: 8, neckR: 6, neckAngle: 0.7,
    head: [7.2, 6.8, 6.8], snout: [5, 4.2, 4], snoutLen: 7.2, stop: 2.6, ear: 'drop', earSize: 7, tail: 'sabre', tailLen: 20, tailR: 2.8, legR: [3.6, 2.8], paw: 3.2, legSpread: 4.2, fluff: 0.3, jowls: true,
  }, [
    ['leonado', { base: 'fawn', second: 'woodDark', pattern: 'solid', mask: true, eye: 'ink', nose: 'ink' }],
    ['atigrado', { base: 'wood', second: 'woodDark', pattern: 'brindle', mask: true, eye: 'ink', nose: 'ink' }],
  ], 3, 'Guardián de rebaños con alma de abuelo bonachón.'),
];

export const BREED_BY_ID: Record<string, Breed> = Object.fromEntries(BREEDS.map((b) => [b.id, b]));

export type Rare = 'heterocromia' | 'calicoMacho' | 'lunar' | null;

/** Construye el aspecto de un animal concreto (variante de color + semilla de patrón + rarezas). */
export function makeLook(breedId: string, variant: number, seed: number, rare: Rare = null): Look {
  const b = BREED_BY_ID[breedId];
  let c: Coat = { ...b.coats[variant % b.coats.length], seed };
  if (b.species === 'cat' && c.eye === 'veg4' && seed % 3 === 1) c.eye = CAT_EYES[seed % CAT_EYES.length];
  if (rare === 'heterocromia') c = { ...c, eye: 'sky', eye2: 'mustard', pattern: c.pattern === 'solid' ? 'solid' : c.pattern, base: c.base };
  if (rare === 'lunar') c = { ...c, base: 'silver', second: 'blue', pattern: 'solid' as Pattern, eye: 'butter', nose: 'pink', special: 'moon', whiteChest: true };
  if (rare === 'calicoMacho') c = { ...c, eye: 'mustard' };
  return { key: `${breedId}-${variant}-${seed}-${rare ?? ''}`, shape: b.shape, coat: c };
}
