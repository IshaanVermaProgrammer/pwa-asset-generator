import cheerio from 'cheerio';
import pretty from 'pretty';
import { lookup } from 'mime-types';
import path from 'path';
import constants from '../config/constants';
import file from './file';
import { SavedImage } from '../models/image';
import { ManifestJsonIcon } from '../models/result';
import { Options } from '../models/options';
import { HTMLMeta, HTMLMetaNames, HTMLMetaSelector } from '../models/meta';

const generateOutputPath = (
  options: Options,
  imageName: string,
  imagePath: string,
  isManifest = false,
): string => {
  const {
    path: pathPrefix,
    pathOverride,
    index: indexHtmlPath,
    manifest: manifestJsonPath,
  } = options;

  const outputFilePath = (
    isManifest ? manifestJsonPath : indexHtmlPath
  ) as string;

  if (pathOverride) {
    return `${pathOverride}/${imageName}${path.extname(imagePath)}`;
  }

  if (pathPrefix && !isManifest) {
    return `${pathPrefix}/${file.getRelativeImagePath(
      outputFilePath,
      imagePath,
    )}`;
  }

  return file.getRelativeImagePath(outputFilePath, imagePath);
};

const generateIconsContentForManifest = (
  savedImages: SavedImage[],
  options: Options,
): ManifestJsonIcon[] => {
  const purpose = options.maskable ? 'maskable' : 'any';
  return savedImages
    .filter((image) =>
      image.name.startsWith(constants.MANIFEST_ICON_FILENAME_PREFIX),
    )
    .map(({ path: imagePath, width, height, name }) => ({
      src: generateOutputPath(options, name, imagePath, true),
      sizes: `${width}x${height}`,
      type: `image/${file.getExtension(imagePath)}`,
      purpose,
    }));
};

const generateAppleTouchIconHtml = (
  savedImages: SavedImage[],
  options: Options,
): string => {
  return savedImages
    .filter((image) =>
      image.name.startsWith(constants.APPLE_ICON_FILENAME_PREFIX),
    )
    .map(({ path: imagePath, name }) =>
      constants.APPLE_TOUCH_ICON_META_HTML(
        generateOutputPath(options, name, imagePath),
        options.xhtml,
      ),
    )
    .join('');
};

const generateFaviconHtml = (
  savedImages: SavedImage[],
  options: Options,
): string => {
  return savedImages
    .filter((image) => image.name.startsWith(constants.FAVICON_FILENAME_PREFIX))
    .map(({ width, path: imagePath, name }) =>
      constants.FAVICON_META_HTML(
        width,
        generateOutputPath(options, name, imagePath),
        lookup(imagePath) as string,
        options.xhtml,
      ),
    )
    .join('');
};

const generateMsTileImageHtml = (
  savedImages: SavedImage[],
  options: Options,
): string => {
  return savedImages
    .filter((image) => image.name.startsWith(constants.MS_ICON_FILENAME_PREFIX))
    .map(({ width, height, path: imagePath, name }) =>
      constants.MSTILE_IMAGE_META_HTML(
        constants.MSTILE_SIZE_ELEMENT_NAME_MAP[`${width}x${height}`],
        generateOutputPath(options, name, imagePath),
        options.xhtml,
      ),
    )
    .join('');
};

const generateAppleLaunchImageHtml = (
  savedImages: SavedImage[],
  options: Options,
  darkMode: boolean,
): string => {
  return savedImages
    .filter((image) =>
      image.name.startsWith(constants.APPLE_SPLASH_FILENAME_PREFIX),
    )
    .map(({ width, height, path: imagePath, name, scaleFactor, orientation }) =>
      constants.APPLE_LAUNCH_SCREEN_META_HTML(
        width,
        height,
        generateOutputPath(options, name, imagePath),
        scaleFactor as number,
        orientation,
        darkMode,
        options.xhtml,
      ),
    )
    .join('');
};

