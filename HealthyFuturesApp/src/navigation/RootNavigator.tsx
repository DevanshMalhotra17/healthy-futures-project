import React, { useEffect, useRef, useState } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { colors, fonts } from "@/theme";
import {
  HomeIcon,
  GridIcon,
  CalendarIcon,
  ProfileIcon,
  MessageIcon,
  CheckIcon,
  DumbbellIcon,
} from "@/components/Icons";
import HomeScreen from "@/screens/HomeScreen";
import CoachHomeScreen from "@/screens/CoachHomeScreen";
import CoachRosterScreen from "@/screens/CoachRosterScreen";
import CoachCriteriaScreen from "@/screens/CoachCriteriaScreen";
import CompanionsScreen from "@/screens/CompanionsScreen";
import MessagesScreen from "@/screens/MessagesScreen";
import ScheduleScreen from "@/screens/ScheduleScreen";
import ProfileScreen from "@/screens/ProfileScreen";
import { useAuth } from "@/state/AuthContext";
import {
  registerForPush,
  onNudgeTapped,
  initialNudge,
  NudgePayload,
} from "@/utils/notifications";
import { registerPushToken, reportNudgeOpened } from "@/api/nudges";
import { getFaceEnrollment } from "@/api/face";
import MatchPhotoGate from "@/screens/MatchPhotoGate";

export type CompanionPanel = "soccer" | "nutrition" | "primefit" | "zenfit";

export type RootTabParamList = {
  Home: undefined;
  // `open` lets a nudge deep-link straight into one companion.
  Companions: { openSoccer?: boolean; open?: CompanionPanel } | undefined;
  Roster: undefined;
  LevelUp: undefined;
  Messages: undefined;
  Schedule: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

// Only these screens can be opened by a nudge, so a malformed or stale payload
// can't push the app somewhere that doesn't exist for this role.
const NUDGE_SCREENS: ReadonlySet<keyof RootTabParamList> = new Set([
  "Home",
  "Companions",
  "Schedule",
  "Messages",
]);

function useNudgeRouting(token: string | null, isCoach: boolean) {
  const navigation = useNavigation<any>();
  // A cold-start tap is replayed once; without this guard it would re-navigate
  // on every remount.
  const handledColdStart = useRef(false);

  useEffect(() => {
    if (!token || isCoach) return;
    let cancelled = false;

    registerForPush().then((result) => {
      if (cancelled || !result.ok) return;
      registerPushToken(
        result.registration.token,
        result.registration.platform,
        token
      ).catch(() => undefined);
    });

    return () => {
      cancelled = true;
    };
  }, [token, isCoach]);

  useEffect(() => {
    if (!token) return;

    const go = (payload: NudgePayload) => {
      const screen = payload.screen as keyof RootTabParamList | undefined;
      if (!screen || !NUDGE_SCREENS.has(screen)) return;
      if (payload.kind) reportNudgeOpened(payload.kind, token);
      navigation.navigate(screen as never, (payload.params ?? {}) as never);
    };

    if (!handledColdStart.current) {
      handledColdStart.current = true;
      initialNudge().then((payload) => {
        if (payload) go(payload);
      });
    }

    return onNudgeTapped(go);
  }, [token, navigation]);
}

export default function RootNavigator() {
  const { role, token } = useAuth();
  const isCoach = role === "coach";

  useNudgeRouting(token, isCoach);

  // A match photo is required for students. Enforced here rather than as a signup
  // field: face detection can fail on lighting or a turned head, and the analyser
  // is a separate host — a student must be able to retry, not be locked out of
  // registering at all.
  const [needsPhoto, setNeedsPhoto] = useState<boolean | null>(null);

  useEffect(() => {
    if (!token || isCoach) {
      setNeedsPhoto(false);
      return;
    }
    let cancelled = false;
    getFaceEnrollment(token)
      .then((data) => {
        if (!cancelled) setNeedsPhoto(!data.enrolled);
      })
      .catch(() => {
        // Can't tell right now; don't trap the student behind the gate.
        if (!cancelled) setNeedsPhoto(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, isCoach]);

  if (token && !isCoach && needsPhoto === true) {
    return <MatchPhotoGate onDone={() => setNeedsPhoto(false)} />;
  }

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.pitch,
        tabBarInactiveTintColor: colors.inkSoft,
        tabBarStyle: {
          backgroundColor: colors.paper,
          borderTopColor: colors.line,
          height: 82,
          paddingBottom: 20,
          paddingTop: 10,
        },
        tabBarLabelStyle: { fontFamily: fonts.bodyExtraBold, fontSize: 9.5 },
      }}
    >
      <Tab.Screen
        name="Home"
        component={isCoach ? CoachHomeScreen : HomeScreen}
        options={{ tabBarIcon: ({ color }) => <HomeIcon color={color} /> }}
      />
      {isCoach ? (
        <>
          <Tab.Screen
            name="Roster"
            component={CoachRosterScreen}
            options={{ tabBarIcon: ({ color }) => <GridIcon color={color} /> }}
          />
          <Tab.Screen
            name="LevelUp"
            component={CoachCriteriaScreen}
            options={{
              tabBarLabel: "Level up",
              tabBarIcon: ({ color }) => <CheckIcon size={19} color={color} strokeWidth={2.4} />,
            }}
          />
        </>
      ) : null}
      {/* Both roles: coaches use the companions themselves, and Soccer is where
          they upload match clips. */}
      <Tab.Screen
        name="Companions"
        component={CompanionsScreen}
        options={{ tabBarIcon: ({ color }) => <DumbbellIcon size={21} color={color} /> }}
      />
      <Tab.Screen
        name="Messages"
        component={MessagesScreen}
        options={{ tabBarIcon: ({ color }) => <MessageIcon color={color} /> }}
      />
      <Tab.Screen
        name="Schedule"
        component={ScheduleScreen}
        options={{ tabBarIcon: ({ color }) => <CalendarIcon color={color} /> }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarIcon: ({ color }) => <ProfileIcon color={color} /> }}
      />
    </Tab.Navigator>
  );
}
