/**
 * @format
 */

import {AppRegistry, Image} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

import { PluginManager } from 'sn-plugin-lib';

AppRegistry.registerComponent(appName, () => App);

PluginManager.init();

PluginManager.registerButton(1, ['NOTE', 'DOC'], {
  id: 100,
  name: 'Flashcards',
  icon: Image.resolveAssetSource(
    require('./assets/icon.png'),
  ).uri,
  showType: 1,
});

PluginManager.registerButton(2, ['NOTE', 'DOC'], {
  id: 200,
  name: 'Add Flashcard',
  icon: Image.resolveAssetSource(
    require('./assets/icon.png'),
  ).uri,
  editDataTypes: [0],
  showType: 1,
});

// Distinct from the button above: editDataTypes includes 2 (Image) so this
// button is also offered when the lasso selection is an inserted picture,
// not only handwritten strokes. Captures immediately with no target chosen
// yet; App.tsx shows a "use this as Context Image or Hint" prompt on the
// still-open card once the image lands. Kept to a single button (rather than
// one per target) since the lasso toolbar has limited, scrollable space.
PluginManager.registerButton(2, ['NOTE', 'DOC'], {
  id: 201,
  name: 'Add Image to Flashcard',
  icon: Image.resolveAssetSource(
    require('./assets/icon.png'),
  ).uri,
  editDataTypes: [0, 2],
  showType: 1,
});
