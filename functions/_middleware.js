export async function onRequest(context) {
  const url = new URL(context.request.url);
  
  // If it's a static asset, serve it directly
  if (url.pathname.startsWith('/css/') || 
      url.pathname.startsWith('/js/') || 
      url.pathname.startsWith('/components/') ||
      url.pathname.startsWith('/services/') ||
      url.pathname.endsWith('.css') ||
      url.pathname.endsWith('.js') ||
      url.pathname.endsWith('.png') ||
      url.pathname.endsWith('.jpg') ||
      url.pathname.endsWith('.jpeg') ||
      url.pathname.endsWith('.gif') ||
      url.pathname.endsWith('.svg') ||
      url.pathname.endsWith('.ico')) {
    return await context.next();
  }
  
  // For all other routes, serve index.html
  return context.env.ASSETS.fetch(context.request);
}
