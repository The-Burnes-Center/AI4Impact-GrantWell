import type { Chrome, FooterProps, HeaderProps, PublicHomeProps } from "../common/chrome-api";
import "./chrome.css";

function Banner() {
  return <div className="fixture-banner">An example deployment</div>;
}

function Header({ user, links, navigate, signOut, menu }: HeaderProps) {
  return (
    <header className="fixture-header">
      {menu && (
        <button type="button" aria-expanded={menu.expanded} aria-controls={menu.controlsId} onClick={menu.toggle}>
          Menu
        </button>
      )}
      <nav>
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            onClick={(event) => {
              event.preventDefault();
              navigate(link.href);
            }}
          >
            {link.label}
          </a>
        ))}
      </nav>
      {user && (
        <button type="button" onClick={signOut}>
          Sign out {user.email}
          {user.isAdmin ? " (admin)" : ""}
        </button>
      )}
    </header>
  );
}

function Footer({ signedIn }: FooterProps) {
  return <footer className="fixture-footer">{signedIn ? "Signed in" : "Welcome"}</footer>;
}

function PublicHome({ signIn }: PublicHomeProps) {
  return (
    <main className="fixture-home">
      <h1>Example grants</h1>
      {signIn}
    </main>
  );
}

export const chrome: Chrome = { apiVersion: 1, Banner, Header, Footer, PublicHome };
