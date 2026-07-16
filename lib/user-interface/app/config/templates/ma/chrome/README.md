# MA chrome (Mayflower) — deliverable slot

MA's design system (`@massds/mayflower-react`) can't live in the neutral core. In the grantwell-ma
deliverable, this directory holds MA's chrome and is selected with `GRANTWELL_CHROME` pointing at
`index.ts` here.

`index.ts` must export the same four components the core chrome does (the `@chrome` contract):

    export { OmniHeader, LandingNavbar, AppNavbar, LandingFooter } from "./mayflower-chrome";

Each must accept the same props as the core versions in `src/pages/landing/chrome.tsx`
(`OmniHeader` takes `{ position?: "top" | "bottom" }`; the rest take none). Add
`@massds/mayflower-react` + `@massds/mayflower-assets` to the deliverable's app `package.json`.

Porting the Mayflower header/footer/banner from the MA branch (`main`) into these components is the
remaining work to reach visual parity — it is deliverable-side, and deliberately kept out of core.
