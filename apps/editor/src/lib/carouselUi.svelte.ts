/**
 * Which layer of the selected classic slider (Carousel) is being edited, and which slide (U/CarouselUi.scala). Shared
 * by the canvas bar over the slider and the Content tab.
 */
import { Settings, type El } from "@auvyx/editor-core";
import { store } from "./store.svelte";

class CarouselUi {
  layer = $state<"slider" | "banner" | "image">("slider");
  slide = $state(0);

  /** Carousel.slidesOf: the slides, made safe (normalizeCarousel re-encodes them). */
  slidesOf(n: El): Settings.CarouselSlide[] {
    const raw = Object.fromEntries(Settings.normalizeCarousel(n.query)).slides ?? "[]";
    try { return JSON.parse(raw) as Settings.CarouselSlide[]; } catch { return []; }
  }

  /** The query with these slides, normalized like Carousel.normalize. */
  withSlides(n: El, slides: Settings.CarouselSlide[]): El {
    return { ...n, query: Object.fromEntries(Settings.normalizeCarousel({ ...n.query, slides: JSON.stringify(slides) })) };
  }

  /** CarouselUi.addSlide: a blank slide after the others (the first one's picture), then edit its banner. */
  addSlide() {
    const n = store.node;
    if (!n || n.kind !== "Carousel") return;
    const all = this.slidesOf(n);
    const next = [...all, Settings.blankSlide(all[0]?.image ?? "", all.length)];
    store.updateNode(n.id, (x) => this.withSlides(x, next), `carousel-add:${n.id}`);
    this.slide = all.length;
    this.layer = "banner";
  }
}
export const carouselUi = new CarouselUi();
