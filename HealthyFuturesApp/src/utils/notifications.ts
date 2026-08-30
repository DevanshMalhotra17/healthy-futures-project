import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";

// Show the banner even when the app is foregrounded — a nudge the student never
// sees is worse than useless, it silently burns the daily allowance.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Remote push was removed from Expo Go on Android in SDK 53. On that
// combination registration will always fail, so tell the caller up front rather
// than surfacing a confusing permissions error.
export function pushSupported(): boolean {
  const inExpoGo = Constants.appOwnership === "expo";
  return !(inExpoGo && Platform.OS === "android");
}

export type PushRegistration = { token: string; platform: string };

export async function registerForPush(): Promise<
  { ok: true; registration: PushRegistration } | { ok: false; reason: string }
> {
  if (!pushSupported()) {
    return {
      ok: false,
      reason:
        "Expo Go on Android can't receive push notifications. Use a development build to test nudges.",
    };
  }

  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.granted;
  if (!granted && existing.canAskAgain) {
    const asked = await Notifications.requestPermissionsAsync();
    granted = asked.granted;
  }
  if (!granted) {
    return { ok: false, reason: "Notifications are turned off for this app." };
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("nudges", {
      name: "Reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: "default",
    });
  }

  // projectId is required for Expo's push service to mint a token.
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as any).easConfig?.projectId;

  try {
    const result = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    return { ok: true, registration: { token: result.data, platform: Platform.OS } };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? error.message
          : "Couldn't get a push token for this device.",
    };
  }
}

export type NudgePayload = {
  kind?: string;
  screen?: string;
  params?: Record<string, unknown>;
};

export function payloadFrom(
  notification: Notifications.NotificationResponse
): NudgePayload {
  const data = notification.notification.request.content.data ?? {};
  return {
    kind: typeof data.kind === "string" ? data.kind : undefined,
    screen: typeof data.screen === "string" ? data.screen : undefined,
    params:
      data.params && typeof data.params === "object"
        ? (data.params as Record<string, unknown>)
        : undefined,
  };
}

// Fires when the student taps a nudge while the app is running.
export function onNudgeTapped(
  handler: (payload: NudgePayload) => void
): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    handler(payloadFrom(response));
  });
  return () => sub.remove();
}

// The tap that cold-started the app; returns null on a normal launch.
export async function initialNudge(): Promise<NudgePayload | null> {
  const response = await Notifications.getLastNotificationResponseAsync();
  return response ? payloadFrom(response) : null;
}
