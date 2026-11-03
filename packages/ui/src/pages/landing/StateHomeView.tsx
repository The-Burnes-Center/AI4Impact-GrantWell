/**
 * The state home page's markup, free of stylesheets and app state, so the app and the build's static
 * page render the same thing.
 */
import type { ReactNode } from "react";
import type { IconType } from "react-icons";
import { LuFileText, LuPenLine, LuSearch, LuShieldCheck } from "react-icons/lu";
import type { Branding, RichLine } from "../../common/branding";
import type { ResolvedHome } from "../../common/home-copy";

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

/** Holds the sign-in card's place until the app has its config. */
export function SignInPending({ appName }: { appName: string }) {
  return (
    <div className="auth-login-card state-home__sign-in-pending">
      <p className="state-home__sign-in-pending-text">Loading sign-in…</p>
      <noscript>
        <p>{appName} needs JavaScript to sign in. Please turn it on and reload this page.</p>
      </noscript>
    </div>
  );
}

export function StateHomeView({
  branding: { appName, logo, govHeader },
  home,
  signIn,
}: {
  branding: Pick<Branding, "appName" | "logo" | "govHeader">;
  home: ResolvedHome;
  signIn: ReactNode;
}) {
  const showSeal = govHeader && govHeader.sealBesideLogo !== false;
  return (
    <div className="state-home">
      <div className="state-home__band" aria-hidden="true" />
      <div className="state-home__inner">
        <div className="state-home__hero">
          <section className="state-home__identity" aria-labelledby="state-home-title">
            <h1 id="state-home-title" className="state-home__title">
              {showSeal && <img className="state-home__seal" src={govHeader.logo} alt="" />}
              {logo ? (
                <img className="state-home__logo" src={logo} alt={appName} />
              ) : (
                <span className="state-home__logo">{appName}</span>
              )}
            </h1>
            <p className="state-home__tagline">{home.tagline}</p>
            <p className="state-home__description">{home.description}</p>
          </section>
          <div className="state-home__sign-in">{signIn}</div>
        </div>

        <section className="state-home__features" aria-labelledby="state-home-features">
          <h2 id="state-home-features" className="visually-hidden">
            What you can do with {appName}
          </h2>
          <ul className="state-home__feature-list">
            {home.features.map((feature, i) => {
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
              {home.trust.title}
            </h2>
            <p className="state-home__trust-text">{home.trust.text}</p>
          </div>
        </section>

        {home.attribution.length > 0 && (
          <section className="state-home__attribution" aria-label="About this site">
            {home.attribution.map((parts, i) => (
              <Line key={i} parts={parts} />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
