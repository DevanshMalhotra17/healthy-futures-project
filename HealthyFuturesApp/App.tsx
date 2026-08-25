import React, { useCallback } from "react";
import { View, StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import {
  useFonts as useFraunces,
  Fraunces_500Medium,
  Fraunces_600SemiBold,
} from "@expo-google-fonts/fraunces";
import {
  useFonts as useManrope,
  Manrope_500Medium,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from "@expo-google-fonts/manrope";
import {
  useFonts as usePlexMono,
  IBMPlexMono_500Medium,
} from "@expo-google-fonts/ibm-plex-mono";
import { colors } from "@/theme";
import { AuthProvider } from "@/state/AuthContext";
import RootNavigator from "@/navigation/RootNavigator";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [frauncesLoaded] = useFraunces({ Fraunces_500Medium, Fraunces_600SemiBold });
  const [manropeLoaded] = useManrope({ Manrope_500Medium, Manrope_700Bold, Manrope_800ExtraBold });
  const [plexMonoLoaded] = usePlexMono({ IBMPlexMono_500Medium });

  const fontsLoaded = frauncesLoaded && manropeLoaded && plexMonoLoaded;

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <View style={styles.fill} onLayout={onLayoutRootView}>
        <StatusBar style="dark" />
        <AuthProvider>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
        </AuthProvider>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.paper },
});