const generateHtmlForIndexPage = (
  savedImages: SavedImage[],
  options: Options,
): HTMLMeta => {
  const htmlMeta: HTMLMeta = {
    [HTMLMetaNames.appleMobileWebAppCapable]: `<meta name="apple-mobile-web-app-capable" content="yes"${
      options.xhtml ? ' /' : ''
    }>
`,
  };
htmlMeta[HTMLMetaNames.manifest]=`<link rel="manifest" href="/manifest.webmanifest" />`;
htmlMeta[HTMLMetaNames.addSWscript]=`<script>if('serviceWorker' in navigator) {navigator.serviceWorker.register('/sw.js').then(function(){ console.log("Service Worker Registered"); }).catch(function(error){ console.error("Failed To Register Service Worker:"+error); });}</script>`;
  if (!options.splashOnly) {
    if (options.favicon) {
      htmlMeta[HTMLMetaNames.favicon] = `${generateFaviconHtml(
        savedImages,
        options,
      )}`;
    }

    htmlMeta[HTMLMetaNames.appleTouchIcon] = `${generateAppleTouchIconHtml(
      savedImages,
      options,
    )}`;
  }

  if (!options.iconOnly) {
    if (options.darkMode) {
      htmlMeta[
        HTMLMetaNames.appleLaunchImageDarkMode
      ] = `${generateAppleLaunchImageHtml(savedImages, options, true)}`;
    } else {
      htmlMeta[
        HTMLMetaNames.appleLaunchImage
      ] = `${generateAppleLaunchImageHtml(savedImages, options, false)}`;
    }
  }

  if (options.mstile) {
    htmlMeta[HTMLMetaNames.msTileImage] = `${generateMsTileImageHtml(
      savedImages,
      options,
    )}`;
  }

  if (options.singleQuotes) {
    Object.keys(htmlMeta).forEach((metaKey: string) => {
      const metaContent = htmlMeta[metaKey as keyof HTMLMeta];
      if (metaContent) {
        metaContent.replace(/"/gm, "'");
      }
    });
    return htmlMeta;
  }

  return htmlMeta;
};

const addIconsToManifest = async (
  manifestContent: ManifestJsonIcon[],
  manifestJsonFilePath: string,
): Promise<void> => {
  if (!(await file.isPathAccessible(manifestJsonFilePath, file.WRITE_ACCESS))) {
    throw Error(`Cannot write to manifest json file ${manifestJsonFilePath}`);
  }

  const manifestJson = JSON.parse(
    (await file.readFile(manifestJsonFilePath)) as unknown as string,
  );

  const newManifestContent = {
    ...manifestJson,
    icons: [...manifestContent],
  };

  if (manifestJson.icons) {
    newManifestContent.icons = [
      ...newManifestContent.icons,
      ...manifestJson.icons.filter(
        (icon: ManifestJsonIcon) =>
          !manifestContent.some((man) => man.sizes === icon.sizes),
      ),
    ];
  }

  return file.writeFile(
    manifestJsonFilePath,
    JSON.stringify(newManifestContent, null, 2),
  );
};

const formatMetaTags = (htmlMeta: HTMLMeta): string => {
  return constants.HTML_META_ORDERED_SELECTOR_LIST.reduce(
    (acc: string, meta: HTMLMetaSelector) => {
      if (htmlMeta.hasOwnProperty(meta.name)) {
        return `\
${acc}
${htmlMeta[meta.name]}`;
      }
      return acc;
    },
    '',
  );
};

const addMetaTagsToIndexPage = async (
  htmlMeta: HTMLMeta,
  indexHtmlFilePath: string,
  xhtml: boolean,
): Promise<void> => {
  if (!(await file.isPathAccessible(indexHtmlFilePath, file.WRITE_ACCESS))) {
    throw Error(`Cannot write to index html file ${indexHtmlFilePath}`);
  }

  const indexHtmlFile = await file.readFile(indexHtmlFilePath);
  const $ = cheerio.load(indexHtmlFile, {
    decodeEntities: false,
    xmlMode: xhtml,
  });

  const HEAD_SELECTOR = 'head';
  const hasElement = (selector: string): boolean => {
    return $(selector).length > 0;
  };

  const hasDarkModeElement = (): boolean => {
    const darkModeMeta = constants.HTML_META_ORDERED_SELECTOR_LIST.find(
      (m: HTMLMetaSelector) =>
        m.name === HTMLMetaNames.appleLaunchImageDarkMode,
    );
    if (darkModeMeta) {
      return $(darkModeMeta.selector).length > 0;
    }
    return false;
  };

  // TODO: Find a way to remove tags without leaving newlines behind
  constants.HTML_META_ORDERED_SELECTOR_LIST.forEach(
    (meta: HTMLMetaSelector) => {
      if (htmlMeta.hasOwnProperty(meta.name) && htmlMeta[meta.name] !== '') {
        const content = `${htmlMeta[meta.name]}`;

        if (hasElement(meta.selector)) {
          $(meta.selector).remove();
        }

        // Because meta tags with dark mode media attr has to be declared after the regular splash screen meta tags
        if (
          meta.name === HTMLMetaNames.appleLaunchImage &&
          hasDarkModeElement()
        ) {
          $(HEAD_SELECTOR).prepend(`\n${content}`);
        } else {
          $(HEAD_SELECTOR).append(`${content}\n`);
        }
      }
    },
  );

  return file.writeFile(indexHtmlFilePath, pretty($.html(), { ocd: true }));
};

export default {
  formatMetaTags,
  addIconsToManifest,
  addMetaTagsToIndexPage,
  generateHtmlForIndexPage,
  generateBrowserConfigXml: generateMsTileImageHtml,
  generateIconsContentForManifest,
};
