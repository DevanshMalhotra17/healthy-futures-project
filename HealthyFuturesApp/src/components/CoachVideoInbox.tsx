import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";
import { colors, radius, spacing, fonts } from "@/theme";
import { useAuth } from "@/state/AuthContext";
import {
  listCoachInbox,
  deleteVideo,
  streamUrl,
  PracticeVideo,
} from "@/api/videos";
import { PlayIcon } from "@/components/Icons";

function sizeLabel(bytes: number): string {
  const mb = bytes / 1_048_576;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

function whenLabel(iso: string): string {
  const then = new Date(iso).getTime();
  const hours = (Date.now() - then) / 3_600_000;
  if (hours < 1) return "just now";
  if (hours < 24) return `${Math.round(hours)}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

// Playback is auth-gated, so the token rides along as a header rather than in
// the url — a url with a token in it would leak through logs and history.
function Player({ video, token }: { video: PracticeVideo; token: string }) {
  const player = useVideoPlayer(
    { uri: streamUrl(video), headers: { Authorization: `Bearer ${token}` } },
    (p) => {
      p.loop = false;
    }
  );

  return <VideoView style={styles.player} player={player} allowsFullscreen nativeControls />;
}

export default function CoachVideoInbox() {
  const { token } = useAuth();
  const [videos, setVideos] = useState<PracticeVideo[]>([]);
  const [unwatched, setUnwatched] = useState(0);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const data = await listCoachInbox(token);
      setVideos(data.videos);
      setUnwatched(data.unwatched);
    } catch {
      // Nothing to show is a valid state; the section just stays hidden.
      setVideos([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  function confirmDelete(video: PracticeVideo) {
    Alert.alert(
      "Delete this clip?",
      `${video.student_name ?? "This student"}'s clip will be removed for good.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setBusyId(video.id);
            try {
              await deleteVideo(video.id, token);
              if (openId === video.id) setOpenId(null);
              await load();
            } catch {
              Alert.alert("Couldn't delete that clip. Try again.");
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  }

  if (loading || videos.length === 0) return null;

  return (
    <>
      <View style={styles.secLabelRow}>
        <Text style={styles.secLabel}>Practice clips</Text>
        {unwatched > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unwatched} new</Text>
          </View>
        )}
      </View>

      <View style={{ gap: spacing.sm }}>
        {videos.map((video) => {
          const open = openId === video.id;
          return (
            <View
              key={video.id}
              style={[styles.item, !video.viewed_at && styles.itemUnwatched]}
            >
              <Pressable
                style={styles.itemRow}
                onPress={() => setOpenId(open ? null : video.id)}
              >
                <View style={styles.playWrap}>
                  <PlayIcon size={13} color={colors.white} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>
                    {video.student_name ?? "Student"}
                    {!video.viewed_at && <Text style={styles.newDot}> ●</Text>}
                  </Text>
                  {video.caption ? (
                    <Text style={styles.caption} numberOfLines={2}>
                      {video.caption}
                    </Text>
                  ) : null}
                  <Text style={styles.meta}>
                    {whenLabel(video.created_at)} · {sizeLabel(video.byte_size)}
                  </Text>
                </View>
              </Pressable>

              {open && token && (
                <View style={styles.playerWrap}>
                  <Player video={video} token={token} />
                  <Pressable
                    style={styles.deleteBtn}
                    onPress={() => confirmDelete(video)}
                    disabled={busyId === video.id}
                  >
                    {busyId === video.id ? (
                      <ActivityIndicator size="small" color={colors.danger} />
                    ) : (
                      <Text style={styles.deleteBtnText}>Delete clip</Text>
                    )}
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  secLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  secLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.inkSoft,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  badge: {
    backgroundColor: colors.gold,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: { fontFamily: fonts.bodyExtraBold, fontSize: 9.5, color: colors.ink },

  item: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  itemUnwatched: { borderColor: colors.gold },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 11, padding: 13 },
  playWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.pitch,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.ink },
  newDot: { color: colors.gold, fontSize: 11 },
  caption: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.inkSoft,
    marginTop: 2,
    lineHeight: 16,
  },
  meta: { fontFamily: fonts.mono, fontSize: 9.5, color: colors.inkSoft, marginTop: 3 },

  playerWrap: { paddingHorizontal: 13, paddingBottom: 13 },
  player: {
    width: "100%",
    height: 200,
    borderRadius: radius.sm,
    backgroundColor: "#000",
  },
  deleteBtn: { marginTop: 10, alignSelf: "flex-start" },
  deleteBtnText: { fontFamily: fonts.bodyExtraBold, fontSize: 11.5, color: colors.danger },
});
