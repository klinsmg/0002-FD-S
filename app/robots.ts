import type { MetadataRoute } from 'next';
import { site } from '@/lib/info';
import { IAS } from '@/lib/llms';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/conta', '/admin', '/login', '/auth'] }, ...IAS.map(userAgent => ({ userAgent, allow: '/', disallow: ['/conta', '/admin', '/login', '/auth'] }))],
    sitemap: `${site}/sitemap.xml`,
    host: site,
  };
}
