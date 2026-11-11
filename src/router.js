function compile(pattern) {
  const names = [];
  const parts = pattern.split('/').filter(Boolean);
  if (parts.length === 0) return { regex: /^\/$/, names };
  const source = parts
    .map((part) => {
      if (part.startsWith(':')) {
        names.push(part.slice(1));
        return '([^/]+)';
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { regex: new RegExp(`^/${source}/?$`), names };
}

export class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, roles, handler) {
    this.routes.push({ method, pattern, roles, handler, ...compile(pattern) });
    return this;
  }

  get(pattern, roles, handler) {
    return this.add('GET', pattern, roles, handler);
  }

  post(pattern, roles, handler) {
    return this.add('POST', pattern, roles, handler);
  }

  match(method, pathname) {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const match = route.regex.exec(pathname);
      if (!match) continue;
      const params = {};
      route.names.forEach((name, index) => {
        params[name] = decodeURIComponent(match[index + 1]);
      });
      return { route, params };
    }
    return null;
  }
}
