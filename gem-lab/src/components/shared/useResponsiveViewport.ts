import { useLayoutEffect } from 'react';

/** 3D 页面使用响应式视口；离开时恢复其他页面的固定教学视口。 */
export function useResponsiveViewport() {
  useLayoutEffect(() => {
    const existingViewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const viewport = existingViewport ?? document.createElement('meta');
    const previousContent = viewport.getAttribute('content');
    viewport.name = 'viewport';
    viewport.content = 'width=device-width, initial-scale=1';
    if (!existingViewport) document.head.appendChild(viewport);
    return () => {
      if (!existingViewport) viewport.remove();
      else if (previousContent === null) viewport.removeAttribute('content');
      else viewport.setAttribute('content', previousContent);
    };
  }, []);
}
