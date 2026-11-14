// Tutorial integrado en el primer día: pistas suaves, sin obligar ni bloquear.
import { el } from './kit.ts';

export type TutoEvent = 'moved' | 'tapAnimal' | 'requestFeed' | 'fed' | 'album' | 'plaza';

const STEPS: { text: string; until: TutoEvent }[] = [
  { text: 'Toca el suelo para caminar por tu calle.', until: 'moved' },
  { text: 'Ese gato atigrado es Nemesio. Tócalo para ver qué puedes hacer.', until: 'tapAnimal' },
  { text: 'Dale de comer: toca el cuenco de comida.', until: 'requestFeed' },
  { text: 'Nemesio aún desconfía un poco. Aléjate unos pasos y deja que se acerque a comer.', until: 'fed' },
  { text: '¡Te ha cogido cariño! Abre el álbum (el libro de abajo) para ver su ficha.', until: 'album' },
  { text: 'La plaza ya está abierta: baja por la escalera de la calle y sigue por la calle baja.', until: 'plaza' },
];

export class Tutorial {
  private box: HTMLDivElement;
  constructor(public step: number, private onChange: (step: number) => void) {
    this.box = el('div', { class: 'tuto panel ui-text' });
    document.getElementById('ui')!.append(this.box);
    this.render();
  }
  get done(): boolean {
    return this.step >= STEPS.length;
  }
  event(e: TutoEvent): void {
    if (this.done) return;
    if (STEPS[this.step].until === e) {
      this.step++;
      this.onChange(this.step);
      this.render();
    }
  }
  private render(): void {
    if (this.done) {
      this.box.classList.add('out');
      setTimeout(() => this.box.remove(), 500);
      return;
    }
    this.box.replaceChildren(el('span', { class: 'paw' }, '·'), STEPS[this.step].text);
    this.box.classList.remove('pop');
    void this.box.offsetWidth;
    this.box.classList.add('pop');
  }
}
