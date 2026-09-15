import { MockHttpError, type HttpMethod, type MockRequest, type Route } from './utils';
import { productRoutes } from './handlers/products';
import { categoryRoutes, collectionRoutes } from './handlers/taxonomy';
import { customerRoutes, inventoryRoutes, orderRoutes } from './handlers/commerce';
import { couponRoutes, reviewRoutes } from './handlers/marketing';
import { homepageRoutes, mediaRoutes, notificationRoutes } from './handlers/cms';
import { footerRoutes } from './handlers/footer';
import { seoRoutes } from './handlers/seo';
import {
  adminRoutes,
  authRoutes,
  dashboardRoutes,
  reportRoutes,
  searchRoutes,
  settingsRoutes,
} from './handlers/platform';

const routes: Route[] = [
  ...authRoutes,
  ...dashboardRoutes,
  ...productRoutes,
  ...categoryRoutes,
  ...collectionRoutes,
  ...orderRoutes,
  ...customerRoutes,
  ...inventoryRoutes,
  ...couponRoutes,
  ...reviewRoutes,
  ...homepageRoutes,
  ...footerRoutes,
  ...mediaRoutes,
  ...notificationRoutes,
  ...seoRoutes,
  ...reportRoutes,
  ...searchRoutes,
  ...adminRoutes,
  ...settingsRoutes,
];

/**
 * Static segments beat params, so `/products/bulk` is matched before
 * `/products/:id` regardless of declaration order.
 */
function score(pattern: string) {
  return pattern
    .split('/')
    .filter(Boolean)
    .reduce((sum, segment) => sum + (segment.startsWith(':') ? 0 : 1), 0);
}

const sortedRoutes = [...routes].sort((a, b) => score(b.pattern) - score(a.pattern));

function match(pattern: string, path: string) {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i += 1) {
    const expected = patternParts[i];
    const actual = pathParts[i];
    if (expected.startsWith(':')) {
      params[expected.slice(1)] = decodeURIComponent(actual);
    } else if (expected !== actual) {
      return null;
    }
  }
  return params;
}

export interface MockResponse<T = unknown> {
  status: number;
  data: T;
}

export function resolveRoute(method: HttpMethod, path: string) {
  for (const candidate of sortedRoutes) {
    if (candidate.method !== method) continue;
    const params = match(candidate.pattern, path);
    if (params) return { route: candidate, params };
  }
  return null;
}

export function handleRequest(
  method: HttpMethod,
  path: string,
  body: Record<string, unknown>,
  query: Record<string, string>,
): MockResponse {
  const matched = resolveRoute(method, path);

  if (!matched) {
    return { status: 404, data: { message: `No mock handler for ${method} ${path}` } };
  }

  const request: MockRequest = {
    url: path,
    method,
    body,
    params: matched.params,
    query,
  };

  try {
    return { status: 200, data: matched.route.handler(request) };
  } catch (error) {
    if (error instanceof MockHttpError) {
      return { status: error.status, data: { message: error.message } };
    }
    return {
      status: 500,
      data: { message: error instanceof Error ? error.message : 'Unexpected mock server error' },
    };
  }
}
