import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {PluginCommAPI, PluginFileAPI, PluginManager} from 'sn-plugin-lib';
import {Rating, type Grade} from 'ts-fsrs';
import {
  addCard,
  cardsForDeck,
  clearNoteDefaultDeck,
  createDeck,
  deckStats,
  deleteCard,
  deleteDeck,
  dueCardsForDeck,
  importCards,
  loadDatabase,
  resolveIncludeInAnki,
  reviewCard,
  setDefaultCaptureMode,
  setImageAttachMode,
  setNoteDefaultDeck,
  updateCard,
  setGuessInkSettings,
} from './src/services/store';
import {InkSurfaceView} from './src/components/InkSurface';
import {
  activateInk,
  clearInk,
  deactivateInk,
  freezeInk,
  INK_DEFAULT_PEN_COLOR,
  INK_DEFAULT_PEN_TYPE,
  INK_DEFAULT_PEN_WIDTH,
  INK_PEN_COLORS,
  INK_PEN_TYPES,
  INK_PEN_WIDTHS,
  isInkAvailable,
} from './src/services/inkSurface';
import {createDraftFromLasso, type OcrFlashcardDraft} from './src/services/lassoOcr';
import {
  buildSideImagePath,
  captureCurrentLassoAsImage,
  clearLassoSelection,
  deleteCardImage,
  importContextImage,
  newDraftImageToken,
} from './src/services/inkCapture';
import {getRetrievability, ratingLabels, stateLabel} from './src/services/fsrsScheduler';
import type {CardSideMode, Deck, Flashcard, FlashcardDatabase} from './src/types/flashcards';
import {
  exportDeckToAnkiText,
  getImportDropFolder,
  listImportDropFolderFiles,
  parseCardText,
  pickImportTextFile,
  readImportTextFile,
} from './src/services/ankiText';
import {
  ensureFileReadPermission,
  requireFileWritePermission,
} from './src/services/pluginPermissions';

const MAIN_BUTTON_ID = 100;
const LASSO_BUTTON_ID = 200;
const IMAGE_CAPTURE_BUTTON_ID = 201;

type Screen = 'decks' | 'cards' | 'edit' | 'study' | 'capture' | 'import';

type NoteContext = {
  path: string;
  page: number;
};

type NoteDeckSource = 'saved' | 'keyword' | 'folder';

type NoteDeckMatch = {
  deckId: string;
  source: NoteDeckSource;
};

type ApiResponse<T> = {
  success?: boolean;
  result?: T;
  error?: {message?: string};
} | null | undefined;

type CaptureDraft = OcrFlashcardDraft & {
  questionMode?: CardSideMode;
  answerMode?: CardSideMode;
  contextImageSide?: 'front' | 'answer';
  contextImagePath?: string;
  hint?: string;
  hintMode?: CardSideMode;
  hintImagePath?: string;
  includeInAnki?: boolean;
};

const emptyDraft: CaptureDraft = {
  question: '',
  answer: '',
};

