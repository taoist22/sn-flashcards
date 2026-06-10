import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import {Rating, type Grade} from 'ts-fsrs';
import {
  addCard,
  cardsForDeck,
  createDeck,
  deckStats,
  deleteCard,
  deleteDeck,
  dueCardsForDeck,
  importCards,
  loadDatabase,
  reviewCard,
  updateCard,
} from './src/services/store';
import {createDraftFromLasso, type OcrFlashcardDraft} from './src/services/lassoOcr';
import {getRetrievability, ratingLabels, stateLabel} from './src/services/fsrsScheduler';
import type {Deck, Flashcard, FlashcardDatabase} from './src/types/flashcards';
import {
  exportDeckToAnkiText,
  getImportDropFolder,
  listImportDropFolderFiles,
  parseCardText,
  readImportTextFile,
} from './src/services/ankiText';

const MAIN_BUTTON_ID = 100;
const LASSO_BUTTON_ID = 200;

type Screen = 'decks' | 'cards' | 'edit' | 'study' | 'capture' | 'import';

const emptyDraft: OcrFlashcardDraft = {
  question: '',
  answer: '',
};

function App(): React.JSX.Element {
  const [db, setDb] = useState<FlashcardDatabase | null>(null);
  const [screen, setScreen] = useState<Screen>('decks');
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<Flashcard | null>(null);
  const [draft, setDraft] = useState<OcrFlashcardDraft>(emptyDraft);
  const [captureLoading, setCaptureLoading] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [studyGuess, setStudyGuess] = useState('');
  const [newDeckName, setNewDeckName] = useState('');
  const [importFiles, setImportFiles] = useState<string[]>([]);
  const [importFolder, setImportFolder] = useState('');

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
    setDb(loaded);
    setSelectedDeckId(current => current ?? loaded.decks[0]?.id ?? null);
  }, []);

  const loadLassoDraft = useCallback(async () => {
    setCaptureLoading(true);
    setScreen('capture');
    setDraft(emptyDraft);
    try {
      const nextDraft = await createDraftFromLasso();
      setDraft(nextDraft);
    } catch (error) {
      setDraft(emptyDraft);
      Alert.alert(
        'Could not read handwriting',
        error instanceof Error ? error.message : 'Try lassoing the two lines again.',
      );
    } finally {
      setCaptureLoading(false);
    }
  }, []);

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
        if (event.id === MAIN_BUTTON_ID) {
          setScreen('decks');
        }
      },
    });

    return () => subscription.remove();
  }, [loadLassoDraft]);

  const close = () => {
    PluginManager.closePluginView();
  };

  const requireDb = () => {
    if (!db) {
      throw new Error('Database is still loading.');
    }
    return db;
  };

  const saveDeck = async () => {
    const next = await createDeck(requireDb(), newDeckName);
    setDb(next);
    setNewDeckName('');
  };

  const removeDeck = async (deck: Deck) => {
    const next = await deleteDeck(requireDb(), deck.id);
    setDb(next);
    setSelectedDeckId(next.decks[0]?.id ?? null);
  };

  const saveDraftCard = async () => {
    if (!selectedDeck || !draft.question.trim() || !draft.answer.trim()) {
      Alert.alert('Question and answer needed', 'Add both sides before saving.');
      return;
    }
    const next = await addCard(requireDb(), {
      deckId: selectedDeck.id,
      question: draft.question,
      answer: draft.answer,
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
      setImportFiles([]);
      setImportFolder(dropFolder);
      setScreen('import');
    }
  };

  const importTextDeck = async (path: string) => {
    try {
      const fallbackDeckName = selectedDeck?.name ?? 'Imported';
      const picked = await readImportTextFile(path);

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
    } catch (error) {
      Alert.alert(
        'Import failed',
        error instanceof Error ? error.message : 'Could not import that file.',
      );
    }
  };

  const rateStudyCard = async (rating: Grade) => {
    if (!activeStudyCard) {
      return;
    }
    const next = await reviewCard(requireDb(), activeStudyCard.id, rating);
    setDb(next);
    setShowAnswer(false);
    setStudyGuess('');
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

      <ScrollView contentContainerStyle={styles.content}>
        {screen === 'decks' && (
          <DeckScreen
            db={db}
            selectedDeckId={selectedDeck.id}
            newDeckName={newDeckName}
            onNewDeckName={setNewDeckName}
            onCreateDeck={saveDeck}
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
            loading={captureLoading}
            onChangeDraft={setDraft}
            onSelectDeck={setSelectedDeckId}
            onSave={saveDraftCard}
          />
        )}

        {screen === 'edit' && editingCard && (
          <EditScreen
            card={editingCard}
            decks={db.decks}
            onChange={setEditingCard}
            onSave={saveEditedCard}
          />
        )}

        {screen === 'study' && (
          <StudyScreen
            card={activeStudyCard}
            showAnswer={showAnswer}
            guess={studyGuess}
            onGuessChange={setStudyGuess}
            onReveal={() => {
              setStudyGuess('');
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
  onImport,
}: {
  files: string[];
  folder: string;
  onRefresh: () => void;
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

function DeckScreen({
  db,
  selectedDeckId,
  newDeckName,
  onNewDeckName,
  onCreateDeck,
  onSelectDeck,
  onDeleteDeck,
}: {
  db: FlashcardDatabase;
  selectedDeckId: string;
  newDeckName: string;
  onNewDeckName: (name: string) => void;
  onCreateDeck: () => void;
  onSelectDeck: (deck: Deck) => void;
  onDeleteDeck: (deck: Deck) => void;
}) {
  return (
    <View>
      <Text style={styles.sectionTitle}>Decks</Text>
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

      <View style={styles.formBlock}>
        <TextInput
          value={newDeckName}
          onChangeText={onNewDeckName}
          placeholder="New deck name"
          placeholderTextColor="#74746c"
          style={styles.input}
        />
        <PrimaryButton label="Create Deck" onPress={onCreateDeck} />
      </View>
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
        cards.map(card => {
          const retention = getRetrievability(card.fsrs);
          return (
            <View key={card.id} style={styles.rowCard}>
              <Pressable style={styles.rowMain} onPress={() => onEdit(card)}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {card.question}
                </Text>
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
        })
      )}
    </View>
  );
}

function CaptureScreen({
  draft,
  decks,
  selectedDeckId,
  loading,
  onChangeDraft,
  onSelectDeck,
  onSave,
}: {
  draft: OcrFlashcardDraft;
  decks: Deck[];
  selectedDeckId: string;
  loading: boolean;
  onChangeDraft: (draft: OcrFlashcardDraft) => void;
  onSelectDeck: (deckId: string) => void;
  onSave: () => void;
}) {
  return (
    <View>
      <Text style={styles.sectionTitle}>Add Flashcard</Text>
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator />
          <Text style={styles.muted}>Reading handwriting...</Text>
        </View>
      ) : null}

      <Text style={styles.label}>Question</Text>
      <TextInput
        value={draft.question}
        onChangeText={question => onChangeDraft({...draft, question})}
        multiline
        placeholder="Question"
        placeholderTextColor="#74746c"
        style={[styles.input, styles.textArea]}
      />

      <Text style={styles.label}>Answer</Text>
      <TextInput
        value={draft.answer}
        onChangeText={answer => onChangeDraft({...draft, answer})}
        multiline
        placeholder="Answer"
        placeholderTextColor="#74746c"
        style={[styles.input, styles.textArea]}
      />

      <Text style={styles.label}>Deck</Text>
      <DeckChooser decks={decks} selectedDeckId={selectedDeckId} onSelect={onSelectDeck} />
      <PrimaryButton label="Add Flashcard" onPress={onSave} />
    </View>
  );
}

function EditScreen({
  card,
  decks,
  onChange,
  onSave,
}: {
  card: Flashcard;
  decks: Deck[];
  onChange: (card: Flashcard) => void;
  onSave: () => void;
}) {
  return (
    <View>
      <Text style={styles.sectionTitle}>Edit Card</Text>
      <Text style={styles.label}>Question</Text>
      <TextInput
        value={card.question}
        onChangeText={question => onChange({...card, question})}
        multiline
        style={[styles.input, styles.textArea]}
      />
      <Text style={styles.label}>Answer</Text>
      <TextInput
        value={card.answer}
        onChangeText={answer => onChange({...card, answer})}
        multiline
        style={[styles.input, styles.textArea]}
      />
      <Text style={styles.label}>Deck</Text>
      <DeckChooser
        decks={decks}
        selectedDeckId={card.deckId}
        onSelect={deckId => onChange({...card, deckId})}
      />
      <PrimaryButton label="Save Changes" onPress={onSave} />
    </View>
  );
}

function StudyScreen({
  card,
  showAnswer,
  guess,
  onGuessChange,
  onReveal,
  onRate,
}: {
  card: Flashcard | null;
  showAnswer: boolean;
  guess: string;
  onGuessChange: (guess: string) => void;
  onReveal: () => void;
  onRate: (rating: Grade) => void;
}) {
  if (!card) {
    return (
      <View style={styles.centerBlock}>
        <Text style={styles.sectionTitle}>No Due Cards</Text>
        <Text style={styles.emptyText}>This deck is caught up.</Text>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.studyCard}>
        <Text style={styles.label}>Question</Text>
        <Text style={styles.studyText}>{card.question}</Text>
        {!showAnswer ? (
          <>
            <View style={styles.divider} />
            <Text style={styles.label}>Guess</Text>
            <TextInput
              value={guess}
              onChangeText={onGuessChange}
              multiline
              placeholder="Write or type your guess"
              placeholderTextColor="#74746c"
              style={[styles.input, styles.guessArea]}
            />
          </>
        ) : (
          <>
            <View style={styles.divider} />
            <Text style={styles.label}>Answer</Text>
            <Text style={styles.studyText}>{card.answer}</Text>
          </>
        )}
      </View>

      {!showAnswer ? (
        <PrimaryButton label="Show Answer" onPress={onReveal} />
      ) : (
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
    minHeight: 104,
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  guessArea: {
    minHeight: 132,
    textAlignVertical: 'top',
    marginTop: 2,
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
  divider: {
    height: 1,
    backgroundColor: '#d7d7ce',
    marginVertical: 16,
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
