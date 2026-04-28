import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { PRODUCT_METADATA } from '@jamful/shared'

import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: PRODUCT_METADATA.name,
      },
      {
        name: 'description',
        content: PRODUCT_METADATA.description,
      },
      {
        name: 'application-name',
        content: PRODUCT_METADATA.name,
      },
      {
        name: 'apple-mobile-web-app-title',
        content: PRODUCT_METADATA.name,
      },
      {
        name: 'robots',
        content: 'index,follow',
      },
      {
        name: 'theme-color',
        content: PRODUCT_METADATA.themeColor,
      },
      {
        property: 'og:type',
        content: 'website',
      },
      {
        property: 'og:site_name',
        content: PRODUCT_METADATA.name,
      },
      {
        property: 'og:title',
        content: PRODUCT_METADATA.name,
      },
      {
        property: 'og:description',
        content: PRODUCT_METADATA.description,
      },
      {
        property: 'og:url',
        content: PRODUCT_METADATA.siteUrl,
      },
      {
        property: 'og:image',
        content: `${PRODUCT_METADATA.siteUrl}${PRODUCT_METADATA.socialImagePath}`,
      },
      {
        property: 'og:image:width',
        content: '1200',
      },
      {
        property: 'og:image:height',
        content: '630',
      },
      {
        property: 'og:image:alt',
        content: 'Jamful browser extension preview',
      },
      {
        name: 'twitter:card',
        content: 'summary_large_image',
      },
      {
        name: 'twitter:title',
        content: PRODUCT_METADATA.name,
      },
      {
        name: 'twitter:description',
        content: PRODUCT_METADATA.description,
      },
      {
        name: 'twitter:image',
        content: `${PRODUCT_METADATA.siteUrl}${PRODUCT_METADATA.socialImagePath}`,
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
      {
        rel: 'icon',
        type: 'image/png',
        href: PRODUCT_METADATA.faviconPath,
      },
      {
        rel: 'icon',
        type: 'image/svg+xml',
        href: '/favicon.svg',
      },
      {
        rel: 'apple-touch-icon',
        href: '/apple-touch-icon.png',
      },
      {
        rel: 'canonical',
        href: PRODUCT_METADATA.siteUrl,
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
