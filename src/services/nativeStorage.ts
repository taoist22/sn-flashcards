import {NativeModules} from 'react-native';

type FlashcardStorageModule = {
  readDatabase(): Promise<string | null>;
  writeDatabase(json: string): Promise<boolean>;
  readTextFile(path: string): Promise<string | null>;
  writeTextFile(path: string, text: string): Promise<boolean>;
  listImportTextFiles(): Promise<string[]>;
  listTextFilesInDirectories(paths: string[]): Promise<string[]>;
};

const storage = NativeModules.FlashcardStorage as
  | FlashcardStorageModule
  | undefined;

const memoryFallback = {
  value: null as string | null,
};

export const readDatabaseJson = async () => {
  if (!storage) {
    return memoryFallback.value;
  }

  return storage.readDatabase();
};

export const writeDatabaseJson = async (json: string) => {
  if (!storage) {
    memoryFallback.value = json;
    return true;
  }

  return storage.writeDatabase(json);
};

export const readTextFile = async (path: string) => {
  if (!storage) {
    return null;
  }

  return storage.readTextFile(path);
};

export const writeTextFile = async (path: string, text: string) => {
  if (!storage) {
    memoryFallback.value = text;
    return true;
  }

  return storage.writeTextFile(path, text);
};

export const listImportTextFiles = async () => {
  if (!storage) {
    return [];
  }

  return storage.listImportTextFiles();
};

export const listTextFilesInDirectories = async (paths: string[]) => {
  if (!storage) {
    return [];
  }

  return storage.listTextFilesInDirectories(paths);
};
