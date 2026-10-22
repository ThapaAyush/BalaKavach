import generatedData from '../generated/downloadMeta.json';

const defaultMeta = {
  android: {
    version: '0.1.0',
    versionName: 'v0.1.0',
    fileName: 'balakavach-companion.apk',
    downloadUrl: '/balakavach-companion.apk',
    sizeBytes: 9424587,
    sizeFormatted: '9.0 MB',
    versionHash: 'latest',
  },
  extension: {
    version: '0.2.1',
    versionName: 'v0.2.1',
    fileName: 'balakavach-chrome-extension.zip',
    downloadUrl: '/balakavach-chrome-extension.zip',
    sizeBytes: 260059,
    sizeFormatted: '254 KB',
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
