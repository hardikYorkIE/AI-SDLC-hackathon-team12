import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

const links = [
  { to: '/broken-checkout', label: 'Checkout' },
  { to: '/broken-dashboard', label: 'Dashboard' },
  { to: '/good-landing', label: 'Landing' },
  { to: '/new-feature', label: 'Invites' },
];

export function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <div className="shell bar">
          <span className="logo">Harbor</span>
          <nav aria-label="Demo screens">
            {links.map((link) => (
              <NavLink key={link.to} to={link.to}>
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main id="main" data-ready="true" tabIndex={-1} className="shell">
        {children}
      </main>
    </>
  );
}
