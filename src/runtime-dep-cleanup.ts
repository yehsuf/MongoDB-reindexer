import * as fs from 'fs';

export function runtimeDeprecatedCleanup(pathToRuntimeDir: string, clusterName: string): Promise<void> {
  if (fs.existsSync(pathToRuntimeDir)) {
    const files = fs.readdirSync(pathToRuntimeDir);
    const relevantFiles = files.filter(f => f.includes(clusterName))

    const fileIndex: { [key: string]: string[] } = {};
    relevantFiles.forEach(file => {
      const timestampMatch = /_\d{4}(-\d\d){2}T(\d\d-){2}\d\d/;
      //remove time stamp to get file type
      const typeName = file.split('_')[1].replace(timestampMatch, '');
      if (!fileIndex[typeName]) {
        fileIndex[typeName] = [];
      }
      fileIndex[typeName].push(file);
    });

    for (const [, fileList] of Object.entries(fileIndex)) {
      let latestFile: string | null = null;
      let latestMTime = 0;

      fileList.forEach(file => {
        const filePath = `${pathToRuntimeDir}/${file}`;
        const stats = fs.statSync(filePath);
        if (stats.mtimeMs > latestMTime) {
          latestMTime = stats.mtimeMs;
          latestFile = file;
        }
      });
      //delete all but latest file
      fileList.forEach(file => {
        if (file !== latestFile) {
          const filePath = `${pathToRuntimeDir}/${file}`;
          fs.unlinkSync(filePath);
        }
      });
    }
  }
  return Promise.resolve();
}

