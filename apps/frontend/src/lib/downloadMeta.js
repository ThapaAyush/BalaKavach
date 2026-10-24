import generatedData from '../generated/downloadMeta.json';

const defaultMeta = {
  android: {
    version: '0.1.1',
    versionCode: 2,
    versionName: 'v0.1.1',
    fileName: 'balakavach-companion.apk',
    downloadUrl: '/balakavach-companion.apk',
    sizeBytes: 8378634,
    sizeFormatted: '8.0 MB',
    versionHash: 'latest',
  },
  extension: {
    version: '0.3.0',
    versionName: 'v0.3.0',
    fileName: 'balakavach-chrome-extension.zip',
    downloadUrl: '/balakavach-chrome-extension.zip',
    sizeBytes: 264153,
    sizeFormatted: '258 KB',
    versionHash: 'latest',
  },
};

export const downloadMeta = {
  updatedAt: generatedData?.updatedAt || new Date().toISOString(),
  android: {
    ...defaultMeta.android,
    ...generatedData?.android,
  },
  extension: {
    ...defaultMeta.extension,
    ...generatedData?.extension,
  },
};

export default downloadMeta;
