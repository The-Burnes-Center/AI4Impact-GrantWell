import type { IconType } from "react-icons";
import { LuFileText, LuPenLine, LuSearch, LuShieldCheck } from "react-icons/lu";
import "../../styles/state-home.css";
import type { PublicHomeProps } from "../../common/chrome-api";
import type { RichLine } from "../../common/branding";
import { useBranding } from "../../common/branding";
import { HOME } from "../../common/instance";
import { BrandLogo } from "../../components/common/BrandLogo";

const FEATURE_ICONS: IconType[] = [LuSearch, LuFileText, LuPenLine];

function Line({ parts }: { parts: RichLine }) {
  return (
    <p className="state-home__attribution-line">
      {parts.map((part, i) => {
        if (typeof part === "string") return part;
        const external = part.href.startsWith("https://");
        return (
          <a
            key={i}
            href={part.href}
            className="state-home__link"
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {part.label}
            {external && <span className="visually-hidden"> (opens in new tab)</span>}
          </a>
        );
      })}
    </p>
  );
}

/** The single-state public home: identity and sign-in, three feature cards, a trust panel and attribution. */
export default function StateHome({ signIn }: PublicHomeProps) {
  const { appName, logo, govHeader } = useBranding();
  const showSeal = govHeader && govHeader.sealBesideLogo !== false;

  return (
    <div className="state-home">
      <div className="state-home__band" aria-hidden="true" />
      <div className="state-home__inner">
        <div className="state-home__hero">
          <section className="state-home__identity" aria-labelledby="state-home-title">
            <h1 id="state-home-title" className="state-home__title">
              {showSeal && <img className="state-home__seal" src={govHeader.logo} alt="" />}
              <BrandLogo src={logo} alt={appName} className="state-home__logo" />
            </h1>
            <p className="state-home__tagline">{HOME.tagline}</p>
            <p className="state-home__description">{HOME.description}</p>
          </section>
          <div className="state-home__sign-in">{signIn}</div>
        </div>

        <section className="state-home__features" aria-labelledby="state-home-features">
          <h2 id="state-home-features" className="visually-hidden">
            What you can do with {appName}
          </h2>
          <ul className="state-home__feature-list">
            {HOME.features.map((feature, i) => {
              const Icon = FEATURE_ICONS[i];
              return (
                <li key={feature.title} className="state-home__feature">
                  {Icon && <Icon className="state-home__feature-icon" aria-hidden="true" />}
                  <h3 className="state-home__feature-title">{feature.title}</h3>
                  <p className="state-home__feature-text">{feature.text}</p>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="state-home__trust" aria-labelledby="state-home-trust">
          <LuShieldCheck className="state-home__trust-icon" aria-hidden="true" />
          <div>
            <h2 id="state-home-trust" className="state-home__trust-title">
              {HOME.trust.title}
            </h2>
            <p className="state-home__trust-text">{HOME.trust.text}</p>
          </div>
        </section>

        {HOME.attribution.length > 0 && (
          <section className="state-home__attribution" aria-label="About this site">
            {HOME.attribution.map((parts, i) => (
              <Line key={i} parts={parts} />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
