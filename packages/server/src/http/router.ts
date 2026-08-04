export type ServerRouteHandler = () => boolean | Promise<boolean>;

export async function handleFirstMatchingRoute(handlers: ServerRouteHandler[]): Promise<boolean> {
  for (const handler of handlers) {
    if (await handler()) return true;
  }
  return false;
}
