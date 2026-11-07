import { ShareIntentProvider } from 'expo-share-intent';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HomeScreen } from './src/screens/HomeScreen';

export default function App() {
  const scheme = useColorScheme();

  return (
    <ShareIntentProvider>
      <SafeAreaProvider>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <HomeScreen />
      </SafeAreaProvider>
    </ShareIntentProvider>
  );
}
