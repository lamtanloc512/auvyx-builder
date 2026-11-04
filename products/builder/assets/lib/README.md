# Effects libraries (code elements)

Loaded only by a code element that names them (`assets/code.js`), never on other pages. Single-file ES modules built from
npm with `tools/vendor-libs.sh`; all MIT.

| Name | Package | Version | Licence |
|---|---|---|---|
| motion | motion (motion.dev, vanilla) | 11.18.2 | MIT |
| lenis | lenis | 1.3.26 | MIT |
| three | three | 0.186.1 | MIT |
| lottie | lottie-web (light player) | 5.13.0 | MIT |
| splitting | splitting | 1.1.0 | MIT |

GSAP is not shipped: a code element that names `gsap` (or `gsap-scrolltrigger`) loads it from GSAP's own package on
jsDelivr, under GSAP's licence, on that site (docs/ai-full-power.md).
