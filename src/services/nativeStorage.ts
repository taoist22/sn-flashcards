import {NativeModules} from 'react-native';

type FlashcardStorageModule = {
  readDatabase(): Promise<string | null>;
  writeDatabase(json: string): Promise<boolean>;
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
