import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { colors, fonts } from "@/theme";
import { HomeIcon, GridIcon, CalendarIcon, ProfileIcon, MessageIcon } from "@/components/Icons";
import HomeScreen from "@/screens/HomeScreen";
import CoachHomeScreen from "@/screens/CoachHomeScreen";
import CoachRosterScreen from "@/screens/CoachRosterScreen";
import CompanionsScreen from "@/screens/CompanionsScreen";
import MessagesScreen from "@/screens/MessagesScreen";
import ScheduleScreen from "@/screens/ScheduleScreen";
import ProfileScreen from "@/screens/ProfileScreen";
import { useAuth } from "@/state/AuthContext";

export type RootTabParamList = {
  Home: undefined;
  Companions: { openSoccer?: boolean } | undefined;
  Roster: undefined;
  Messages: undefined;
  Schedule: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

export default function RootNavigator() {
  const { role } = useAuth();
  const isCoach = role === "coach";

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
        <Tab.Screen
          name="Roster"
          component={CoachRosterScreen}
          options={{ tabBarIcon: ({ color }) => <GridIcon color={color} /> }}
        />
      ) : (
        <Tab.Screen
          name="Companions"
          component={CompanionsScreen}
          options={{ tabBarIcon: ({ color }) => <GridIcon color={color} /> }}
        />
      )}
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
