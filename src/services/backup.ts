import {FileUtils, RattaFileSelector} from 'sn-plugin-lib';
import type {FlashcardDatabase} from '../types/flashcards';
import {readTextFile, writeTextFile} from './nativeStorage';
import {serializeDatabase} from './store';
import {requireFileReadPermission, requireFileWritePermission} from './pluginPermissions';

const safeTimestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

export const backupDatabase = async (db: FlashcardDatabase): Promise<string> => {
  await requireFileWritePermission();
  const exportPath = await FileUtils.getExportPath();
  const dir = `${exportPath}/sn-flashcards`;
  await FileUtils.makeDir(dir);
  const filePath = `${dir}/flashcards-backup-${safeTimestamp()}.json`;
  await writeTextFile(filePath, serializeDatabase(db));
  return filePath;
};

export const pickBackupFile = async (): Promise<{path: string; text: string} | null> => {
  await requireFileReadPermission();
  const selected = (await RattaFileSelector.selectFile({
    selectType: 0,
    maxNum: 1,
    suffixList: ['json'],
    title: 'Choose Backup File',
    rightButtonText: 'Select',
  })) as string[] | null | undefined;

  const path = selected?.[0];
  if (!path) {
    return null;
  }

  if (!path.toLocaleLowerCase().endsWith('.json')) {
    throw new Error('Choose a Flashcards backup .json file.');
  }

  const text = await readTextFile(path);
  if (!text) {
    throw new Error('Could not read that file.');
  }

  return {path, text};
};
