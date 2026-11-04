<script lang="ts">
  // What the Studio's overlay draws for special elements (U/Overlay.scala: sliderBar, TextBoxPosition.handle and
  // openSelected, SliderFocus.ghost and SliderFocus): mount inside the canvas overlay, after its own layers.
  import CarouselBar from "./CarouselBar.svelte";
  import TextBoxHandle from "./TextBoxHandle.svelte";
  import SliderFocus from "./SliderFocus.svelte";
</script>

<CarouselBar />
<TextBoxHandle />
<SliderFocus />