const normalizeDeckSignal = (value: string) =>
  value.trim().replace(/^#+/, '').trim().toLocaleLowerCase();

const getFolderSignals = (notePath: string) =>
  notePath
    .split('/')
    .slice(0, -1)
    .filter(Boolean)
    .reverse()
    .map(normalizeDeckSignal);

const unwrap = <T,>(response: unknown, fallback: T): T => {
  const typed = response as ApiResponse<T>;
  if (!typed?.success) {
    return fallback;
  }
  return typed.result ?? fallback;
};

const getCurrentNoteContext = async (): Promise<NoteContext | null> => {
  const path = unwrap<string | undefined>(
    await PluginCommAPI.getCurrentFilePath(),
    undefined,
  );
  const page = unwrap<number | undefined>(
    await PluginCommAPI.getCurrentPageNum(),
    undefined,
  );

  if (!path || typeof page !== 'number' || !path.toLowerCase().endsWith('.note')) {
    return null;
  }

  return {path, page};
};

const getKeywordDeckId = async (
  db: FlashcardDatabase,
  notePath: string,
): Promise<string | null> => {
  const keywords = await getNativeKeywords(notePath);
  const deckBySignal = new Map(
    db.decks.map(deck => [normalizeDeckSignal(deck.name), deck.id]),
  );

  for (const item of keywords) {
    const match = deckBySignal.get(normalizeDeckSignal(item.keyword ?? ''));
    if (match) {
      return match;
    }
  }

  return null;
};

const getDefaultDeckIdForNote = async (
  db: FlashcardDatabase,
  notePath: string,
): Promise<NoteDeckMatch | null> => {
  const mapped = db.noteDefaults.find(item => item.notePath === notePath);
  if (mapped && db.decks.some(deck => deck.id === mapped.deckId)) {
    return {deckId: mapped.deckId, source: 'saved'};
  }

  const keywordDeckId = await getKeywordDeckId(db, notePath);
  if (keywordDeckId) {
    return {deckId: keywordDeckId, source: 'keyword'};
  }

  const deckBySignal = new Map(
    db.decks.map(deck => [normalizeDeckSignal(deck.name), deck.id]),
  );
  for (const folderSignal of getFolderSignals(notePath)) {
    const folderDeckId = deckBySignal.get(folderSignal);
    if (folderDeckId) {
      return {deckId: folderDeckId, source: 'folder'};
    }
  }

  return null;
};

const getNativeKeywords = async (notePath: string) =>
  (await ensureFileReadPermission())
    ? unwrap<Array<{keyword?: string}>>(
        await (PluginFileAPI as any).getKeyWords(notePath),
        [],
      )
    : [];

const addNativeKeyword = async (note: NoteContext, keyword: string) => {
  await requireFileWritePermission();
  const normalized = keyword.trim();
  if (!normalized) {
    return;
  }
  const existing = await getNativeKeywords(note.path);
  const alreadyExists = existing.some(
    item => normalizeDeckSignal(item.keyword ?? '') === normalizeDeckSignal(normalized),
  );
  if (alreadyExists) {
    return;
  }

  const response = await PluginFileAPI.insertKeyWord(
    note.path,
    note.page,
    normalized,
  ) as ApiResponse<boolean>;
  if (!unwrap<boolean>(response, false)) {
    throw new Error(response?.error?.message ?? 'Could not add note keyword.');
  }
};

function App(): React.JSX.Element {
  const [db, setDb] = useState<FlashcardDatabase | null>(null);
  const [screen, setScreen] = useState<Screen>('decks');
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<Flashcard | null>(null);
  const [draft, setDraft] = useState<CaptureDraft>(emptyDraft);
  const [captureLoading, setCaptureLoading] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [studyGuess, setStudyGuess] = useState('');

  // Handwriting is optional and firmware-dependent: if getPWInterFace ever stops
  // resolving, this stays false and the Guess field is the plain TextInput it always was.
  const [inkAvailable, setInkAvailable] = useState(false);
  useEffect(() => {
    let cancelled = false;
    isInkAvailable().then(ok => {
      if (!cancelled) {
        setInkAvailable(ok);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const [newDeckName, setNewDeckName] = useState('');
  const [captureDeckName, setCaptureDeckName] = useState('');
  const [linkDefaultOnApply, setLinkDefaultOnApply] = useState(false);
  const [addKeywordOnApply, setAddKeywordOnApply] = useState(false);
  const [captureLinkDefault, setCaptureLinkDefault] = useState(false);
  const [captureAddKeyword, setCaptureAddKeyword] = useState(false);
  const [noteContext, setNoteContext] = useState<NoteContext | null>(null);
  const [noteDeckMatch, setNoteDeckMatch] = useState<NoteDeckMatch | null>(null);
  const [importFiles, setImportFiles] = useState<string[]>([]);
  const [importFolder, setImportFolder] = useState('');
  const [pendingCapturedImage, setPendingCapturedImage] = useState<string | null>(null);
  const screenRef = useRef<Screen>('decks');
  const pendingReplaceRef = useRef<'question' | 'answer' | null>(null);

  const selectedDeck = useMemo(
    () => db?.decks.find(deck => deck.id === selectedDeckId) ?? db?.decks[0],
    [db, selectedDeckId],
  );

  const deckCards = useMemo(
    () => (db && selectedDeck ? cardsForDeck(db, selectedDeck.id) : []),
    [db, selectedDeck],
  );

  const dueCards = useMemo(
    () => (db && selectedDeck ? dueCardsForDeck(db, selectedDeck.id) : []),
    [db, selectedDeck],
  );

  const activeStudyCard = dueCards[0] ?? null;

  const refresh = useCallback(async () => {
    const loaded = await loadDatabase();
    const note = await getCurrentNoteContext();
    setNoteContext(note);
    setDb(loaded);
    const noteMatch = note
      ? await getDefaultDeckIdForNote(loaded, note.path)
      : null;
    setNoteDeckMatch(noteMatch);
    setSelectedDeckId(
      current => noteMatch?.deckId ?? current ?? loaded.decks[0]?.id ?? null,
    );
    return loaded;
  }, []);

  const loadLassoDraft = useCallback(async () => {
    setCaptureLoading(true);
    setScreen('capture');
    setDraft(emptyDraft);
    try {
      const loaded = await refresh();
      const handwritingDefault = loaded?.settings?.defaultCaptureMode === 'image';
      const nextDraft = await createDraftFromLasso({skipOcr: handwritingDefault});
      setDraft(
        handwritingDefault
          ? {
              ...nextDraft,
              questionMode: nextDraft.questionImagePath ? 'image' : undefined,
              answerMode: nextDraft.answerImagePath ? 'image' : undefined,
            }
          : nextDraft,
      );
    } catch (error) {
      setDraft(emptyDraft);
      Alert.alert(
        'Could not read handwriting',
        error instanceof Error ? error.message : 'Try lassoing the two lines again.',
      );
    } finally {
      setCaptureLoading(false);
    }
  }, [refresh]);

  useEffect(() => {
    screenRef.current = screen;
    if (screen !== 'edit') {
      pendingReplaceRef.current = null;
    }
  }, [screen]);

  // Captures whatever is currently lassoed (ink or an inserted image). Does
  // not decide where it goes yet — Capture/Edit screens show a prompt for
  // that once the image lands, via pendingCapturedImage. Reads screenRef
  // instead of `screen` so this callback's identity never changes, which
  // keeps the button-listener effect below from ever needing to
  // re-subscribe mid-flow.
  const captureNoteImage = useCallback(async () => {
    if (screenRef.current !== 'capture' && screenRef.current !== 'edit') {
      pendingReplaceRef.current = null;
      Alert.alert(
        'No card open',
        'Open Add Flashcard or Edit Card first, then lasso the image and try again.',
      );
      return;
    }

    const replaceSide = pendingReplaceRef.current;
    pendingReplaceRef.current = null;

    try {
      const path = await buildSideImagePath(
        newDraftImageToken(),
        replaceSide ?? 'capture',
      );
      const success = await captureCurrentLassoAsImage(path);
      if (!success) {
        Alert.alert('Could not capture image', 'Try lassoing the region again.');
        return;
      }

      // Armed by "Replace Handwriting" on a specific side in the Edit screen:
      // swap directly into that side instead of asking where it goes.
      if (replaceSide && screenRef.current === 'edit') {
        setEditingCard(current => {
          if (!current) {
            return current;
          }
          const oldPath =
            replaceSide === 'question' ? current.questionImagePath : current.answerImagePath;
          deleteCardImage(oldPath);
          return replaceSide === 'question'
            ? {...current, questionMode: 'image', questionImagePath: path}
            : {...current, answerMode: 'image', answerImagePath: path};
        });
        return;
      }

      setPendingCapturedImage(path);
    } finally {
      await clearLassoSelection();
    }
  }, []);

  const attachCapturedImage = (target: 'front' | 'answer' | 'hint') => {
    if (!pendingCapturedImage) {
      return;
    }
    const path = pendingCapturedImage;
    setPendingCapturedImage(null);
    const replaceMode = db?.settings?.imageAttachMode === 'replace';

    const applyToDraft = (current: CaptureDraft): CaptureDraft => {
      if (target === 'hint') {
        return {...current, hintImagePath: path, hintMode: 'image'};
      }
      if (replaceMode) {
        if (target === 'front') {
          deleteCardImage(current.questionImagePath);
          return {...current, questionMode: 'image', questionImagePath: path};
        }
        deleteCardImage(current.answerImagePath);
        return {...current, answerMode: 'image', answerImagePath: path};
      }
      return {...current, contextImagePath: path, contextImageSide: target};
    };

    const applyToCard = (current: Flashcard): Flashcard => {
      if (target === 'hint') {
        return {...current, hintImagePath: path, hintMode: 'image'};
      }
      if (replaceMode) {
        if (target === 'front') {
          deleteCardImage(current.questionImagePath);
          return {...current, questionMode: 'image', questionImagePath: path};
        }
        deleteCardImage(current.answerImagePath);
        return {...current, answerMode: 'image', answerImagePath: path};
      }
      return {...current, contextImagePath: path, contextImageSide: target};
    };

    if (screen === 'capture') {
      setDraft(applyToDraft);
    } else if (screen === 'edit') {
      setEditingCard(current => (current ? applyToCard(current) : current));
    }
  };

  const discardCapturedImage = () => {
    if (pendingCapturedImage) {
      deleteCardImage(pendingCapturedImage);
    }
    setPendingCapturedImage(null);
  };

  // "Add Image" file imports flow through the same pending chooser as lasso
  // captures, so attachment (front/answer/hint) is decided in one place.
  const importImageToPending = async () => {
    try {
      const path = await importContextImage();
      if (path) {
        setPendingCapturedImage(path);
      }
    } catch (error) {
      Alert.alert(
        'Could not add image',
        error instanceof Error ? error.message : 'Try picking the image again.',
      );
    }
  };

  const goToNote = () => {
    PluginManager.closePluginView();
  };

  const replaceHandwritingFromNote = (side: 'question' | 'answer') => {
    pendingReplaceRef.current = side;
    goToNote();
  };

  const toggleDefaultCaptureMode = async () => {
    const current = db?.settings?.defaultCaptureMode === 'image';
    const next = await setDefaultCaptureMode(requireDb(), current ? 'text' : 'image');
    setDb(next);
  };

  const toggleImageAttachMode = async () => {
    const current = db?.settings?.imageAttachMode === 'replace';
    const next = await setImageAttachMode(requireDb(), current ? 'context' : 'replace');
    setDb(next);
  };

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const subscription = PluginManager.registerButtonListener({
      onButtonPress: event => {
        if (event.id === LASSO_BUTTON_ID) {
          loadLassoDraft();
          return;
        }
        if (event.id === IMAGE_CAPTURE_BUTTON_ID) {
          captureNoteImage();
          return;
        }
        if (event.id === MAIN_BUTTON_ID) {
          refresh().catch(() => undefined);
          setScreen('decks');
        }
      },
    });

    return () => subscription.remove();
  }, [captureNoteImage, loadLassoDraft, refresh]);

  const close = () => {
    PluginManager.closePluginView();
  };

  const requireDb = () => {
    if (!db) {
      throw new Error('Database is still loading.');
    }
    return db;
  };

  const createDeckByName = async (name: string) => {
    const currentDb = requireDb();
    const trimmedName = name.trim();
    const beforeDeckIds = new Set(currentDb.decks.map(deck => deck.id));
    const next = await createDeck(currentDb, trimmedName);
    const createdDeck = next.decks.find(deck => !beforeDeckIds.has(deck.id));

    setDb(next);
    if (createdDeck) {
      setSelectedDeckId(createdDeck.id);
    }
    return {next, createdDeck};
  };

  const saveDeck = async () => {
    await createDeckByName(newDeckName);
    setNewDeckName('');
  };

  const applyNoteLinkOptions = async (
    deck: Deck,
    options: {linkDefault: boolean; addKeyword: boolean},
    baseDb?: FlashcardDatabase,
  ) => {
    if (!noteContext) {
      return;
    }
    if (!options.linkDefault && !options.addKeyword) {
      Alert.alert('Nothing selected', 'Choose Link Default, Add Keyword, or both.');
      return;
    }

    let keywordError: unknown = null;
    try {
      let next = baseDb ?? requireDb();
      if (options.addKeyword) {
        try {
          await addNativeKeyword(noteContext, deck.name);
        } catch (error) {
          keywordError = error;
        }
      }
      if (options.linkDefault) {
        next = await setNoteDefaultDeck(next, noteContext.path, deck.id);
      }
      const noteMatch = await getDefaultDeckIdForNote(next, noteContext.path);
      setDb(next);
      setSelectedDeckId(deck.id);
      setNoteDeckMatch(noteMatch);
      if (keywordError) {
        const keywordFailureMessage = options.linkDefault
          ? 'The note default was updated, but the keyword was not added.'
          : 'The keyword was not added.';
        Alert.alert(
          options.linkDefault ? 'Note linked' : 'Keyword not added',
          keywordError instanceof Error
            ? `${keywordFailureMessage}\n\n${keywordError.message}`
            : keywordFailureMessage,
        );
      }
    } catch (error) {
      Alert.alert(
        'Could not link note',
        error instanceof Error ? error.message : 'Try again from inside the note.',
      );
    }
  };

  const createDeckFromCapture = async () => {
    const result = await createDeckByName(captureDeckName);
    setCaptureDeckName('');
    if (result.createdDeck && noteContext) {
      await applyNoteLinkOptions(
        result.createdDeck,
        {
          linkDefault: captureLinkDefault,
          addKeyword: captureAddKeyword,
        },
        result.next,
      );
    }
  };

  const unlinkCurrentNote = async () => {
    if (!noteContext) {
      return;
    }

    try {
      const next = await clearNoteDefaultDeck(requireDb(), noteContext.path);
      const noteMatch = await getDefaultDeckIdForNote(next, noteContext.path);
      setDb(next);
      setNoteDeckMatch(noteMatch);
    } catch (error) {
      Alert.alert(
        'Could not unlink note',
        error instanceof Error ? error.message : 'Try again from inside the note.',
      );
    }
  };

  const removeDeck = async (deck: Deck) => {
    const next = await deleteDeck(requireDb(), deck.id);
    setDb(next);
    setSelectedDeckId(next.decks[0]?.id ?? null);
  };

  const saveDraftCard = async () => {
    const questionOk =
      draft.questionMode === 'image'
        ? Boolean(draft.questionImagePath)
        : Boolean(draft.question.trim());
    const answerOk =
      draft.answerMode === 'image'
        ? Boolean(draft.answerImagePath)
        : Boolean(draft.answer.trim());

    if (!selectedDeck || !questionOk || !answerOk) {
      Alert.alert(
        'Question and answer needed',
        'Add both sides (text or handwriting) before saving.',
      );
      return;
    }

    // Clean up generated ink images for sides the user left as text.
    if (draft.questionMode !== 'image' && draft.questionImagePath) {
      deleteCardImage(draft.questionImagePath);
    }
    if (draft.answerMode !== 'image' && draft.answerImagePath) {
      deleteCardImage(draft.answerImagePath);
    }
    if (draft.hintMode !== 'image' && draft.hintImagePath) {
      deleteCardImage(draft.hintImagePath);
    }

    const next = await addCard(requireDb(), {
      deckId: selectedDeck.id,
      question: draft.question,
      answer: draft.answer,
      questionMode: draft.questionMode,
      answerMode: draft.answerMode,
      questionImagePath: draft.questionMode === 'image' ? draft.questionImagePath : undefined,
      answerImagePath: draft.answerMode === 'image' ? draft.answerImagePath : undefined,
      contextImageSide: draft.contextImageSide,
      contextImagePath: draft.contextImagePath,
      hint: draft.hint,
      hintMode: draft.hintMode,
      hintImagePath: draft.hintMode === 'image' ? draft.hintImagePath : undefined,
      includeInAnki: draft.includeInAnki,
      sourceNotePath: draft.sourceNotePath,
      sourcePage: draft.sourcePage,
    });
    setDb(next);
    setDraft(emptyDraft);
    setScreen('cards');
  };

  const saveEditedCard = async () => {
    if (!editingCard || !selectedDeck) {
      return;
    }
    const next = await updateCard(requireDb(), editingCard.id, {
      deckId: editingCard.deckId,
      question: editingCard.question,
      answer: editingCard.answer,
      questionMode: editingCard.questionMode,
      answerMode: editingCard.answerMode,
      questionImagePath: editingCard.questionImagePath,
      answerImagePath: editingCard.answerImagePath,
      contextImageSide: editingCard.contextImageSide,
      contextImagePath: editingCard.contextImagePath,
      hint: editingCard.hint,
      hintMode: editingCard.hintMode,
      hintImagePath: editingCard.hintImagePath,
      includeInAnki: editingCard.includeInAnki,
    });
    setDb(next);
    setEditingCard(null);
    setScreen('cards');
  };

  const removeCard = async (card: Flashcard) => {
    const next = await deleteCard(requireDb(), card.id);
    setDb(next);
  };

  const exportSelectedDeck = async () => {
    if (!selectedDeck) {
      return;
    }

    try {
      const filePath = await exportDeckToAnkiText(selectedDeck, deckCards);
      Alert.alert('Deck exported', `Saved to:\n${filePath}`);
    } catch (error) {
      Alert.alert(
        'Export failed',
        error instanceof Error ? error.message : 'Could not export this deck.',
      );
    }
  };

  const openImportDropFolder = async () => {
    try {
      const result = await listImportDropFolderFiles();
      setImportFiles(result.files);
      setImportFolder(result.dropFolder);
      setScreen('import');
    } catch (error) {
      const dropFolder = await getImportDropFolder();
      setImportFolder(dropFolder);
      Alert.alert(
        'Import scan failed',
        error instanceof Error
          ? error.message
          : 'Flashcards could not scan the import folder.',
      );
      setImportFiles([]);
      setScreen('import');
    }
  };

  const importPickedText = async (picked: {path: string; text: string}) => {
    const fallbackDeckName = selectedDeck?.name ?? 'Imported';

    const rows = parseCardText(picked.text, fallbackDeckName);
    if (rows.length === 0) {
      Alert.alert('No cards found', 'The file did not contain question/answer rows.');
      return;
    }

    const result = await importCards(requireDb(), rows, fallbackDeckName);
    setDb(result.db);
    Alert.alert(
      'Import complete',
      [
        `${result.summary.addedCards} added`,
        `${result.summary.updatedCards} updated`,
        `${result.summary.skippedCards} skipped`,
        `${result.summary.createdDecks} decks created`,
      ].join('\n'),
    );
    setScreen('cards');
  };

  const importTextDeck = async (path: string) => {
    try {
      const picked = await readImportTextFile(path);
      await importPickedText(picked);
    } catch (error) {
      Alert.alert(
        'Import failed',
        error instanceof Error ? error.message : 'Could not import that file.',
      );
    }
  };

  const browseImportTextDeck = async () => {
    try {
      const picked = await pickImportTextFile();
      if (!picked) {
        return;
      }
      await importPickedText(picked);
    } catch (error) {
      Alert.alert(
        'Import failed',
        error instanceof Error ? error.message : 'Could not import that file.',
      );
    }
  };

  const guessInkOn =
    inkAvailable && (db?.settings?.handwrittenGuess ?? true);
  const guessPenType = db?.settings?.guessPenType ?? INK_DEFAULT_PEN_TYPE;
  const guessPenWidth = db?.settings?.guessPenWidth ?? INK_DEFAULT_PEN_WIDTH;
  const guessPenColor = db?.settings?.guessPenColor ?? INK_DEFAULT_PEN_COLOR;
  const guessHand = db?.settings?.guessHand ?? 'right';

  const rateStudyCard = async (rating: Grade) => {
    if (!activeStudyCard) {
      return;
    }
    const next = await reviewCard(requireDb(), activeStudyCard.id, rating);
    setDb(next);
    setShowAnswer(false);
    setShowHint(false);
    setStudyGuess('');
    // The written guess is deliberately not kept — wipe it before the next card.
    await clearInk();
  };

  if (!db || !selectedDeck) {
    return (
      <SafeAreaView style={styles.root}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#f7f7f2" />
      <View style={styles.header}>
        <Pressable onPress={() => setScreen('decks')} style={styles.headerButton}>
          <Text style={styles.headerButtonText}>Decks</Text>
        </Pressable>
        <Text style={styles.title}>Flashcards</Text>
        <Pressable onPress={close} style={styles.iconButton}>
          <Text style={styles.iconText}>x</Text>
        </Pressable>
      </View>

      {screen !== 'decks' && (
        <View style={styles.subHeader}>
          <Text style={styles.subTitle}>{selectedDeck.name}</Text>
          <Pressable onPress={() => setScreen('cards')} style={styles.smallButton}>
            <Text style={styles.smallButtonText}>Cards</Text>
          </Pressable>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.content}
        // Locked only while WRITING: the engine must not see its host move. Once the
        // answer is showing the engine is frozen, so scrolling down to the answer and the
        // rating buttons is safe — and necessary, since they sit below the surface.
        scrollEnabled={!(screen === 'study' && guessInkOn && !showAnswer)}>
        {noteContext && screen !== 'decks' && (
          <NoteLinkStatus
            deck={selectedDeck}
            decks={db.decks}
            match={noteDeckMatch}
            onUnlink={unlinkCurrentNote}
          />
        )}

        {screen === 'decks' && (
          <DeckScreen
            db={db}
            selectedDeckId={selectedDeck.id}
            newDeckName={newDeckName}
            noteMatch={noteDeckMatch}
            canLinkNote={noteContext != null}
            linkDefaultOnApply={linkDefaultOnApply}
            addKeywordOnApply={addKeywordOnApply}
            onNewDeckName={setNewDeckName}
            onCreateDeck={saveDeck}
            onToggleLinkDefault={() => setLinkDefaultOnApply(current => !current)}
            onToggleAddKeyword={() => setAddKeywordOnApply(current => !current)}
            onApplyNoteLink={() =>
              applyNoteLinkOptions(selectedDeck, {
                linkDefault: linkDefaultOnApply,
                addKeyword: addKeywordOnApply,
              })
            }
            onUnlinkNote={unlinkCurrentNote}
            onSelectDeck={deck => {
              setSelectedDeckId(deck.id);
              setScreen('cards');
            }}
            onDeleteDeck={removeDeck}
          />
        )}

        {screen === 'cards' && (
          <CardsScreen
            db={db}
            deck={selectedDeck}
            cards={deckCards}
            dueCount={dueCards.length}
            onStudy={() => {
              setShowAnswer(false);
              setShowHint(false);
              setStudyGuess('');
              setScreen('study');
            }}
            onManualAdd={() => {
              setDraft(emptyDraft);
              setScreen('capture');
            }}
            onImport={openImportDropFolder}
            onExport={exportSelectedDeck}
            onEdit={card => {
              setEditingCard(card);
              setScreen('edit');
            }}
            onDelete={removeCard}
          />
        )}

        {screen === 'capture' && (
          <CaptureScreen
            draft={draft}
            decks={db.decks}
            selectedDeckId={selectedDeck.id}
            newDeckName={captureDeckName}
            canLinkNote={noteContext != null}
            linkDefaultOnCreate={captureLinkDefault}
            addKeywordOnCreate={captureAddKeyword}
            loading={captureLoading}
            onChangeDraft={setDraft}
            onSelectDeck={setSelectedDeckId}
            onNewDeckName={setCaptureDeckName}
            onCreateDeck={createDeckFromCapture}
            onToggleLinkDefault={() => setCaptureLinkDefault(current => !current)}
            onToggleAddKeyword={() => setCaptureAddKeyword(current => !current)}
            pendingCapturedImage={pendingCapturedImage}
            onAttachCapturedImage={attachCapturedImage}
            onDiscardCapturedImage={discardCapturedImage}
            onImportImage={importImageToPending}
            onGoToNote={goToNote}
            handwritingDefault={db.settings?.defaultCaptureMode === 'image'}
            onToggleHandwritingDefault={toggleDefaultCaptureMode}
            imageAttachMode={db.settings?.imageAttachMode === 'replace'}
            onToggleImageAttachMode={toggleImageAttachMode}
            onSave={saveDraftCard}
          />
        )}

        {screen === 'edit' && editingCard && (
          <EditScreen
            card={editingCard}
            decks={db.decks}
            onChange={setEditingCard}
            pendingCapturedImage={pendingCapturedImage}
            onAttachCapturedImage={attachCapturedImage}
            onDiscardCapturedImage={discardCapturedImage}
            onImportImage={importImageToPending}
            onGoToNote={goToNote}
            onReplaceHandwriting={replaceHandwritingFromNote}
            imageAttachMode={db.settings?.imageAttachMode === 'replace'}
            onToggleImageAttachMode={toggleImageAttachMode}
            onSave={saveEditedCard}
          />
        )}

        {screen === 'study' && (
          <StudyScreen
            card={activeStudyCard}
            showAnswer={showAnswer}
            showHint={showHint}
            guess={studyGuess}
            onGuessChange={setStudyGuess}
            inkMode={guessInkOn}
            penType={guessPenType}
            penWidth={guessPenWidth}
            penColor={guessPenColor}
            hand={guessHand}
            onToggleHand={async () => {
              if (!db) {
                return;
              }
              setDb(
                await setGuessInkSettings(db, {
                  guessHand: guessHand === 'right' ? 'left' : 'right',
                }),
              );
            }}
            onCyclePen={async () => {
              if (!db) {
                return;
              }
              const idx = INK_PEN_TYPES.findIndex(p => p.id === guessPenType);
              const nextPen = INK_PEN_TYPES[(idx + 1) % INK_PEN_TYPES.length];
              setDb(await setGuessInkSettings(db, {guessPenType: nextPen.id}));
            }}
            onCycleWidth={async () => {
              if (!db) {
                return;
              }
              const idx = INK_PEN_WIDTHS.indexOf(guessPenWidth);
              const nextWidth = INK_PEN_WIDTHS[(idx + 1) % INK_PEN_WIDTHS.length];
              setDb(await setGuessInkSettings(db, {guessPenWidth: nextWidth}));
            }}
            onCycleColor={async () => {
              if (!db) {
                return;
              }
              const idx = INK_PEN_COLORS.findIndex(c => c.value === guessPenColor);
              const nextColor = INK_PEN_COLORS[(idx + 1) % INK_PEN_COLORS.length];
              setDb(await setGuessInkSettings(db, {guessPenColor: nextColor.value}));
            }}
            onToggleInk={async () => {
              if (!db) {
                return;
              }
              const next = !(db.settings?.handwrittenGuess ?? true);
              if (!next) {
                await deactivateInk();
              }
              setDb(await setGuessInkSettings(db, {handwrittenGuess: next}));
            }}
            inkAvailable={inkAvailable}
            onRevealHint={() => setShowHint(true)}
            onReveal={() => {
              // Freeze rather than release: the strokes must stay on screen next to the
              // answer for comparison, they just must not accept new input.
              freezeInk();
              setShowAnswer(true);
            }}
            onRate={rateStudyCard}
          />
        )}

        {screen === 'import' && (
          <ImportScreen
            files={importFiles}
            folder={importFolder}
            onRefresh={openImportDropFolder}
            onBrowse={browseImportTextDeck}
            onImport={importTextDeck}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ImportScreen({
  files,
  folder,
  onRefresh,
  onBrowse,
  onImport,
}: {
  files: string[];
  folder: string;
  onRefresh: () => void;
  onBrowse: () => void;
  onImport: (path: string) => void;
}) {
  return (
    <View>
      <Text style={styles.sectionTitle}>Import Anki Text</Text>
      <Text style={styles.emptyText}>
        Put Anki plain text exports in this folder, then refresh:
      </Text>
      <Text style={styles.pathText}>{folder}</Text>
      <View style={styles.actions}>
        <SecondaryButton label="Refresh" onPress={onRefresh} />
        <SecondaryButton label="Browse Files" onPress={onBrowse} />
      </View>
      {files.length === 0 ? (
        <Text style={styles.emptyText}>No .txt, .tsv, or .csv files found there yet.</Text>
      ) : (
        <View style={styles.fileList}>
          {files.map(path => (
            <Pressable key={path} onPress={() => onImport(path)} style={styles.rowCard}>
              <View style={styles.rowMain}>
                <Text style={styles.cardTitle}>{fileName(path)}</Text>
                <Text style={styles.muted} numberOfLines={2}>
                  {path}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function NoteLinkStatus({
  deck,
  decks,
  match,
  onUnlink,
}: {
  deck: Deck;
  decks: Deck[];
  match: NoteDeckMatch | null;
  onUnlink: () => void;
}) {
  const currentDeckIsMatched = match?.deckId === deck.id;
  const linkedDeck = decks.find(item => item.id === match?.deckId);

  if (currentDeckIsMatched && match.source === 'saved') {
    return (
      <View style={styles.noteStatus}>
        <Text style={styles.noteStatusTitle}>Linked to {deck.name}</Text>
        <Text style={styles.noteStatusText}>
          A note-specific default is saved for this note.
        </Text>
        <View style={styles.noteStatusActions}>
          <SecondaryButton label="Unlink Note" onPress={onUnlink} />
        </View>
      </View>
    );
  }

  if (match?.source === 'saved') {
    return (
      <View style={styles.noteStatus}>
        <Text style={styles.noteStatusTitle}>
          Linked to {linkedDeck?.name ?? 'another deck'}
        </Text>
        <Text style={styles.noteStatusText}>
          Open Decks to change which deck this note opens.
        </Text>
        <View style={styles.noteStatusActions}>
          <SecondaryButton label="Unlink Note" onPress={onUnlink} />
        </View>
      </View>
    );
  }

  if (currentDeckIsMatched && match.source === 'keyword') {
    return (
      <View style={styles.noteStatus}>
        <Text style={styles.noteStatusTitle}>{deck.name} keyword found</Text>
        <Text style={styles.noteStatusText}>
          This note has a matching Supernote keyword.
        </Text>
      </View>
    );
  }

  if (currentDeckIsMatched && match.source === 'folder') {
    return (
      <View style={styles.noteStatus}>
        <Text style={styles.noteStatusTitle}>Using {deck.name} from folder</Text>
        <Text style={styles.noteStatusText}>
          Open Decks to save this as an explicit note link.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.noteStatus}>
      <Text style={styles.noteStatusTitle}>No note link saved</Text>
      <Text style={styles.noteStatusText}>
        Open Decks to link this note to a deck.
      </Text>
    </View>
  );
}

function CheckRow({
  label,
  checked,
  onPress,
}: {
  label: string;
  checked: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.checkboxRow}>
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && <Text style={styles.checkboxMark}>✓</Text>}
      </View>
      <Text style={styles.checkboxText}>{label}</Text>
    </Pressable>
  );
}

function DeckScreen({
  db,
  selectedDeckId,
  newDeckName,
  noteMatch,
  canLinkNote,
  linkDefaultOnApply,
  addKeywordOnApply,
  onNewDeckName,
  onCreateDeck,
  onToggleLinkDefault,
  onToggleAddKeyword,
  onApplyNoteLink,
  onUnlinkNote,
  onSelectDeck,
  onDeleteDeck,
}: {
  db: FlashcardDatabase;
  selectedDeckId: string;
  newDeckName: string;
  noteMatch: NoteDeckMatch | null;
  canLinkNote: boolean;
  linkDefaultOnApply: boolean;
  addKeywordOnApply: boolean;
  onNewDeckName: (name: string) => void;
  onCreateDeck: () => void;
  onToggleLinkDefault: () => void;
  onToggleAddKeyword: () => void;
  onApplyNoteLink: () => void;
  onUnlinkNote: () => void;
  onSelectDeck: (deck: Deck) => void;
  onDeleteDeck: (deck: Deck) => void;
}) {
  const selectedDeck = db.decks.find(deck => deck.id === selectedDeckId) ?? db.decks[0];
  const linkedDeck = db.decks.find(deck => deck.id === noteMatch?.deckId);
  const savedLink = noteMatch?.source === 'saved';

  return (
    <View>
      <Text style={styles.sectionTitle}>Decks</Text>
      <View style={styles.formBlock}>
        <Text style={styles.blockTitle}>Create Deck</Text>
        <View style={styles.createDeckRow}>
          <TextInput
            value={newDeckName}
            onChangeText={onNewDeckName}
            placeholder="New deck name"
            placeholderTextColor="#74746c"
            style={[styles.input, styles.createDeckInput]}
          />
          <Pressable onPress={onCreateDeck} style={styles.createDeckButton}>
            <Text style={styles.createDeckButtonText}>Create</Text>
          </Pressable>
        </View>

        {canLinkNote && selectedDeck && (
          <View style={styles.noteLinkBlock}>
            <Text style={styles.blockTitle}>Note Link</Text>
            <Text style={styles.noteStatusText}>
              {savedLink
                ? `This note is linked to ${linkedDeck?.name ?? 'a deck'}.`
                : `Link this note to ${selectedDeck.name}.`}
            </Text>
            <CheckRow
              label="Link note default"
              checked={linkDefaultOnApply}
              onPress={onToggleLinkDefault}
            />
            <CheckRow
              label="Add Supernote keyword"
              checked={addKeywordOnApply}
              onPress={onToggleAddKeyword}
            />
            <View style={styles.actions}>
              <PrimaryButton
                label={`Apply to ${selectedDeck.name}`}
                onPress={onApplyNoteLink}
              />
              {savedLink && (
                <SecondaryButton label="Unlink Note" onPress={onUnlinkNote} />
              )}
            </View>
          </View>
        )}
      </View>

      {db.decks.map(deck => {
        const stats = deckStats(db, deck.id);
        const selected = deck.id === selectedDeckId;
        return (
          <Pressable
            key={deck.id}
            onPress={() => onSelectDeck(deck)}
            style={[styles.rowCard, selected && styles.selectedCard]}>
            <View style={styles.rowMain}>
              <Text style={styles.cardTitle}>{deck.name}</Text>
              <Text style={styles.muted}>
                {stats.total} cards · {stats.due} due · {stats.reviewedToday} today
              </Text>
            </View>
            {db.decks.length > 1 && (
              <Pressable onPress={() => onDeleteDeck(deck)} style={styles.plainButton}>
                <Text style={styles.warningText}>Delete</Text>
              </Pressable>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

function CardsScreen({
  db,
  deck,
  cards,
  dueCount,
  onStudy,
  onManualAdd,
  onImport,
  onExport,
  onEdit,
  onDelete,
}: {
  db: FlashcardDatabase;
  deck: Deck;
  cards: Flashcard[];
  dueCount: number;
  onStudy: () => void;
  onManualAdd: () => void;
  onImport: () => void;
  onExport: () => void;
  onEdit: (card: Flashcard) => void;
  onDelete: (card: Flashcard) => void;
}) {
  const stats = deckStats(db, deck.id);
  // Same Nomad-vs-Manta detection FrameClip already uses: Supernote's device-type
  // API doesn't cleanly distinguish Manta, so go by actual screen width instead.
  const {width} = useWindowDimensions();
  const columns = width >= 1500 ? 4 : 3;
  const tileWidthPercent = `${100 / columns - 2}%` as const;

  return (
    <View>
      <View style={styles.statsGrid}>
        <Stat label="Cards" value={String(stats.total)} />
        <Stat label="Due" value={String(stats.due)} />
        <Stat label="Today" value={String(stats.reviewedToday)} />
        <Stat label="Reviews" value={String(stats.reviews)} />
      </View>

      <View style={styles.actions}>
        <PrimaryButton label={dueCount > 0 ? 'Study Due' : 'Study'} onPress={onStudy} />
        <SecondaryButton label="Add Manually" onPress={onManualAdd} />
        <View style={styles.actionRow}>
          <SecondaryButton label="Import Anki Text" onPress={onImport} />
          <SecondaryButton label="Export Deck" onPress={onExport} />
        </View>
      </View>

      <Text style={styles.sectionTitle}>Cards</Text>
      {cards.length === 0 ? (
        <Text style={styles.emptyText}>
          No cards yet. Use Add Manually here, or lasso two handwritten lines in a note and choose Add Flashcard.
        </Text>
      ) : (
        <View style={styles.cardGrid}>
          {cards.map(card => {
            const retention = getRetrievability(card.fsrs);
            const hasImage = card.questionMode === 'image' && card.questionImagePath;
            return (
              <View key={card.id} style={[styles.cardTile, {width: tileWidthPercent}]}>
                <Pressable onPress={() => onEdit(card)}>
                  {hasImage ? (
                    <Image
                      source={{uri: `file://${card.questionImagePath}`}}
                      style={styles.cardTileImage}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={styles.cardTileTextBox}>
                      <Text style={styles.cardTitle} numberOfLines={5}>
                        {card.question.trim()}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.muted} numberOfLines={1}>
                    {stateLabel(card.fsrs.state)} · due {formatDate(card.fsrs.due)}
                    {retention == null ? '' : ` · ${Math.round(retention * 100)}%`}
                  </Text>
                </Pressable>
                <Pressable onPress={() => onDelete(card)} style={styles.plainButton}>
                  <Text style={styles.warningText}>Delete</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function SectionCard({title, children}: {title: string; children: React.ReactNode}) {
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionHeader}>{title}</Text>
      {children}
    </View>
  );
}

// Preview + attach chooser shown after an image arrives (lasso capture or
// file import), before it's assigned to front/answer/hint.
function PendingImageChooser({
  path,
  onAttach,
  onDiscard,
}: {
  path: string;
  onAttach: (target: 'front' | 'answer' | 'hint') => void;
  onDiscard: () => void;
}) {
  return (
    <View style={styles.capturedImageBanner}>
      <Text style={styles.label}>Image added — attach it to:</Text>
      <Image
        source={{uri: `file://${path}`}}
        style={styles.sideImagePreview}
        resizeMode="contain"
      />
      <View style={styles.imageSourceRow}>
        <Pressable onPress={() => onAttach('front')} style={styles.createDeckButton}>
          <Text style={styles.createDeckButtonText}>Front</Text>
        </Pressable>
        <Pressable onPress={() => onAttach('answer')} style={styles.createDeckButton}>
          <Text style={styles.createDeckButtonText}>Answer</Text>
        </Pressable>
        <Pressable onPress={() => onAttach('hint')} style={styles.createDeckButton}>
          <Text style={styles.createDeckButtonText}>Hint</Text>
        </Pressable>
      </View>
      <Pressable onPress={onDiscard} style={styles.linkButton}>
        <Text style={styles.linkButtonText}>Discard</Text>
      </Pressable>
    </View>
  );
}

function CaptureScreen({
  draft,
  decks,
  selectedDeckId,
  newDeckName,
  canLinkNote,
  linkDefaultOnCreate,
  addKeywordOnCreate,
  loading,
  onChangeDraft,
  onSelectDeck,
  onNewDeckName,
  onCreateDeck,
  onToggleLinkDefault,
  onToggleAddKeyword,
  pendingCapturedImage,
  onAttachCapturedImage,
  onDiscardCapturedImage,
  onImportImage,
  onGoToNote,
  handwritingDefault,
  onToggleHandwritingDefault,
  imageAttachMode,
  onToggleImageAttachMode,
  onSave,
}: {
  draft: CaptureDraft;
  decks: Deck[];
  selectedDeckId: string;
  newDeckName: string;
  canLinkNote: boolean;
  linkDefaultOnCreate: boolean;
  addKeywordOnCreate: boolean;
  loading: boolean;
  onChangeDraft: (draft: CaptureDraft) => void;
  onSelectDeck: (deckId: string) => void;
  onNewDeckName: (name: string) => void;
  onCreateDeck: () => void;
  onToggleLinkDefault: () => void;
  onToggleAddKeyword: () => void;
  pendingCapturedImage: string | null;
  onAttachCapturedImage: (target: 'front' | 'answer' | 'hint') => void;
  onDiscardCapturedImage: () => void;
  onImportImage: () => void;
  onGoToNote: () => void;
  handwritingDefault: boolean;
  onToggleHandwritingDefault: () => void;
  imageAttachMode: boolean;
  onToggleImageAttachMode: () => void;
  onSave: () => void;
}) {
  const removeContextImage = () => {
    if (draft.contextImagePath) {
      deleteCardImage(draft.contextImagePath);
    }
    onChangeDraft({...draft, contextImagePath: undefined, contextImageSide: undefined});
  };

  const removeHintImage = () => {
    if (draft.hintImagePath) {
      deleteCardImage(draft.hintImagePath);
    }
    onChangeDraft({...draft, hintImagePath: undefined, hintMode: 'text'});
  };

  const moveContextImage = (target: 'front' | 'answer' | 'hint') => {
    if (target === 'hint') {
      onChangeDraft({
        ...draft,
        hintImagePath: draft.contextImagePath,
        hintMode: 'image',
        contextImagePath: undefined,
        contextImageSide: undefined,
      });
    } else {
      onChangeDraft({...draft, contextImageSide: target});
    }
  };

  const effectiveIncludeInAnki = draft.includeInAnki ?? resolveIncludeInAnki(draft);

  return (
    <View style={styles.captureScreen}>
      <Text style={styles.sectionTitle}>Add Flashcard</Text>
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator />
          <Text style={styles.muted}>Reading handwriting...</Text>
        </View>
      ) : null}

      <SectionCard title="Question">
        {draft.questionMode === 'image' && draft.questionImagePath ? (
          <Image
            source={{uri: `file://${draft.questionImagePath}`}}
            style={styles.sideImagePreview}
            resizeMode="contain"
          />
        ) : (
          <TextInput
            value={draft.question}
            onChangeText={question => onChangeDraft({...draft, question})}
            multiline
            placeholder="Question"
            placeholderTextColor="#74746c"
            style={[styles.input, styles.textArea]}
          />
        )}
        {draft.questionImagePath && (
          <CheckRow
            label="Keep as handwriting"
            checked={draft.questionMode === 'image'}
            onPress={() =>
              onChangeDraft({
                ...draft,
                questionMode: draft.questionMode === 'image' ? 'text' : 'image',
              })
            }
          />
        )}
      </SectionCard>

      <SectionCard title="Hint (optional)">
        {draft.hintMode === 'image' && draft.hintImagePath ? (
          <Image
            source={{uri: `file://${draft.hintImagePath}`}}
            style={styles.sideImagePreview}
            resizeMode="contain"
          />
        ) : (
          <TextInput
            value={draft.hint ?? ''}
            onChangeText={hint => onChangeDraft({...draft, hint})}
            multiline
            placeholder="Revealed on request during study"
            placeholderTextColor="#74746c"
            style={[styles.input, styles.textArea]}
          />
        )}
        {draft.hintImagePath && (
          <>
            <CheckRow
              label="Show hint as image"
              checked={draft.hintMode === 'image'}
              onPress={() =>
                onChangeDraft({
                  ...draft,
                  hintMode: draft.hintMode === 'image' ? 'text' : 'image',
                })
              }
            />
            <Pressable onPress={removeHintImage} style={styles.linkButton}>
              <Text style={styles.linkButtonText}>Remove Hint Image</Text>
            </Pressable>
          </>
        )}
      </SectionCard>

      <SectionCard title="Answer">
        {draft.answerMode === 'image' && draft.answerImagePath ? (
          <Image
            source={{uri: `file://${draft.answerImagePath}`}}
            style={styles.sideImagePreview}
            resizeMode="contain"
          />
        ) : (
          <TextInput
            value={draft.answer}
            onChangeText={answer => onChangeDraft({...draft, answer})}
            multiline
            placeholder="Answer"
            placeholderTextColor="#74746c"
            style={[styles.input, styles.textArea]}
          />
        )}
        {draft.answerImagePath && (
          <CheckRow
            label="Keep as handwriting"
            checked={draft.answerMode === 'image'}
            onPress={() =>
              onChangeDraft({
                ...draft,
                answerMode: draft.answerMode === 'image' ? 'text' : 'image',
              })
            }
          />
        )}
      </SectionCard>

      <SectionCard title="Add Image">
        <CheckRow
          label="Replace front/answer content with image (instead of adding as context)"
          checked={imageAttachMode}
          onPress={onToggleImageAttachMode}
        />
        {pendingCapturedImage ? (
          <PendingImageChooser
            path={pendingCapturedImage}
            onAttach={onAttachCapturedImage}
            onDiscard={onDiscardCapturedImage}
          />
        ) : (
          <>
            <View style={styles.imageSourceRow}>
              <Pressable onPress={onImportImage} style={styles.createDeckButton}>
                <Text style={styles.createDeckButtonText}>Add Image</Text>
              </Pressable>
              <Pressable onPress={onGoToNote} style={styles.createDeckButton}>
                <Text style={styles.createDeckButtonText}>Go to Note</Text>
              </Pressable>
            </View>
            <Text style={styles.helperText}>
              Add Image picks a file. Go to Note lets you lasso the image, then tap "Add Image
              to Flashcard" in the lasso toolbar; you'll pick Front, Answer, or Hint back here.
            </Text>
          </>
        )}
        {draft.contextImagePath && (
          <>
            <Image
              source={{uri: `file://${draft.contextImagePath}`}}
              style={styles.sideImagePreview}
              resizeMode="contain"
            />
            <CheckRow
              label="Attached to front"
              checked={draft.contextImageSide === 'front'}
              onPress={() => moveContextImage('front')}
            />
            <CheckRow
              label="Attached to answer"
              checked={draft.contextImageSide === 'answer'}
              onPress={() => moveContextImage('answer')}
            />
            <CheckRow
              label="Attached to hint"
              checked={false}
              onPress={() => moveContextImage('hint')}
            />
            <Pressable onPress={removeContextImage} style={styles.linkButton}>
              <Text style={styles.linkButtonText}>Remove Image</Text>
            </Pressable>
          </>
        )}
      </SectionCard>

      <SectionCard title="Deck">
        <DeckChooser decks={decks} selectedDeckId={selectedDeckId} onSelect={onSelectDeck} />
        <View style={styles.createDeckRow}>
          <TextInput
            value={newDeckName}
            onChangeText={onNewDeckName}
            placeholder="New deck name"
            placeholderTextColor="#74746c"
            style={[styles.input, styles.createDeckInput]}
          />
          <Pressable onPress={onCreateDeck} style={styles.createDeckButton}>
            <Text style={styles.createDeckButtonText}>Create</Text>
          </Pressable>
        </View>
        {canLinkNote && (
          <>
            <CheckRow
              label="Link note default"
              checked={linkDefaultOnCreate}
              onPress={onToggleLinkDefault}
            />
            <CheckRow
              label="Add Supernote keyword"
              checked={addKeywordOnCreate}
              onPress={onToggleAddKeyword}
            />
          </>
        )}
      </SectionCard>

      <CheckRow
        label="Include in Anki export"
        checked={effectiveIncludeInAnki}
        onPress={() => onChangeDraft({...draft, includeInAnki: !effectiveIncludeInAnki})}
      />
      <CheckRow
        label="Capture handwriting by default (skip text recognition)"
        checked={handwritingDefault}
        onPress={onToggleHandwritingDefault}
      />

      <PrimaryButton label="Add Flashcard" onPress={onSave} />
    </View>
  );
}

function EditScreen({
  card,
  decks,
  onChange,
  pendingCapturedImage,
  onAttachCapturedImage,
  onDiscardCapturedImage,
  onImportImage,
  onGoToNote,
  onReplaceHandwriting,
  imageAttachMode,
  onToggleImageAttachMode,
  onSave,
}: {
  card: Flashcard;
  decks: Deck[];
  onChange: (card: Flashcard) => void;
  pendingCapturedImage: string | null;
  onAttachCapturedImage: (target: 'front' | 'answer' | 'hint') => void;
  onDiscardCapturedImage: () => void;
  onImportImage: () => void;
  onGoToNote: () => void;
  onReplaceHandwriting: (side: 'question' | 'answer') => void;
  imageAttachMode: boolean;
  onToggleImageAttachMode: () => void;
  onSave: () => void;
}) {
  const currentDeck = decks.find(deck => deck.id === card.deckId);

  const removeContextImage = () => {
    if (card.contextImagePath) {
      deleteCardImage(card.contextImagePath);
    }
    onChange({...card, contextImagePath: undefined, contextImageSide: undefined});
  };

  const removeHintImage = () => {
    if (card.hintImagePath) {
      deleteCardImage(card.hintImagePath);
    }
    onChange({...card, hintImagePath: undefined, hintMode: 'text'});
  };

  const moveContextImage = (target: 'front' | 'answer' | 'hint') => {
    if (target === 'hint') {
      onChange({
        ...card,
        hintImagePath: card.contextImagePath,
        hintMode: 'image',
        contextImagePath: undefined,
        contextImageSide: undefined,
      });
    } else {
      onChange({...card, contextImageSide: target});
    }
  };

  const effectiveIncludeInAnki = card.includeInAnki ?? resolveIncludeInAnki(card);

  return (
    <View>
      <Text style={styles.sectionTitle}>Edit Card</Text>

      <SectionCard title="Question">
        {card.questionMode === 'image' && card.questionImagePath ? (
          <>
            <Image
              source={{uri: `file://${card.questionImagePath}`}}
              style={styles.sideImagePreview}
              resizeMode="contain"
            />
            <View style={styles.imageSourceRow}>
              <Pressable
                onPress={() => onReplaceHandwriting('question')}
                style={styles.createDeckButton}>
                <Text style={styles.createDeckButtonText}>Replace Handwriting</Text>
              </Pressable>
            </View>
            <Pressable
              onPress={() => {
                deleteCardImage(card.questionImagePath);
                onChange({...card, questionMode: 'text', questionImagePath: undefined});
              }}
              style={styles.linkButton}>
              <Text style={styles.linkButtonText}>Convert to Text</Text>
            </Pressable>
          </>
        ) : (
          <TextInput
            value={card.question}
            onChangeText={question => onChange({...card, question})}
            multiline
            style={[styles.input, styles.textArea]}
          />
        )}
      </SectionCard>

      <SectionCard title="Hint (optional)">
        {card.hintMode === 'image' && card.hintImagePath ? (
          <Image
            source={{uri: `file://${card.hintImagePath}`}}
            style={styles.sideImagePreview}
            resizeMode="contain"
          />
        ) : (
          <TextInput
            value={card.hint ?? ''}
            onChangeText={hint => onChange({...card, hint})}
            multiline
            placeholder="Revealed on request during study"
            placeholderTextColor="#74746c"
            style={[styles.input, styles.textArea]}
          />
        )}
        {card.hintImagePath && (
          <>
            <CheckRow
              label="Show hint as image"
              checked={card.hintMode === 'image'}
              onPress={() =>
                onChange({...card, hintMode: card.hintMode === 'image' ? 'text' : 'image'})
              }
            />
            <Pressable onPress={removeHintImage} style={styles.linkButton}>
              <Text style={styles.linkButtonText}>Remove Hint Image</Text>
            </Pressable>
          </>
        )}
      </SectionCard>

      <SectionCard title="Answer">
        {card.answerMode === 'image' && card.answerImagePath ? (
          <>
            <Image
              source={{uri: `file://${card.answerImagePath}`}}
              style={styles.sideImagePreview}
              resizeMode="contain"
            />
            <View style={styles.imageSourceRow}>
              <Pressable
                onPress={() => onReplaceHandwriting('answer')}
                style={styles.createDeckButton}>
                <Text style={styles.createDeckButtonText}>Replace Handwriting</Text>
              </Pressable>
            </View>
            <Pressable
              onPress={() => {
                deleteCardImage(card.answerImagePath);
                onChange({...card, answerMode: 'text', answerImagePath: undefined});
              }}
              style={styles.linkButton}>
              <Text style={styles.linkButtonText}>Convert to Text</Text>
            </Pressable>
          </>
        ) : (
          <TextInput
            value={card.answer}
            onChangeText={answer => onChange({...card, answer})}
            multiline
            style={[styles.input, styles.textArea]}
          />
        )}
      </SectionCard>

      <SectionCard title="Add Image">
        <CheckRow
          label="Replace front/answer content with image (instead of adding as context)"
          checked={imageAttachMode}
          onPress={onToggleImageAttachMode}
        />
        {pendingCapturedImage ? (
          <PendingImageChooser
            path={pendingCapturedImage}
            onAttach={onAttachCapturedImage}
            onDiscard={onDiscardCapturedImage}
          />
        ) : (
          <>
            <View style={styles.imageSourceRow}>
              <Pressable onPress={onImportImage} style={styles.createDeckButton}>
                <Text style={styles.createDeckButtonText}>Add Image</Text>
              </Pressable>
              <Pressable onPress={onGoToNote} style={styles.createDeckButton}>
                <Text style={styles.createDeckButtonText}>Go to Note</Text>
              </Pressable>
            </View>
            <Text style={styles.helperText}>
              Add Image picks a file. Go to Note lets you lasso the image, then tap "Add Image
              to Flashcard" in the lasso toolbar; you'll pick Front, Answer, or Hint back here.
            </Text>
          </>
        )}
        {card.contextImagePath && (
          <>
            <Image
              source={{uri: `file://${card.contextImagePath}`}}
              style={styles.sideImagePreview}
              resizeMode="contain"
            />
            <CheckRow
              label="Attached to front"
              checked={card.contextImageSide === 'front'}
              onPress={() => moveContextImage('front')}
            />
            <CheckRow
              label="Attached to answer"
              checked={card.contextImageSide === 'answer'}
              onPress={() => moveContextImage('answer')}
            />
            <CheckRow
              label="Attached to hint"
              checked={false}
              onPress={() => moveContextImage('hint')}
            />
            <Pressable onPress={removeContextImage} style={styles.linkButton}>
              <Text style={styles.linkButtonText}>Remove Image</Text>
            </Pressable>
          </>
        )}
      </SectionCard>

      <SectionCard title="Move to Deck">
        <Text style={styles.muted}>
          Currently in {currentDeck?.name ?? 'selected deck'}
        </Text>
        <DeckChooser
          decks={decks}
          selectedDeckId={card.deckId}
          onSelect={deckId => onChange({...card, deckId})}
        />
      </SectionCard>

      <CheckRow
        label="Include in Anki export"
        checked={effectiveIncludeInAnki}
        onPress={() => onChange({...card, includeInAnki: !effectiveIncludeInAnki})}
      />

      <PrimaryButton label="Save Card" onPress={onSave} />
    </View>
  );
}

function StudyScreen({
  card,
  showAnswer,
  showHint,
  guess,
  onGuessChange,
  inkMode,
  inkAvailable,
  penType,
  penWidth,
  penColor,
  hand,
  onToggleHand,
  onCyclePen,
  onCycleWidth,
  onCycleColor,
  onToggleInk,
  onRevealHint,
  onReveal,
  onRate,
}: {
  card: Flashcard | null;
  showAnswer: boolean;
  showHint: boolean;
  guess: string;
  onGuessChange: (guess: string) => void;
  inkMode: boolean;
  inkAvailable: boolean;
  penType: number;
  penWidth: number;
  penColor: number;
  hand: 'left' | 'right';
  onToggleHand: () => void;
  onCyclePen: () => void;
  onCycleWidth: () => void;
  onCycleColor: () => void;
  onToggleInk: () => void;
  onRevealHint: () => void;
  onReveal: () => void;
  onRate: (rating: Grade) => void;
}) {
  const [questionImageFailed, setQuestionImageFailed] = useState(false);
  const [answerImageFailed, setAnswerImageFailed] = useState(false);
  const [contextImageFailed, setContextImageFailed] = useState(false);
  const [hintImageFailed, setHintImageFailed] = useState(false);

  const cardId = card?.id;

  useEffect(() => {
    setQuestionImageFailed(false);
    setAnswerImageFailed(false);
    setContextImageFailed(false);
    setHintImageFailed(false);
  }, [card?.id]);

  /**
   * Bind the engine once the surface has actually been laid out.
   *
   * The engine sizes its writing bitmap from the host's MEASURED dimensions, so activating
   * before layout binds a 0x0 buffer. activateInk reports 'not-laid-out' rather than
   * failing, and we retry on the next frames.
   */
  useEffect(() => {
    if (!inkMode || !cardId) {
      return;
    }
    let cancelled = false;
    let attempts = 0;
    const tryActivate = async () => {
      if (cancelled) {
        return;
      }
      if (attempts === 0) {
        // Full release first: re-binding a reused instance kept a stale writable region.
        await deactivateInk();
      }
      const result = await activateInk(penType, penWidth, penColor);
      if (result === 'not-laid-out' && attempts < 12 && !cancelled) {
        attempts += 1;
        setTimeout(tryActivate, 100);
      }
    };
    tryActivate();
    return () => {
      cancelled = true;
    };
  }, [inkMode, cardId, penType, penWidth, penColor]);

  /**
   * Release on the way out of the study screen.
   *
   * Non-negotiable: an engine left enabled against a view React has unmounted wedges
   * PluginHost, after which the plugin refuses to load at all until the device reboots.
   */
  useEffect(
    () => () => {
      deactivateInk();
    },
    [],
  );

  if (!card) {
    return (
      <View style={styles.centerBlock}>
        <Text style={styles.sectionTitle}>No Due Cards</Text>
        <Text style={styles.emptyText}>This deck is caught up.</Text>
      </View>
    );
  }

  const contextImage =
    card.contextImagePath && !contextImageFailed ? (
      <Image
        source={{uri: `file://${card.contextImagePath}`}}
        style={styles.studyImage}
        resizeMode="contain"
        onError={() => setContextImageFailed(true)}
      />
    ) : null;

  const questionBlock = (
    <>
      <Text style={styles.sectionHeading}>QUESTION</Text>
      {card.questionMode === 'image' && card.questionImagePath && !questionImageFailed ? (
        <Image
          source={{uri: `file://${card.questionImagePath}`}}
          style={styles.studyImage}
          resizeMode="contain"
          onError={() => setQuestionImageFailed(true)}
        />
      ) : (
        <Text style={styles.studyText}>{card.question}</Text>
      )}
      {card.contextImageSide === 'front' && contextImage}
      {!showAnswer && (card.hint?.trim() || card.hintImagePath) && (
        <>
          <View style={styles.divider} />
          {showHint ? (
            <>
              <Text style={styles.label}>Hint</Text>
              {card.hintMode === 'image' && card.hintImagePath && !hintImageFailed ? (
                <Image
                  source={{uri: `file://${card.hintImagePath}`}}
                  style={styles.studyImage}
                  resizeMode="contain"
                  onError={() => setHintImageFailed(true)}
                />
              ) : (
                <Text style={styles.studyText}>{card.hint}</Text>
              )}
            </>
          ) : (
            <Pressable onPress={onRevealHint} style={styles.linkButton}>
              <Text style={styles.linkButtonText}>Show Hint</Text>
            </Pressable>
          )}
        </>
      )}
    </>
  );

  const penLabel =
    INK_PEN_TYPES.find(pen => pen.id === penType)?.label ?? 'Pen';
  const colorLabel =
    INK_PEN_COLORS.find(colour => colour.value === penColor)?.label ?? 'Black';

  return (
    <View>
      <View style={styles.studyCard}>
        {/*
          While the engine is live nothing above the ink surface may change height —
          revealing a hint otherwise pushes the surface down, which makes the ink appear to
          jump and reallocates the engine's writing bitmap mid-session. Capped and given
          its own scroll instead.
        */}
        <View style={styles.studySection}>
          {inkMode ? (
            <ScrollView style={styles.questionScroll} nestedScrollEnabled>
              {questionBlock}
            </ScrollView>
          ) : (
            questionBlock
          )}
        </View>
        {/*
          The guess stays put when the answer appears: the answer renders BELOW it, so the
          ink surface neither moves nor resizes and the two can be compared side by side.
          Nothing is stored — the strokes live in the engine's buffer until the card is
          rated, at which point clearInk wipes them.
        */}
        <View style={styles.studySection}>
        <Text style={styles.sectionHeading}>YOUR GUESS</Text>
        {/*
          Everything the user can tap lives on ONE row above the writing area, and the grey
          rule below it is the top edge of what is writable. Show Answer sits at the end of
          that row opposite the writing hand — full width beneath the surface, a resting
          palm kept triggering it.
        */}
        {inkAvailable && !showAnswer ? (
          <View
            style={[
              styles.guessControls,
              hand === 'left' ? styles.guessControlsFlip : null,
            ]}>
            {inkMode ? (
              <Pressable onPress={onReveal} style={styles.revealButton}>
                <Text style={styles.revealButtonText}>Show Answer</Text>
              </Pressable>
            ) : (
              <View />
            )}
            <View style={styles.penRow}>
              {inkMode ? (
                <>
                  <Pressable onPress={onCyclePen} style={styles.penChip}>
                    <Text style={styles.penChipText}>{penLabel}</Text>
                  </Pressable>
                  <Pressable onPress={onCycleWidth} style={styles.penChip}>
                    <Text style={styles.penChipText}>{`${penWidth}`}</Text>
                  </Pressable>
                  <Pressable onPress={onCycleColor} style={styles.penChip}>
                    <Text style={styles.penChipText}>{colorLabel}</Text>
                  </Pressable>
                </>
              ) : null}
              <Pressable onPress={onToggleInk} style={styles.penChip}>
                <Text style={styles.penChipText}>
                  {inkMode ? 'Type instead' : 'Write instead'}
                </Text>
              </Pressable>
              <Pressable onPress={onToggleHand} style={styles.penChip}>
                <Text style={styles.penChipText}>
                  {hand === 'right' ? 'Right-handed' : 'Left-handed'}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {inkMode ? <View style={styles.inkBoundary} /> : null}

        {inkMode ? (
          <InkSurfaceView style={styles.inkSurface} />
        ) : !showAnswer ? (
          <TextInput
            value={guess}
            onChangeText={onGuessChange}
            multiline
            placeholder="Write or type your guess"
            placeholderTextColor="#74746c"
            style={[styles.input, styles.guessArea]}
          />
        ) : guess.trim() ? (
          <Text style={styles.studyText}>{guess}</Text>
        ) : (
          <Text style={styles.emptyText}>No guess recorded.</Text>
        )}
        </View>

        {showAnswer ? (
          <View style={styles.studySection}>
            <Text style={styles.sectionHeading}>ANSWER</Text>
            {card.answerMode === 'image' && card.answerImagePath && !answerImageFailed ? (
              <Image
                source={{uri: `file://${card.answerImagePath}`}}
                style={styles.studyImage}
                resizeMode="contain"
                onError={() => setAnswerImageFailed(true)}
              />
            ) : (
              <Text style={styles.studyText}>{card.answer}</Text>
            )}
            {card.contextImageSide === 'answer' && contextImage}
          </View>
        ) : null}
      </View>

      {!showAnswer && !inkMode ? (
        <PrimaryButton label="Show Answer" onPress={onReveal} />
      ) : !showAnswer ? null : (
        <View style={styles.ratingGrid}>
          {([Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as Grade[]).map(
            rating => (
              <Pressable
                key={rating}
                onPress={() => onRate(rating)}
                style={styles.ratingButton}>
                <Text style={styles.ratingText}>{ratingLabels[rating]}</Text>
              </Pressable>
            ),
          )}
        </View>
      )}
    </View>
  );
}

function DeckChooser({
  decks,
  selectedDeckId,
  onSelect,
}: {
  decks: Deck[];
  selectedDeckId: string;
  onSelect: (deckId: string) => void;
}) {
  return (
    <View style={styles.deckChooser}>
      {decks.map(deck => (
        <Pressable
          key={deck.id}
          onPress={() => onSelect(deck.id)}
          style={[
            styles.deckPill,
            deck.id === selectedDeckId && styles.deckPillSelected,
          ]}>
          <Text
            style={[
              styles.deckPillText,
              deck.id === selectedDeckId && styles.deckPillTextSelected,
            ]}>
            {deck.name}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function Stat({label, value}: {label: string; value: string}) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function PrimaryButton({label, onPress}: {label: string; onPress: () => void}) {
  return (
    <Pressable onPress={onPress} style={styles.primaryButton}>
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({label, onPress}: {label: string; onPress: () => void}) {
  return (
    <Pressable onPress={onPress} style={styles.secondaryButton}>
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

const formatDate = (value: string) => {
  const date = new Date(value);
  return date.toLocaleDateString();
};

const fileName = (path: string) => path.split('/').filter(Boolean).at(-1) ?? path;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f7f7f2',
  },
  header: {
    minHeight: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderColor: '#d7d7ce',
  },
  headerButton: {
    minWidth: 68,
    paddingVertical: 8,
  },
  headerButtonText: {
    fontSize: 16,
    color: '#25312d',
    fontWeight: '600',
  },
  title: {
    fontSize: 20,
    color: '#1e2522',
    fontWeight: '700',
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 24,
    color: '#25312d',
  },
  subHeader: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderColor: '#e0e0d8',
  },
  subTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#25312d',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  captureScreen: {
    paddingBottom: 360,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1e2522',
    marginBottom: 12,
  },
  rowCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d7d7ce',
    borderRadius: 8,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  selectedCard: {
    borderColor: '#4d685f',
    backgroundColor: '#edf3ef',
  },
  rowMain: {
    flex: 1,
  },
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  cardTile: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d7d7ce',
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
  },
  cardTileImage: {
    width: '100%',
    height: 130,
    borderRadius: 6,
    backgroundColor: '#eef0ea',
    marginBottom: 6,
  },
  cardTileTextBox: {
    width: '100%',
    height: 130,
    borderRadius: 6,
    backgroundColor: '#eef0ea',
    padding: 8,
    marginBottom: 6,
    justifyContent: 'center',
  },
  noteStatus: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#c9d5ce',
    borderRadius: 8,
    padding: 14,
    marginBottom: 14,
    gap: 8,
  },
  noteStatusTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1f2623',
  },
  noteStatusText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#4d534d',
  },
  noteStatusActions: {
    gap: 8,
    marginTop: 2,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1f2623',
    marginBottom: 4,
  },
  muted: {
    fontSize: 14,
    color: '#62665f',
  },
  warningText: {
    fontSize: 14,
    color: '#8f3e35',
    fontWeight: '700',
  },
  plainButton: {
    padding: 8,
  },
  formBlock: {
    gap: 10,
    marginTop: 18,
  },
  noteLinkBlock: {
    borderWidth: 1,
    borderColor: '#d7d7ce',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    padding: 14,
    gap: 10,
    marginBottom: 8,
  },
  inlineCreateBlock: {
    borderWidth: 1,
    borderColor: '#d7d7ce',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    padding: 14,
    gap: 10,
    marginTop: 12,
    marginBottom: 14,
  },
  blockTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1f2623',
  },
  createDeckRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  helperText: {
    fontSize: 13,
    color: '#62665f',
    marginTop: 6,
    marginBottom: 14,
  },
  imageSourceRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#c9d5ce',
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1f2623',
    marginBottom: 8,
  },
  capturedImageBanner: {
    backgroundColor: '#fff7e0',
    borderWidth: 1,
    borderColor: '#d8c67a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  createDeckInput: {
    flex: 1,
    minWidth: 0,
  },
  createDeckButton: {
    width: 104,
    borderRadius: 8,
    backgroundColor: '#263832',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  createDeckButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  checkboxRow: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#263832',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  checkboxChecked: {
    backgroundColor: '#263832',
  },
  checkboxMark: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 20,
  },
  checkboxText: {
    flex: 1,
    fontSize: 16,
    color: '#25312d',
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#bfc2b8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 17,
    color: '#1f2623',
  },
  textArea: {
    minHeight: 64,
    textAlignVertical: 'top',
    marginBottom: 8,
  },
  guessArea: {
    minHeight: 132,
    textAlignVertical: 'top',
    marginTop: 2,
  },
  // Capped so a hint reveal scrolls inside this box instead of pushing the ink surface
  // down — the engine must not see its host move or resize.
  questionScroll: {
    // FIXED, not maxHeight. A block that sizes to its content puts the ink surface at a
    // different Y on every card, and the engine's writable region is derived from the
    // host's position when it binds — which produced a dead band, then no writable area
    // at all on later cards.
    height: 200,
  },
  guessHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  penRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  guessControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  // Left-handers get Show Answer on the right instead, away from the writing hand.
  guessControlsFlip: {
    flexDirection: 'row-reverse',
  },
  // The top edge of the writable area, made explicit so it is not guessed at.
  inkBoundary: {
    height: 2,
    backgroundColor: '#9aa39c',
    marginBottom: 0,
  },
  revealButton: {
    backgroundColor: '#263832',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  revealButtonText: {
    color: '#f7f7f2',
    fontSize: 14,
    fontWeight: '700',
  },
  penChip: {
    borderColor: '#9aa39c',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginLeft: 6,
    marginBottom: 4,
  },
  penChipText: {
    fontSize: 13,
    color: '#1f2623',
  },
  // FIXED height, never flex: the engine sizes its writing bitmap from the host's measured
  // dimensions and must not be resized after binding.
  inkSurface: {
    height: 260,
    backgroundColor: '#ffffff',
    borderColor: '#9aa39c',
    borderWidth: 1,
    // No top border and no top margin: the boundary rule above IS the top edge, and a
    // second line there would just look like a gap the user cannot write in.
    borderTopWidth: 0,
    marginTop: 0,
    marginBottom: 4,
  },
  label: {
    fontSize: 14,
    color: '#4d534d',
    fontWeight: '700',
    marginBottom: 6,
  },
  primaryButton: {
    backgroundColor: '#263832',
    borderRadius: 8,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#263832',
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: '#263832',
    fontSize: 17,
    fontWeight: '700',
  },
  smallButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#c7c9c0',
  },
  smallButtonText: {
    color: '#263832',
    fontWeight: '700',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  statBox: {
    width: '48%',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d7d7ce',
    padding: 14,
  },
  statValue: {
    fontSize: 24,
    color: '#1e2522',
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 13,
    color: '#62665f',
    marginTop: 2,
  },
  actions: {
    gap: 10,
    marginBottom: 18,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  emptyText: {
    fontSize: 16,
    lineHeight: 23,
    color: '#4d534d',
  },
  pathText: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d7d7ce',
    borderRadius: 8,
    color: '#1f2623',
    fontSize: 15,
    lineHeight: 21,
    marginVertical: 12,
    padding: 12,
  },
  fileList: {
    marginTop: 14,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  deckChooser: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18,
  },
  deckPill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfc2b8',
  },
  deckPillSelected: {
    backgroundColor: '#263832',
    borderColor: '#263832',
  },
  deckPillText: {
    fontSize: 15,
    color: '#263832',
    fontWeight: '700',
  },
  deckPillTextSelected: {
    color: '#ffffff',
  },
  studyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d7d7ce',
    padding: 16,
    marginBottom: 16,
  },
  studyText: {
    fontSize: 22,
    lineHeight: 31,
    color: '#1e2522',
    marginBottom: 4,
  },
  studyImage: {
    width: '100%',
    height: 220,
    borderRadius: 8,
    backgroundColor: '#eef0ea',
    marginBottom: 8,
  },
  sideImagePreview: {
    width: '100%',
    height: 100,
    borderRadius: 8,
    backgroundColor: '#eef0ea',
    marginBottom: 8,
  },
  linkButton: {
    paddingVertical: 6,
    marginBottom: 10,
  },
  linkButtonText: {
    color: '#4d685f',
    fontSize: 14,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  divider: {
    height: 2,
    backgroundColor: '#1f2623',
    marginVertical: 14,
  },
  // Each study section gets a real boundary. On a 16-grey panel a 1px light grey rule is
  // effectively invisible, and Question/Guess/Answer ran together.
  studySection: {
    borderColor: '#1f2623',
    borderWidth: 2,
    borderRadius: 6,
    padding: 10,
    marginBottom: 10,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1f2623',
    letterSpacing: 1,
    marginBottom: 6,
  },
  ratingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  ratingButton: {
    width: '47%',
    minHeight: 52,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#263832',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingText: {
    color: '#263832',
    fontSize: 16,
    fontWeight: '800',
  },
  centerBlock: {
    alignItems: 'center',
    paddingVertical: 48,
  },
});

export default App;
