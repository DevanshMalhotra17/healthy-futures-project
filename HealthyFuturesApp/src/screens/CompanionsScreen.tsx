import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, fonts } from "@/theme";
import { companions } from "@/data/mockData";
import CompanionCard from "@/components/CompanionCard";
import SoccerDetail from "@/components/SoccerDetail";
import NutritionDetail from "@/components/NutritionDetail";
import PrimeFitQuiz from "@/components/PrimeFitQuiz";
import ZenFitDetail from "@/components/ZenFitDetail";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { RootTabParamList } from "@/navigation/RootNavigator";

type Props = BottomTabScreenProps<RootTabParamList, "Companions">;
type OpenPanel = "soccer" | "nutrition" | "primefit" | "zenfit" | null;

export default function CompanionsScreen({ route }: Props) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState<OpenPanel>(null);

  useEffect(() => {
    if (route.params?.open) {
      setOpen(route.params.open);
    } else if (route.params?.openSoccer) {
      setOpen("soccer");
    }
  }, [route.params?.open, route.params?.openSoccer]);

  function toggle(panel: OpenPanel) {
    setOpen((current) => (current === panel ? null : panel));
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.container}>
        <Text style={styles.title}>Your companions</Text>

        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          <CompanionCard companion={companions[0]} layout="row" onPress={() => toggle("soccer")} />
          {open === "soccer" && <SoccerDetail />}

          <CompanionCard companion={companions[1]} layout="row" onPress={() => toggle("nutrition")} />
          {open === "nutrition" && <NutritionDetail />}

          <CompanionCard companion={companions[2]} layout="row" onPress={() => toggle("primefit")} />
          {open === "primefit" && <PrimeFitQuiz />}

          <CompanionCard companion={companions[3]} layout="row" onPress={() => toggle("zenfit")} />
          {open === "zenfit" && <ZenFitDetail />}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  container: { paddingHorizontal: spacing.lg },
  title: { fontFamily: fonts.display, fontSize: 23, color: colors.ink },
});
