import { BrandBanner } from "@massds/mayflower-react";

export default function BrandBannerComponent() {
  return (
    <div
      style={{
        position: "static",
        width: "100%",
      }}
    >
      <BrandBanner
        hasSeal={true}
        bgTheme="dark"
        bgColor="c-primary-alt"
        seal="https://unpkg.com/@massds/mayflower-assets@14.1.0/static/images/logo/stateseal-white.png"
        text="An official website of the Commonwealth of Massachusetts"
      />
    </div>
  );
}
