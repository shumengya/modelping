// 自毁版 Service Worker：项目已不再使用 SW，但老访客的浏览器里还装着旧版并缓存着旧页面。
// 浏览器会按 /sw.js 检查更新，拿到这份后立即接管 → 清空所有缓存 → 注销自己，之后访问就是普通网络请求。
// 没有 fetch 处理器，不会拦截任何请求。等老访客都更新过（几周后）可以删掉这个文件。
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
    })(),
  );
});
