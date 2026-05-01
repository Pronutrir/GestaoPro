'use client';

import NextLink from 'next/link';
import { usePathname } from 'next/navigation';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import type { ComponentPropsWithoutRef } from 'react';

// Wrapper genérico de next/link
export const Link = forwardRef<HTMLAnchorElement, ComponentPropsWithoutRef<typeof NextLink>>(
  (props, ref) => <NextLink ref={ref} {...props} />,
);
Link.displayName = 'Link';

// NavLink com suporte a classe ativa (substitui NavLink do react-router-dom)
interface NavLinkProps extends Omit<ComponentPropsWithoutRef<typeof NextLink>, 'className'> {
  className?: string;
  activeClassName?: string;
  /** Se true, só ativa quando o path for exato (padrão: false) */
  end?: boolean;
}

export const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(
  ({ href, className, activeClassName, end = false, ...props }, ref) => {
    const pathname = usePathname();
    const hrefStr = typeof href === 'string' ? href : href.pathname ?? '';
    const isActive = end ? pathname === hrefStr : pathname.startsWith(hrefStr) && (hrefStr === '/' ? pathname === '/' : true);

    return (
      <NextLink
        ref={ref}
        href={href}
        className={cn(className, isActive && activeClassName)}
        {...props}
      />
    );
  },
);
NavLink.displayName = 'NavLink';
