# vue-router-better-scroller

Forked from [@antfu/vue-router-better-scroller](https://github.com/antfu/vue-router-better-scroller)

Updated by [@Kangaroux/vue-router-better-scroller](https://github.com/Kangaroux/vue-router-better-scroller)

## Usage for me

1. Clone the repository to local.

```bash
git clone git@github.com:notosleung/vue-router-better-scroller.git
```

2. Move the `src/index.ts` and `src/types.ts` to **your project**'s `plugins` folder.

3. Use it in your main entry.

## Example

This example shows how to scroll after the images which are above the `savePosition` uploaded.

```typescript
import { setupRouterScroller } from "./plugins/vue-router-better-scroller";

// your code

setupRouterScroller(router, {
  selectors: {
    async html({ savedPosition }) {
      await new Promise((resolve) => {
        const allImages = document.querySelectorAll("img");
        if (allImages.length === 0) {
          resolve(undefined);
          return;
        }

        const relevantImages: HTMLImageElement[] = [];
        const targetY = savedPosition?.top ?? 0;

        // Find the images which are above the savedPosition
        allImages.forEach((img) => {
          const rect = img.getBoundingClientRect();
          if (rect.top + window.scrollY <= targetY) {
            relevantImages.push(img as HTMLImageElement);
          }
        });

        if (relevantImages.length === 0) {
          resolve(undefined);
          return;
        }

        let loaded = 0;
        let timeout: ReturnType<typeof setTimeout> | null = null;

        const cleanup = () => {
          relevantImages.forEach((img) => {
            img.removeEventListener("load", onImageLoad);
            img.removeEventListener("error", onImageLoad);
          });
          if (timeout) clearTimeout(timeout);
        };

        const onImageLoad = () => {
          loaded++;
          if (loaded === relevantImages.length) {
            cleanup();
            resolve(undefined);
          }
        };

        relevantImages.forEach((img) => {
          if (img.complete) {
            onImageLoad();
          } else {
            img.addEventListener("load", onImageLoad);
            img.addEventListener("error", onImageLoad);
          }
        });

        // just in case, set a 500ms timer if the images loading time is too long
        timeout = setTimeout(() => {
          cleanup();
          resolve(undefined);
        }, 500);
      });

      return true;
    },
  },
  behavior: "auto",
});
```

> [!NOTE]
> This repository is only for storing this update and the usage of my project, and I may delete it when antfu merge Kangaroux's PR

## License

[MIT](./LICENSE) License © 2022 [Anthony Fu](https://github.com/antfu)
