import {PluginManager} from 'sn-plugin-lib';

export const FILE_READ_PERMISSION = 'plugin.permission.FILE:READ';
export const FILE_WRITE_PERMISSION = 'plugin.permission.FILE:WRITE';
export const FILE_DELETE_PERMISSION = 'plugin.permission.FILE:DELETE';

const pendingRequests = new Map<string, Promise<boolean>>();

const ensurePluginPermission = async (
  permission: string,
  description: string,
): Promise<boolean> => {
  const manager = PluginManager as typeof PluginManager & {
    hasPermission?: (name: string) => Promise<number>;
    requestPermission?: (name: string, desc?: string) => Promise<number>;
  };

  // Keep compatibility with older beta firmware that predates permission APIs.
  if (
    typeof manager.hasPermission !== 'function' ||
    typeof manager.requestPermission !== 'function'
  ) {
    return true;
  }

  const existing = pendingRequests.get(permission);
  if (existing) {
    return existing;
  }

  const request = (async () => {
    try {
      if (Number(await manager.hasPermission!(permission)) > 0) {
        return true;
      }
      return (
        Number(await manager.requestPermission!(permission, description)) > 0
      );
    } catch {
      return false;
    }
  })();

  pendingRequests.set(permission, request);
  try {
    return await request;
  } finally {
    pendingRequests.delete(permission);
  }
};

export const ensureFileReadPermission = () =>
  ensurePluginPermission(
    FILE_READ_PERMISSION,
    'Allow Flashcards to read note keywords and import card or image files.',
  );

export const ensureFileWritePermission = () =>
  ensurePluginPermission(
    FILE_WRITE_PERMISSION,
    'Allow Flashcards to save captured images and export card decks.',
  );

export const ensureFileDeletePermission = () =>
  ensurePluginPermission(
    FILE_DELETE_PERMISSION,
    'Allow Flashcards to remove saved card images when you delete or replace them.',
  );

export const requireFileReadPermission = async () => {
  if (!(await ensureFileReadPermission())) {
    throw new Error('File read access was not allowed. Grant file access to import or link notes.');
  }
};

export const requireFileWritePermission = async () => {
  if (!(await ensureFileWritePermission())) {
    throw new Error('File write access was not allowed. Grant file access to save images or exports.');
  }
};
